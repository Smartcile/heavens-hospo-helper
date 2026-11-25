import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { Prisma, prisma } from '@hospo-ops/db'
import { resolveScopedVenueId } from '@/lib/venue-scope'
import { normaliseTestMemberInput } from '@/lib/ftp-parking'
import { ftpMemberAdminView } from '@/lib/ftp-admin-views'

// Temporary TEST MEMBERS list for the 4-hour kiosk. These are real Member rows
// (the future Members area will manage the same table); the panel exists so the
// kiosk can be tested before that hub is built.

const memberInclude = {
  parkingType: { select: { id: true, name: true } },
  plates: { where: { deletedAt: null } },
} satisfies Prisma.MemberInclude

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const scoped = resolveScopedVenueId(session, req)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [members, types, venue] = await Promise.all([
    prisma.member.findMany({
      where: { venueId: scoped.venueId, deletedAt: null },
      orderBy: [{ isActive: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }],
      include: memberInclude,
    }),
    prisma.ftpParkingType.findMany({
      where: { venueId: scoped.venueId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, isActive: true },
    }),
    prisma.venue.findUnique({ where: { id: scoped.venueId }, select: { timezone: true } }),
  ])

  return NextResponse.json({
    members: members.map((member) => ftpMemberAdminView(member)),
    types,
    timezone: venue?.timezone || 'Pacific/Auckland',
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const scoped = resolveScopedVenueId(
    session,
    req,
    typeof body.venueId === 'string' ? body.venueId : undefined,
  )
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const input = normaliseTestMemberInput(body)
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 422 })

  const type = await prisma.ftpParkingType.findFirst({
    where: {
      id: input.value.parkingTypeId,
      venueId: scoped.venueId,
      deletedAt: null,
    },
    select: { id: true, name: true },
  })
  if (!type) return NextResponse.json({ error: 'CHOOSE A VALID PARKING TYPE' }, { status: 422 })

  const existing = await prisma.member.findFirst({
    where: {
      venueId: scoped.venueId,
      membershipNumber: input.value.membershipNumber,
    },
    include: memberInclude,
  })

  if (existing && !existing.deletedAt) {
    return NextResponse.json(
      { error: 'THAT MEMBERSHIP NUMBER ALREADY EXISTS' },
      { status: 409 },
    )
  }

  const data = {
    venueId: scoped.venueId,
    membershipNumber: input.value.membershipNumber,
    firstName: input.value.firstName,
    lastName: input.value.lastName,
    email: input.value.email,
    phone: input.value.phone,
    parkingTypeId: input.value.parkingTypeId,
    isActive: input.value.isActive,
    isTest: input.value.isTest,
    // Only write the preference when supplied: reviving/filling a member from a
    // caller that predates this field must not re-enable plate saving.
    ...(typeof body.savePlates === 'boolean' ? { savePlates: input.value.savePlates } : {}),
    notes: input.value.notes,
    deletedAt: null,
  }

  const row = existing
    ? await prisma.member.update({ where: { id: existing.id }, data, include: memberInclude })
    : await prisma.member.create({ data, include: memberInclude })

  return NextResponse.json({ member: ftpMemberAdminView(row) }, { status: 201 })
}
