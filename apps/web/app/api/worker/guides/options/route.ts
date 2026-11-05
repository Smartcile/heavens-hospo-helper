import { NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { workerGuideAccess } from '@/lib/worker-guide-access'
import { loadGuideLinkTargets } from '@/lib/guide-link-targets.server'
import { prisma } from '@hospo-ops/db'

const EMPTY_LINK_TARGETS = {
  ITEM: [], TASK: [], CHECKLIST: [], GUIDE: [], SECTION: [], RECIPE: [],
}

// Everything the worker guide editor needs to populate its pickers, in one call
// (the admin menu/department endpoints are grant-gated and a floor manager may
// not hold them). Empty lists when the caller cannot edit.
export async function GET() {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await workerGuideAccess(session)
  if (!access.canEdit) {
    return NextResponse.json({
      canEdit: false,
      canPublish: access.canPublish,
      departments: [],
      tasks: [],
      positions: [],
      linkTargets: EMPTY_LINK_TARGETS,
    })
  }

  const [departments, tasks, positions, targets] = await Promise.all([
    prisma.department.findMany({
      where: { venueId: session.venueId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.task.findMany({
      where: { venueId: session.venueId, deletedAt: null },
      select: { id: true, title: true, departmentId: true },
      orderBy: { title: 'asc' },
    }),
    prisma.position.findMany({
      where: { venueId: session.venueId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    loadGuideLinkTargets(session.venueId),
  ])

  return NextResponse.json({
    canEdit: access.canEdit,
    canPublish: access.canPublish,
    departments,
    tasks: tasks.map((t) => ({ id: t.id, title: t.title, departmentId: t.departmentId })),
    positions,
    // The worker editor only links the six step kinds — MENU_ITEM/MENU belong
    // to the admin product-reference table and are dropped from this payload.
    linkTargets: {
      ITEM: targets.ITEM,
      TASK: targets.TASK,
      CHECKLIST: targets.CHECKLIST,
      GUIDE: targets.GUIDE,
      SECTION: targets.SECTION,
      RECIPE: targets.RECIPE,
    },
  })
}
