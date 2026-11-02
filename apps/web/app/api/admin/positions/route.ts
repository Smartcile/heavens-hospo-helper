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
      departmentLinks: { select: { departmentId: true } },
      _count: { select: { staff: true } },
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })

  return NextResponse.json(
    positions.map((p) => ({ ...p, departmentIds: p.departmentLinks.map((d) => d.departmentId) })),
  )
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'training.playbook.edit')
  if (denied) return denied

  const body = await req.json()
  const { name, departmentId, departmentIds, colour, venueId, hourlyRate } = body as {
    name?: string
    departmentId?: string | null
    departmentIds?: string[]
    colour?: string | null
    venueId?: string
    hourlyRate?: number | null
  }

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const scopedVenueId = session.user.role === 'MANAGER' ? session.user.venueId : venueId
  if (!scopedVenueId) {
    return NextResponse.json({ error: 'Venue is required' }, { status: 400 })
  }

  const deptIds = Array.isArray(departmentIds)
    ? [...new Set(departmentIds.filter((x): x is string => !!x))]
    : departmentId
      ? [departmentId]
      : []

  const position = await prisma.position.create({
    data: {
      name: name.toUpperCase().trim(),
      venueId: scopedVenueId,
      departmentId: deptIds[0] ?? null,
      colour: colour || null,
      hourlyRate: hourlyRate != null ? Number(hourlyRate) : null,
      departmentLinks: deptIds.length ? { create: deptIds.map((departmentId) => ({ departmentId })) } : undefined,
    },
    include: {
      department: { select: { id: true, name: true } },
      departmentLinks: { select: { departmentId: true } },
    },
  })

  return NextResponse.json(
    { ...position, departmentIds: position.departmentLinks.map((d) => d.departmentId) },
    { status: 201 },
  )
}
