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
  mergedGuidePdf,
  guidePdfToBuffer,
  guidePdfFilename,
  loadGuideAttachmentBuffer,
  loadImageDataUrl,
  type GuidePdfData,
  type GuidePdfLink,
} from '@/lib/guide-pdf'
import { mergePdfBuffers } from '@/lib/gift-card-template'

// PDF export for a GROUP of guides — `?ids=a,b,c` (or every published guide
// for the venue when ids is omitted). One merged PDF, each guide on its own
// page, in the order the worker bible lists them.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'training.playbook.view')
  if (denied) return denied

  const venueId =
    session.user.role === 'MANAGER'
      ? session.user.venueId
      : new URL(req.url).searchParams.get('venueId')
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  const ids = (new URL(req.url).searchParams.get('ids') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const guides = await prisma.guide.findMany({
    where: { venueId, deletedAt: null, ...(ids.length ? { id: { in: ids } } : {}) },
    include: {
      venue: { select: { name: true } },
      steps: { orderBy: { order: 'asc' }, include: { links: true } },
      tableRows: { orderBy: { sortOrder: 'asc' } },
    },
    orderBy: [{ isOnboarding: 'desc' }, { title: 'asc' }],
  })
  if (guides.length === 0) return NextResponse.json({ error: 'No guides found' }, { status: 404 })

  const allLinks = guides.flatMap((g) => g.steps.flatMap((s) => s.links as StepLinkRow[]))
  const targetIndex = allLinks.length ? await buildTargetIndex(allLinks) : new Map<string, never>()

  const allSteps = guides.flatMap((g) => g.steps)
  const annotationRows = allSteps.length
    ? await prisma.imageAnnotation.findMany({
        where: { usageKey: { in: allSteps.map((s) => guideStepUsageKey(s.id)) }, deletedAt: null },
        select: { usageKey: true, imageUrl: true, data: true },
      })
    : []
  const layersForStep = (stepId: string): ImageAnnotationLayer[] => {
    const key = guideStepUsageKey(stepId)
    return annotationRows
      .filter((r) => r.usageKey === key)
      .map((r) => ({ imageUrl: r.imageUrl, data: normaliseAnnotation(r.data) }))
  }

  const pages: GuidePdfData[] = []
  for (const g of guides) {
    const steps: GuidePdfData['steps'] = []
    for (const s of g.steps) {
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
    pages.push({
      venueName: g.venue.name,
      title: g.title,
      description: g.description,
      category: g.category,
      guideType: g.guideType,
      body: richTextToPlainText(g.bodyHtml),
      requiresSignOff: g.requiresSignOff,
      isTracked: g.isTracked,
      steps,
      table: await buildPdfTable(sanitiseColumns(g.tableColumns), g.tableRows),
    })
  }

  // One PDF for the whole selection, then any guide-level attachments appended
  // after the generated pages (in guide order).
  const master = Buffer.from(guidePdfToBuffer(mergedGuidePdf(guides[0].venue.name, pages)))
  const attachments: Buffer[] = []
  for (const g of guides) {
    const attachment = await loadGuideAttachmentBuffer(g.pdfPath)
    if (attachment) attachments.push(attachment)
  }
  const buffer = attachments.length ? await mergePdfBuffers([master, ...attachments]) : master
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${guidePdfFilename(`PLAYBOOK - ${guides.length} GUIDES`)}"`,
    },
  })
}
