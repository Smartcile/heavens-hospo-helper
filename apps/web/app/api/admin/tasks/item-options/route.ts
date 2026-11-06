import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'

// A narrow item picker for tasks-only managers. It deliberately returns only
// the fields the task view needs — not a full inventory record.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'execution.tasks.view')
  if (denied) return denied

  const requestedVenueId = req.nextUrl.searchParams.get('venueId')
  const venueId = session.user.role === 'MANAGER' ? session.user.venueId : requestedVenueId
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  const items = await prisma.inventoryItem.findMany({
    where: { venueId, deletedAt: null, isActive: true },
    select: {
      id: true,
      name: true,
      unit: true,
      storageNotes: true,
      storageLocations: {
        where: { deletedAt: null },
        select: {
          notes: true,
          section: { select: { name: true, department: { select: { name: true } } } },
        },
      },
    },
    orderBy: { name: 'asc' },
    take: 500,
  })

  return NextResponse.json(items)
}
