import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { Prisma, prisma } from '@hospo-ops/db'
import { resolveScopedVenueId } from '@/lib/venue-scope'
import { normaliseTestMemberInput } from '@/lib/ftp-parking'
import { ftpMemberAdminView } from '@/lib/ftp-admin-views'

const memberInclude = {
  parkingType: { select: { id: true, name: true } },
  plates: { where: { deletedAt: null } },
} satisfies Prisma.MemberInclude

async function load(req: NextRequest, id: string) {
  const session = await getServerSession(authOptions)
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const scoped = resolveScopedVenueId(session, req)
  if ('error' in scoped) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  const row = await prisma.member.findFirst({
    where: { id, venueId: scoped.venueId, deletedAt: null },
  })
  if (!row) return { error: NextResponse.json({ error: 'NOT FOUND' }, { status: 404 }) }
  return { venueId: scoped.venueId, row }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const loaded = await load(req, params.id)
  if ('error' in loaded) return loaded.error
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

  const input = normaliseTestMemberInput(body)
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 422 })

  const type = await prisma.ftpParkingType.findFirst({
    where: { id: input.value.parkingTypeId, venueId: loaded.venueId, deletedAt: null },
    select: { id: true },
  })
  if (!type) return NextResponse.json({ error: 'CHOOSE A VALID PARKING TYPE' }, { status: 422 })

  const duplicate = await prisma.member.findFirst({
    where: {
      venueId: loaded.venueId,
      membershipNumber: input.value.membershipNumber,
      NOT: { id: loaded.row.id },
    },
    select: { id: true },
  })
  if (duplicate) {
    return NextResponse.json(
      { error: 'THAT MEMBERSHIP NUMBER ALREADY EXISTS' },
      { status: 409 },
    )
  }

  const row = await prisma.member.update({
    where: { id: loaded.row.id },
    data: {
      membershipNumber: input.value.membershipNumber,
      firstName: input.value.firstName,
      lastName: input.value.lastName,
      email: input.value.email,
      phone: input.value.phone,
      parkingTypeId: input.value.parkingTypeId,
      isActive: input.value.isActive,
      notes: input.value.notes,
    },
    include: memberInclude,
  })
  return NextResponse.json({ member: ftpMemberAdminView(row) })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const loaded = await load(req, params.id)
  if ('error' in loaded) return loaded.error
  const now = new Date()
  await prisma.$transaction([
    prisma.memberPlate.updateMany({
      where: { memberId: loaded.row.id, deletedAt: null },
      data: { deletedAt: now, status: 'RETIRED' },
    }),
    prisma.member.update({
      where: { id: loaded.row.id },
      data: { deletedAt: now, isActive: false },
    }),
  ])
  return NextResponse.json({ ok: true })
}
