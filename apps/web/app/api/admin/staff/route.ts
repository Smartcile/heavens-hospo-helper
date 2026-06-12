import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import bcrypt from 'bcryptjs'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const venueId = searchParams.get('venueId')

  const where = {
    deletedAt: null,
    ...(venueId ? { venueId } : {}),
    ...(session.user.role === 'MANAGER' ? { venueId: session.user.venueId } : {}),
  }

  const staff = await prisma.staff.findMany({
    where,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
      venueId: true,
      departmentId: true,
      profilePhotoUrl: true,
      isActive: true,
      swiftPosId: true,
      createdAt: true,
      venue: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })

  return NextResponse.json(staff)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { firstName, lastName, pin, role, venueId, departmentId, swiftPosId } = body

  if (!firstName?.trim() || !lastName?.trim() || !pin || !venueId) {
    return NextResponse.json({ error: 'Required fields missing' }, { status: 400 })
  }

  if (!/^\d{2,4}$/.test(String(pin))) {
    return NextResponse.json({ error: 'PIN must be 2-4 digits' }, { status: 400 })
  }

  if (session.user.role === 'MANAGER') {
    if (session.user.venueId !== venueId || (role && role !== 'STAFF')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const hashedPin = await bcrypt.hash(String(pin), 10)

  const staff = await prisma.staff.create({
    data: {
      firstName: String(firstName).toUpperCase().trim(),
      lastName: String(lastName).toUpperCase().trim(),
      pin: hashedPin,
      role: role ?? 'STAFF',
      venueId,
      departmentId: departmentId ?? null,
      swiftPosId: swiftPosId?.trim() ?? null,
    },
  })

  return NextResponse.json(
    { ...staff, pin: undefined },
    { status: 201 }
  )
}
