import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import bcrypt from 'bcryptjs'
import { guardAccess } from '@/lib/permissions'
import { resolveScopedVenueId } from '@/lib/venue-scope'
import { fetchLookups } from '@/lib/swiftpos.server'
import {
  buildClerkRows,
  clerkCodeConflict,
  findPinClash,
  parseClerks,
  resolveClerkPin,
  resolveCreatedName,
  validClerkPin,
  type VenueStaffRow,
} from '@/lib/swiftpos-staff'

const STAFF_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  swiftPosId: true,
  isActive: true,
} as const

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.staff.view')
  if (denied) return denied

  const scoped = resolveScopedVenueId(session, req)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const venueId = scoped.venueId

  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { id: true, name: true, swiftPosBaseUrl: true },
  })
  if (!venue) return NextResponse.json({ error: 'Venue not found' }, { status: 404 })
  if (!venue.swiftPosBaseUrl) {
    return NextResponse.json(
      { error: 'SWIFTPOS NOT CONNECTED — SET THE SWIFTDOSNET URL ON THE VENUE' },
      { status: 400 },
    )
  }

  let raw: unknown
  try {
    raw = await fetchLookups(venue.swiftPosBaseUrl)
  } catch (e) {
    return NextResponse.json(
      { error: `COULD NOT REACH SWIFTDOSNET: ${(e as Error).message}` },
      { status: 502 },
    )
  }

  const staff = await prisma.staff.findMany({
    where: { venueId, deletedAt: null },
    select: STAFF_SELECT,
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })

  return NextResponse.json({
    venueId,
    venueName: venue.name,
    baseUrl: venue.swiftPosBaseUrl,
    rows: buildClerkRows(parseClerks(raw), staff),
    staff,
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as {
    venueId?: string
    action?: string
    clerkId?: string
    clerkName?: string
    staffId?: string
    pin?: string
    firstName?: string
    lastName?: string
  } | null

  const action = body?.action
  if (action !== 'LINK' && action !== 'UNLINK' && action !== 'CREATE') {
    return NextResponse.json({ error: 'UNKNOWN ACTION' }, { status: 400 })
  }

  const denied = await guardAccess(session, req, action === 'CREATE' ? 'team.staff.create' : 'team.staff.edit')
  if (denied) return denied

  const scoped = resolveScopedVenueId(session, req, body?.venueId)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const venueId = scoped.venueId

  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { id: true } })
  if (!venue) return NextResponse.json({ error: 'Venue not found' }, { status: 404 })

  const venueStaff = await prisma.staff.findMany({
    where: { venueId, deletedAt: null },
    select: { ...STAFF_SELECT, pin: true },
  }) as VenueStaffRow[]

  if (action === 'UNLINK') {
    const staff = venueStaff.find((s) => s.id === body?.staffId)
    if (!staff) return NextResponse.json({ error: 'STAFF NOT FOUND' }, { status: 404 })
    const updated = await prisma.staff.update({
      where: { id: staff.id },
      data: { swiftPosId: null },
      select: STAFF_SELECT,
    })
    return NextResponse.json({ ok: true, staff: updated })
  }

  const clerkId = String(body?.clerkId ?? '').trim()
  if (!clerkId) return NextResponse.json({ error: 'CLERK ID REQUIRED' }, { status: 400 })

  const clash = clerkCodeConflict(venueStaff, clerkId, action === 'LINK' ? body?.staffId : null)
  if (clash) {
    return NextResponse.json(
      { error: `${clash.firstName} ${clash.lastName} IS ALREADY LINKED TO CLERK ${clerkId}` },
      { status: 409 },
    )
  }

  if (action === 'LINK') {
    const staff = venueStaff.find((s) => s.id === body?.staffId)
    if (!staff) return NextResponse.json({ error: 'STAFF NOT FOUND' }, { status: 404 })
    const updated = await prisma.staff.update({
      where: { id: staff.id },
      data: { swiftPosId: clerkId },
      select: STAFF_SELECT,
    })
    return NextResponse.json({ ok: true, staff: updated })
  }

  const { firstName, lastName } = resolveCreatedName(
    { firstName: body?.firstName, lastName: body?.lastName },
    typeof body?.clerkName === 'string' ? body.clerkName : '',
  )
  if (!firstName) return NextResponse.json({ error: 'CLERK NAME REQUIRED' }, { status: 400 })

  const pin = resolveClerkPin(body?.pin, clerkId)
  if (!validClerkPin(pin)) {
    return NextResponse.json({ error: 'PIN MUST BE 1–4 DIGITS' }, { status: 400 })
  }

  const pinClash = await findPinClash(venueStaff, pin, (plain, hash) => bcrypt.compare(plain, hash))
  if (pinClash) {
    return NextResponse.json(
      { error: `PIN ${pin} IS ALREADY IN USE BY ${pinClash.firstName} ${pinClash.lastName}` },
      { status: 409 },
    )
  }

  const created = await prisma.staff.create({
    data: {
      firstName,
      lastName,
      pin: await bcrypt.hash(pin, 10),
      role: 'STAFF',
      venueId,
      swiftPosId: clerkId,
      isActive: true,
    },
    select: STAFF_SELECT,
  })

  return NextResponse.json({ ok: true, staff: created }, { status: 201 })
}
