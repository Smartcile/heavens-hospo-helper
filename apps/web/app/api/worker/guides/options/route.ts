import { NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { workerGuideAccess } from '@/lib/worker-guide-access'
import { prisma } from '@hospo-ops/db'

// Everything the worker guide editor needs to populate its pickers, in one call
// (the admin menu/department endpoints are grant-gated and a floor manager may
// not hold them). Empty lists when the caller cannot edit.
export async function GET() {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await workerGuideAccess(session)
  if (!access.canEdit) {
    return NextResponse.json({ canEdit: false, canPublish: access.canPublish, departments: [], tasks: [] })
  }

  const [departments, tasks] = await Promise.all([
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
  ])

  return NextResponse.json({
    canEdit: access.canEdit,
    canPublish: access.canPublish,
    departments,
    tasks: tasks.map((t) => ({ id: t.id, title: t.title, departmentId: t.departmentId })),
  })
}
