import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import bcrypt from 'bcryptjs'

interface Params {
  params: { id: string }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { firstName, lastName, pin, role, departmentId, isActive, swiftPosId } = body

  const updates: Record<string, unknown> = {}

  if (firstName !== undefined) updates.firstName = String(firstName).toUpperCase().trim()
  if (lastName !== undefined) updates.lastName = String(lastName).toUpperCase().trim()
  if (departmentId !== undefined) updates.departmentId = departmentId ?? null
  if (isActive !== undefined) updates.isActive = isActive
  if (swiftPosId !== undefined) updates.swiftPosId = swiftPosId?.trim() ?? null

  if (pin !== undefined) {
    if (!/^\d{2,4}$/.test(String(pin))) {
      return NextResponse.json({ error: 'PIN must be 2-4 digits' }, { status: 400 })
    }
    updates.pin = await bcrypt.hash(String(pin), 10)
  }

  if (role !== undefined && session.user.role === 'ADMIN') {
    updates.role = role
  }

  const staff = await prisma.staff.update({
    where: { id: params.id },
    data: updates,
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
    },
  })

  return NextResponse.json(staff)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.staff.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), isActive: false },
  })

  return NextResponse.json({ success: true })
}
