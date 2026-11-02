import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import bcrypt from 'bcryptjs'
import { getAccessibleVenueIds } from '@/lib/venue-scope'
import { guardAccess } from '@/lib/permissions'

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
  restricted: true,
  swiftPosId: true,
  myHrId: true,
  loadedReportsId: true,
  createdAt: true,
  venue: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
  sections: { select: { sectionId: true } },
  positions: {
    select: {
      positionId: true,
      hourlyRate: true,
      position: { select: { id: true, name: true, hourlyRate: true } },
    },
  },
  staffVenues: { select: { venueId: true } },
} as const

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.staff.view')
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const venueId = searchParams.get('venueId')
  const accessibleVenueIds = getAccessibleVenueIds(session)

  const where: Record<string, unknown> = {
    deletedAt: null,
    ...(venueId ? { venueId } : {}),
    ...(session.user.role === 'MANAGER'
      ? { venueId: { in: accessibleVenueIds } }
      : !venueId ? { venue: { NOT: { isDemo: true, isActive: false } } } : {}),
  }

  const staff = await prisma.staff.findMany({
    where,
    select: STAFF_SELECT,
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })

  return NextResponse.json(staff)
}

async function syncStaffVenues(staffId: string, venueIds: string[]) {
  await prisma.staffVenue.deleteMany({ where: { staffId } })
  if (venueIds.length > 0) {
    await prisma.staffVenue.createMany({
      data: venueIds.map((venueId) => ({ staffId, venueId })),
    })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.staff.create')
  if (denied) return denied

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
    positionIds,
    positions,
    venueIds,
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

  // Roles + optional per-role rates. `positions` (objects) supersedes `positionIds`.
  const positionRows: { positionId: string; hourlyRate: number | null }[] = []
  if (Array.isArray(positions)) {
    const seen = new Set<string>()
    for (const p of positions) {
      const positionId = typeof p?.positionId === 'string' ? p.positionId : null
      if (!positionId || seen.has(positionId)) continue
      seen.add(positionId)
      positionRows.push({ positionId, hourlyRate: typeof p?.hourlyRate === 'number' ? p.hourlyRate : null })
    }
  } else if (Array.isArray(positionIds)) {
    for (const positionId of [...new Set(positionIds as string[])]) {
      if (positionId) positionRows.push({ positionId, hourlyRate: null })
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
      positions: positionRows.length ? { create: positionRows } : undefined,
    },
    select: STAFF_SELECT,
  })

  // Sync additional venue assignments
  if (Array.isArray(venueIds) && venueIds.length > 0) {
    await syncStaffVenues(staff.id, venueIds)
  }

  return NextResponse.json(staff, { status: 201 })
}
