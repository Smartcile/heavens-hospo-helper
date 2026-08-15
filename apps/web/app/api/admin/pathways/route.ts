import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'training.pathways.view')
  if (denied) return denied

  const venueId = new URL(req.url).searchParams.get('venueId')

  const pathways = await prisma.pathway.findMany({
    where: {
      deletedAt: null,
      ...(venueId ? { venueId } : {}),
      ...(session.user.role === 'MANAGER' ? { venueId: session.user.venueId } : {}),
    },
    include: {
      department: { select: { id: true, name: true } },
      section: { select: { id: true, name: true } },
      position: { select: { id: true, name: true } },
      _count: { select: { nodes: true } },
    },
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
  })

  return NextResponse.json(pathways)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'training.pathways.create')
  if (denied) return denied

  const body = await req.json()
  const { name, description, departmentId, sectionId, positionId, venueId } = body as {
    name?: string
    description?: string | null
    departmentId?: string | null
    sectionId?: string | null
    positionId?: string | null
    venueId?: string
  }

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const scopedVenueId = session.user.role === 'MANAGER' ? session.user.venueId : venueId
  if (!scopedVenueId) {
    return NextResponse.json({ error: 'Venue is required' }, { status: 400 })
  }

  const pathway = await prisma.pathway.create({
    data: {
      name: name.toUpperCase().trim(),
      description: description?.trim() || null,
      venueId: scopedVenueId,
      departmentId: departmentId || null,
      sectionId: sectionId || null,
      positionId: positionId || null,
      status: 'DRAFT',
    },
  })

  return NextResponse.json(pathway, { status: 201 })
}
