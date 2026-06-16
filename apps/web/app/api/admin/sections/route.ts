import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const venueId = searchParams.get('venueId')
  const departmentId = searchParams.get('departmentId')

  const where = {
    deletedAt: null,
    ...(venueId ? { venueId } : {}),
    ...(departmentId ? { departmentId } : {}),
    ...(session.user.role === 'MANAGER' ? { venueId: session.user.venueId } : {}),
  }

  const sections = await prisma.section.findMany({
    where,
    include: { department: { select: { id: true, name: true, colour: true } } },
    orderBy: [{ departmentId: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  })

  return NextResponse.json(sections)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, departmentId, colour } = body
  if (!name?.trim() || !departmentId) {
    return NextResponse.json({ error: 'Name and department are required' }, { status: 400 })
  }

  const dept = await prisma.department.findFirst({
    where: { id: departmentId, deletedAt: null },
    select: { venueId: true },
  })
  if (!dept) return NextResponse.json({ error: 'Department not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && dept.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const section = await prisma.section.create({
    data: {
      name: String(name).toUpperCase().trim(),
      departmentId,
      venueId: dept.venueId,
      colour: colour?.trim() || null,
    },
    include: { department: { select: { id: true, name: true, colour: true } } },
  })

  return NextResponse.json(section, { status: 201 })
}
