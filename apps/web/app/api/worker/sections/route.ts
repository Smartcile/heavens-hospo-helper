import { NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { workerTaskAccess } from '@/lib/worker-task-access.server'

export async function GET() {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await workerTaskAccess(session)
  if (!access.canAuthor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const sections = await prisma.section.findMany({
    where: { venueId: session.venueId, deletedAt: null },
    select: { id: true, name: true, departmentId: true, venueId: true },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(sections)
}
