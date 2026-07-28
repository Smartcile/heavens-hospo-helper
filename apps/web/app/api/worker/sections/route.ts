import { NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'

export async function GET() {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'ADMIN' && session.role !== 'MANAGER')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const sections = await prisma.section.findMany({
    where: { venueId: session.venueId, deletedAt: null },
    select: { id: true, name: true, departmentId: true, venueId: true },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(sections)
}
