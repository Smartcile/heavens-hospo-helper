import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { attachTargets, type StepLinkRow } from '@/lib/guide-links'
import { buildTargetIndex } from '@/lib/guide-links.server'
import { mergeStepImages } from '@/lib/guide-media'
import { annotationForUrl, guideStepUsageKey, normaliseAnnotation, type ImageAnnotationLayer } from '@/lib/image-annotations'
import { sanitiseColumns } from '@/lib/reference-table'
import { buildPdfTable } from '@/lib/reference-table.server'
import { richTextToPlainText } from '@/lib/rich-text'
import {
  generateGuidePdf,
  guidePdfToBuffer,
  guidePdfFilename,
  loadImageDataUrl,
  type GuidePdfData,
  type GuidePdfLink,
} from '@/lib/guide-pdf'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, _req, 'training.playbook.view')
  if (denied) return denied

  const guide = await prisma.guide.findUnique({
    where: { id: params.id },
    include: {
      venue: { select: { name: true } },
      steps: { orderBy: { order: 'asc' }, include: { links: true } },
      tableRows: { orderBy: { sortOrder: 'asc' } },
    },
  })
  if (!guide || guide.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && guide.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const links = guide.steps.flatMap((s) => s.links as StepLinkRow[])
  const targetIndex = links.length ? await buildTargetIndex(links) : new Map<string, never>()

  const annotationRows = guide.steps.length
    ? await prisma.imageAnnotation.findMany({
        where: { usageKey: { in: guide.steps.map((s) => guideStepUsageKey(s.id)) }, deletedAt: null },
        select: { usageKey: true, imageUrl: true, data: true },
      })
    : []
  const layersForStep = (stepId: string): ImageAnnotationLayer[] => {
    const key = guideStepUsageKey(stepId)
    return annotationRows
      .filter((r) => r.usageKey === key)
      .map((r) => ({ imageUrl: r.imageUrl, data: normaliseAnnotation(r.data) }))
  }

  const steps: GuidePdfData['steps'] = []
  for (const s of guide.steps) {
    const resolved = attachTargets(s.links as StepLinkRow[], targetIndex)
    const images = mergeStepImages(s.imageUrls, s.imageUrl)
    const layers = layersForStep(s.id)
    const loaded = await Promise.all(
      images.map(async (u) => ({
        dataUrl: await loadImageDataUrl(u),
        annotations: annotationForUrl(layers, u),
      })),
    )
    const stepImages = loaded
      .filter((i) => !!i.dataUrl)
      .map((i) => ({ dataUrl: i.dataUrl as string, annotations: i.annotations }))
    const links: GuidePdfLink[] = await Promise.all(
      resolved.map(async (l) => ({
        kind: l.kind,
        label: l.target.label,
        note: l.note,
        qty: l.qty,
        sub: l.target.sub,
        missing: l.target.missing,
        imageDataUrl: await loadImageDataUrl(l.target.imageUrl),
      })),
    )
    steps.push({
      heading: s.heading,
      content: s.content,
      videoUrl: s.videoUrl,
      videoPath: s.videoPath,
      links,
      images: stepImages,
    })
  }

  const table = await buildPdfTable(
    sanitiseColumns(guide.tableColumns),
    guide.tableRows,
  )

  const data: GuidePdfData = {
    venueName: guide.venue.name,
    title: guide.title,
    description: guide.description,
    category: guide.category,
    guideType: guide.guideType,
    body: richTextToPlainText(guide.bodyHtml),
    requiresSignOff: guide.requiresSignOff,
    isTracked: guide.isTracked,
    steps,
    table,
  }

  const buffer = guidePdfToBuffer(generateGuidePdf(data))
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${guidePdfFilename(guide.title)}"`,
    },
  })
}
