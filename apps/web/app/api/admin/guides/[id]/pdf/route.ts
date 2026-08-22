import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { attachTargets, type StepLinkRow } from '@/lib/guide-links'
import { buildTargetIndex } from '@/lib/guide-links.server'
import {
  generateGuidePdf,
  guidePdfToBuffer,
  guidePdfFilename,
  loadImageDataUrl,
  type GuidePdfData,
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
    },
  })
  if (!guide || guide.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && guide.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const links = guide.steps.flatMap((s) => s.links as StepLinkRow[])
  const targetIndex = links.length ? await buildTargetIndex(links) : new Map<string, never>()

  const steps: GuidePdfData['steps'] = []
  for (const s of guide.steps) {
    const resolved = attachTargets(s.links as StepLinkRow[], targetIndex)
    steps.push({
      heading: s.heading,
      content: s.content,
      videoUrl: s.videoUrl,
      links: resolved.map((l) => ({ kind: l.kind, label: l.target.label, note: l.note })),
      imageDataUrl: await loadImageDataUrl(s.imageUrl),
    })
  }

  const data: GuidePdfData = {
    venueName: guide.venue.name,
    title: guide.title,
    description: guide.description,
    category: guide.category,
    requiresSignOff: guide.requiresSignOff,
    steps,
  }

  const buffer = guidePdfToBuffer(generateGuidePdf(data))
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${guidePdfFilename(guide.title)}"`,
    },
  })
}
