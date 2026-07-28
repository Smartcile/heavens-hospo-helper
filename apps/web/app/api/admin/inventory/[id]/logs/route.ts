import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const logs = await prisma.maintenanceLog.findMany({
    where: { inventoryItemId: params.id },
    include: { staff: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return NextResponse.json(logs.map((l) => ({
    id: l.id,
    note: l.note,
    createdAt: l.createdAt,
    staffName: l.staff ? `${l.staff.firstName} ${l.staff.lastName}` : null,
  })))
}
