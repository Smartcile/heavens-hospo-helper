import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import bcrypt from 'bcryptjs'

const STAFF_SELECT = {
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
  createdAt: true,
  venue: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
  sections: { select: { sectionId: true } },
} as const

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
    select: STAFF_SELECT,
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })

  return NextResponse.json(staff)
}

export async function POST(req: NextRequest) {
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
    swiftPosId,
    myHrId,
    loadedReportsId,
    sectionIds,
  } = body

  const finalRole = role ?? 'STAFF'

  if (!firstName?.trim() || !lastName?.trim() || !venueId) {
    return NextResponse.json({ error: 'First name, last name and venue are required' }, { status: 400 })
  }

  // Admin/manager profiles log into the web panel → need email + password.
  // Floor staff log in via QR + PIN → need a PIN.
  const isWebUser = finalRole === 'ADMIN' || finalRole === 'MANAGER'
  if (isWebUser) {
    if (!email?.trim() || !password) {
      return NextResponse.json({ error: 'Email and password are required for admin/manager' }, { status: 400 })
    }
    if (String(password).length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }
  }
  if (pin && !/^\d{2,4}$/.test(String(pin))) {
    return NextResponse.json({ error: 'PIN must be 2-4 digits' }, { status: 400 })
  }
  if (!isWebUser && !pin) {
    return NextResponse.json({ error: 'A PIN is required for floor staff' }, { status: 400 })
  }

  if (session.user.role === 'MANAGER') {
    if (session.user.venueId !== venueId || finalRole !== 'STAFF') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const normalisedEmail = email?.trim().toLowerCase() || null
  if (normalisedEmail) {
    const clash = await prisma.staff.findFirst({
      where: { email: normalisedEmail, deletedAt: null },
      select: { id: true },
    })
    if (clash) {
      return NextResponse.json({ error: 'That email is already in use' }, { status: 409 })
    }
  }

  const staff = await prisma.staff.create({
    data: {
      firstName: String(firstName).toUpperCase().trim(),
      lastName: String(lastName).toUpperCase().trim(),
      pin: pin ? await bcrypt.hash(String(pin), 10) : null,
      email: normalisedEmail,
      password: password ? await bcrypt.hash(String(password), 10) : null,
      role: finalRole,
      venueId,
      departmentId: departmentId ?? null,
      swiftPosId: swiftPosId?.trim() || null,
      myHrId: myHrId?.trim() || null,
      loadedReportsId: loadedReportsId?.trim() || null,
      sections: Array.isArray(sectionIds) && sectionIds.length
        ? { create: sectionIds.map((sectionId: string) => ({ sectionId })) }
        : undefined,
    },
    select: STAFF_SELECT,
  })

  return NextResponse.json(staff, { status: 201 })
}
