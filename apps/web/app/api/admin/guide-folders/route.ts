import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { nextFolderSortOrder } from '@/lib/guide-folders'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'training.playbook.view')
  if (denied) return denied

  const venueId = new URL(req.url).searchParams.get('venueId')

  const folders = await prisma.guideFolder.findMany({
    where: {
      deletedAt: null,
      ...(venueId ? { venueId } : {}),
      ...(session.user.role === 'MANAGER' ? { venueId: session.user.venueId } : {}),
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })

  return NextResponse.json(folders)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'training.playbook.edit')
  if (denied) return denied

  const body = await req.json()
  const { name, venueId, sortOrder } = body as {
    name?: string
    venueId?: string
    sortOrder?: number
  }
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const scopedVenueId = session.user.role === 'MANAGER' ? session.user.venueId : venueId
  if (!scopedVenueId) return NextResponse.json({ error: 'Venue is required' }, { status: 400 })

  let order = typeof sortOrder === 'number' ? sortOrder : null
  if (order == null) {
    const existing = await prisma.guideFolder.findMany({
      where: { venueId: scopedVenueId, deletedAt: null },
      select: { sortOrder: true },
    })
    order = nextFolderSortOrder(existing)
  }

  const folder = await prisma.guideFolder.create({
    data: { name: name.toUpperCase().trim(), venueId: scopedVenueId, sortOrder: order },
  })

  return NextResponse.json(folder, { status: 201 })
}
