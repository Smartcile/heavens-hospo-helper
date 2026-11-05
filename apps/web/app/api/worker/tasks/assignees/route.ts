import { NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { workerTaskAccess } from '@/lib/worker-task-access.server'

// Searchable "assigned to" options for the worker task editor (authoring-gated).
export async function GET() {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await workerTaskAccess(session)
  if (!access.canAuthor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const staff = await prisma.staff.findMany({
    where: { venueId: session.venueId, deletedAt: null, isActive: true },
    select: { id: true, firstName: true, lastName: true, role: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  })

  return NextResponse.json(
    staff.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`.trim(), role: s.role })),
  )
}
