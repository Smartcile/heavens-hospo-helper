import { NextRequest, NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { getStaffTraining } from '@/lib/training'
import { prisma } from '@hospo-ops/db'

export async function GET(req: NextRequest) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (req.nextUrl.searchParams.get('edit') === '1') {
    if (session.role !== 'ADMIN' && session.role !== 'MANAGER')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const modules = await prisma.trainingModule.findMany({
      where: { venueId: session.venueId, deletedAt: null, isActive: true },
      select: { id: true, title: true, venueId: true, kind: true },
      orderBy: { title: 'asc' },
    })
    return NextResponse.json(modules)
  }

  const result = await getStaffTraining(session.staffId)
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ firstName: session.firstName, items: result.items })
}
