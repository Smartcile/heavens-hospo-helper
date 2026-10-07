import { NextRequest, NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { workerGuideAccess } from '@/lib/worker-guide-access'
import { resolveStepLinks } from '@/lib/guide-links.server'
import { loadMenuItemIndex } from '@/lib/reference-table.server'
import { prisma } from '@hospo-ops/db'

interface Params {
  params: { id: string }
}

// Read-only single guide for the worker popup. Any PUBLISHED guide in the
// worker's own venue can be opened this way (a step link may point at a guide
// that does not apply to this person), so it does not use resolveStaffGuides.
// Drafts stay hidden unless the caller can edit.
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const guide = await prisma.guide.findUnique({
    where: { id: params.id },
    include: {
      steps: { orderBy: { order: 'asc' }, include: { links: true } },
      tableRows: { orderBy: { sortOrder: 'asc' } },
    },
  })
  if (!guide || guide.deletedAt || guide.venueId !== session.venueId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (guide.status !== 'PUBLISHED') {
    const access = await workerGuideAccess(session)
    if (!access.canEdit) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // One batched resolve for the whole guide (mirrors the admin route).
  const allLinks = guide.steps.flatMap((s) => s.links)
  const [resolved, menuIndex] = await Promise.all([
    resolveStepLinks(allLinks),
    loadMenuItemIndex(guide.tableRows.map((r) => r.menuItemId)),
  ])
  const byId = new Map(resolved.map((l) => [l.id, l]))

  return NextResponse.json({
    ...guide,
    steps: guide.steps.map((s) => ({
      ...s,
      links: s.links.map((l) => byId.get(l.id)).filter(Boolean),
    })),
    tableRows: guide.tableRows.map((r) => ({
      ...r,
      menuItem: r.menuItemId ? menuIndex.get(r.menuItemId) ?? null : null,
    })),
  })
}
