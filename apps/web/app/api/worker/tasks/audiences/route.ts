import { NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { workerTaskAccess } from '@/lib/worker-task-access.server'

// Searchable audience options for the worker checklist editor (authoring-gated).
export async function GET() {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await workerTaskAccess(session)
  if (!access.canAuthor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [departments, sections, positions] = await Promise.all([
    prisma.department.findMany({
      where: { venueId: session.venueId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.section.findMany({
      where: { venueId: session.venueId, deletedAt: null },
      select: { id: true, name: true, departmentId: true },
      orderBy: { name: 'asc' },
    }),
    prisma.position.findMany({
      where: { venueId: session.venueId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return NextResponse.json({ departments, sections, positions })
}
