import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'training.playbook.view')
  if (denied) return denied

  const venueId = new URL(req.url).searchParams.get('venueId')

  const positions = await prisma.position.findMany({
    where: {
      deletedAt: null,
      ...(venueId ? { venueId } : {}),
      ...(session.user.role === 'MANAGER' ? { venueId: session.user.venueId } : {}),
    },
    include: {
      department: { select: { id: true, name: true } },
      _count: { select: { staff: true } },
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })

  return NextResponse.json(positions)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'training.playbook.edit')
  if (denied) return denied

  const body = await req.json()
  const { name, departmentId, colour, venueId } = body as {
    name?: string
    departmentId?: string | null
    colour?: string | null
    venueId?: string
  }

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const scopedVenueId = session.user.role === 'MANAGER' ? session.user.venueId : venueId
  if (!scopedVenueId) {
    return NextResponse.json({ error: 'Venue is required' }, { status: 400 })
  }

  const position = await prisma.position.create({
    data: {
      name: name.toUpperCase().trim(),
      venueId: scopedVenueId,
      departmentId: departmentId || null,
      colour: colour || null,
    },
    include: { department: { select: { id: true, name: true } } },
  })

  return NextResponse.json(position, { status: 201 })
}
