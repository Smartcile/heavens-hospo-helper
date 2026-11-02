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

  const { searchParams } = new URL(req.url)
  const venueId = searchParams.get('venueId')

  const where = {
    deletedAt: null,
    ...(venueId ? { venueId } : {}),
    ...(session.user.role === 'MANAGER' ? { venueId: session.user.venueId } : {}),
  }

  const departments = await prisma.department.findMany({
    where,
    include: {
      venue: { select: { id: true, name: true } },
      linkedTo: { include: { toDepartment: { select: { id: true, name: true, colour: true } } } },
    },
    orderBy: [{ venueId: 'asc' }, { name: 'asc' }],
  })

  return NextResponse.json(departments)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'training.playbook.edit')
  if (denied) return denied

  const body = await req.json()
  const { name, venueId, colour } = body

  if (!name?.trim() || !venueId) {
    return NextResponse.json({ error: 'Name and venueId are required' }, { status: 400 })
  }

  if (session.user.role === 'MANAGER' && session.user.venueId !== venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const department = await prisma.department.create({
    data: {
      name: String(name).toUpperCase().trim(),
      venueId,
      colour: colour ?? null,
    },
  })

  return NextResponse.json(department, { status: 201 })
}
