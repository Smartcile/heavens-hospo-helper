import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import bcrypt from 'bcryptjs'

interface Params {
  params: { id: string }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const staff = await prisma.staff.findUnique({
    where: { id: params.id },
    select: {
      id: true, firstName: true, lastName: true, email: true, role: true, venueId: true,
      departmentId: true, isActive: true, hourlyRate: true, employmentType: true,
      swiftPosId: true, myHrId: true, loadedReportsId: true,
      sections: { select: { sectionId: true } },
      staffVenues: { select: { venueId: true } },
    },
  })
  if (!staff) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(staff)
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    firstName,
    lastName,
    pin,
    email,
    password,
    role,
    venueId,
    departmentId,
    isActive,
    hourlyRate,
    employmentType,
    defaultVenueId,
    swiftPosId,
    myHrId,
    loadedReportsId,
    venueIds,
  } = body

  const updates: Record<string, unknown> = {}

  if (firstName !== undefined) updates.firstName = String(firstName).toUpperCase().trim()
  if (lastName !== undefined) updates.lastName = String(lastName).toUpperCase().trim()
  // Only ADMIN can move a staff member to another venue.
  if (venueId !== undefined && session.user.role === 'ADMIN') updates.venueId = venueId
  if (departmentId !== undefined) updates.departmentId = departmentId ?? null
  if (isActive !== undefined) updates.isActive = isActive
  if (hourlyRate !== undefined) updates.hourlyRate = hourlyRate != null ? Number(hourlyRate) : null
  if (employmentType !== undefined) updates.employmentType = employmentType || null
  if (defaultVenueId !== undefined) updates.defaultVenueId = defaultVenueId || null
  if (swiftPosId !== undefined) updates.swiftPosId = swiftPosId?.trim() || null
  if (myHrId !== undefined) updates.myHrId = myHrId?.trim() || null
  if (loadedReportsId !== undefined) updates.loadedReportsId = loadedReportsId?.trim() || null

  // Replace the staff member's section membership when provided.
  if (body.sectionIds !== undefined) {
    const ids: string[] = Array.isArray(body.sectionIds) ? body.sectionIds : []
    updates.sections = { deleteMany: {}, create: ids.map((sectionId: string) => ({ sectionId })) }
  }

  // PIN: empty/undefined leaves it unchanged; empty string clears it.
  if (pin) {
    if (!/^\d{2,4}$/.test(String(pin))) {
      return NextResponse.json({ error: 'PIN must be 2-4 digits' }, { status: 400 })
    }
    updates.pin = await bcrypt.hash(String(pin), 10)
  }

  if (email !== undefined) {
    const normalisedEmail = email?.trim().toLowerCase() || null
    if (normalisedEmail) {
      const clash = await prisma.staff.findFirst({
        where: { email: normalisedEmail, deletedAt: null, NOT: { id: params.id } },
        select: { id: true },
      })
      if (clash) {
        return NextResponse.json({ error: 'That email is already in use' }, { status: 409 })
      }
    }
    updates.email = normalisedEmail
  }

  if (password) {
    if (String(password).length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }
    updates.password = await bcrypt.hash(String(password), 10)
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
      email: true,
      role: true,
      venueId: true,
      departmentId: true,
      profilePhotoUrl: true,
      isActive: true,
      swiftPosId: true,
      myHrId: true,
      loadedReportsId: true,
      hourlyRate: true,
      employmentType: true,
      defaultVenueId: true,
      staffVenues: { select: { venueId: true } },
    },
  })

  // Sync additional venue assignments
  if (venueIds !== undefined) {
    const ids: string[] = Array.isArray(venueIds) ? venueIds : []
    await prisma.staffVenue.deleteMany({ where: { staffId: params.id } })
    if (ids.length > 0) {
      await prisma.staffVenue.createMany({
        data: ids.map((venueId) => ({ staffId: params.id, venueId })),
      })
    }
  }

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
