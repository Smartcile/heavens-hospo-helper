import { NextRequest, NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { workerGuideAccess } from '@/lib/worker-guide-access'
import { prisma } from '@hospo-ops/db'

/**
 * PUT /api/worker/guide-folders
 *
 * Reorder the venue's playbook folders — the worker app's folder drag-and-drop.
 * `{ orderedIds }` is the full folder order; sortOrder is set from the array
 * index so the two views (admin + worker) read the same order.
 */
export async function PUT(req: NextRequest) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await workerGuideAccess(session)
  if (!access.canEdit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const orderedIds: unknown = body.orderedIds
  if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== 'string')) {
    return NextResponse.json({ error: 'orderedIds must be an array of ids' }, { status: 400 })
  }
  if (orderedIds.length === 0) return NextResponse.json({ ok: true })

  const rows = await prisma.guideFolder.findMany({
    where: { id: { in: orderedIds as string[] }, venueId: session.venueId, deletedAt: null },
    select: { id: true },
  })
  if (rows.length !== orderedIds.length) {
    return NextResponse.json({ error: 'Folder not found' }, { status: 400 })
  }

  await prisma.$transaction(
    (orderedIds as string[]).map((id, index) =>
      prisma.guideFolder.update({ where: { id }, data: { sortOrder: index } }),
    ),
  )

  return NextResponse.json({ ok: true })
}
