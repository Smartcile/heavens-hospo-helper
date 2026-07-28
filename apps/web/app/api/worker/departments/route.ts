import { NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'

export async function GET() {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'ADMIN' && session.role !== 'MANAGER')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const departments = await prisma.department.findMany({
    where: { venueId: session.venueId, deletedAt: null },
    select: { id: true, name: true, venueId: true, colour: true },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(departments)
}
