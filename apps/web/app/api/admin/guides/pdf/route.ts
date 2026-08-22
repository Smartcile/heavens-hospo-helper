import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { attachTargets, type StepLinkRow } from '@/lib/guide-links'
import { buildTargetIndex } from '@/lib/guide-links.server'
import {
  mergedGuidePdf,
  guidePdfToBuffer,
  guidePdfFilename,
  loadImageDataUrl,
  type GuidePdfData,
} from '@/lib/guide-pdf'

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
    },
    orderBy: [{ isOnboarding: 'desc' }, { title: 'asc' }],
  })
  if (guides.length === 0) return NextResponse.json({ error: 'No guides found' }, { status: 404 })

  const allLinks = guides.flatMap((g) => g.steps.flatMap((s) => s.links as StepLinkRow[]))
  const targetIndex = allLinks.length ? await buildTargetIndex(allLinks) : new Map<string, never>()

  const pages: GuidePdfData[] = []
  for (const g of guides) {
    const steps: GuidePdfData['steps'] = []
    for (const s of g.steps) {
      const resolved = attachTargets(s.links as StepLinkRow[], targetIndex)
      steps.push({
        heading: s.heading,
        content: s.content,
        videoUrl: s.videoUrl,
        links: resolved.map((l) => ({ kind: l.kind, label: l.target.label, note: l.note })),
        imageDataUrl: await loadImageDataUrl(s.imageUrl),
      })
    }
    pages.push({
      venueName: g.venue.name,
      title: g.title,
      description: g.description,
      category: g.category,
      requiresSignOff: g.requiresSignOff,
      steps,
    })
  }

  const buffer = guidePdfToBuffer(mergedGuidePdf(guides[0].venue.name, pages))
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${guidePdfFilename(`PLAYBOOK - ${guides.length} GUIDES`)}"`,
    },
  })
}
