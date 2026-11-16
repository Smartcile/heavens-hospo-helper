import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { resolveScopedVenueId } from '@/lib/venue-scope'
import { normaliseFtpTypeInput } from '@/lib/ftp-parking'
import { hashAdminPin } from '@/lib/ftp-credentials.server'
import { ftpTypeAdminView } from '@/lib/ftp-admin-views'
import {
  guestEntryLinkView,
  guestSlotStateForType,
} from '@/lib/ftp-guest-entry.server'
import { guestEntryUrlFor } from '@/lib/ftp-settings'
import { pinHint } from '@/lib/vpermit'

function appUrl() {
  return (
    process.env.PARKING_PUBLIC_URL ??
    process.env.APP_URL ??
    process.env.NEXTAUTH_URL ??
    ''
  )
}

// Settings -> FTP -> 4 HOUR parking types. The membership number selects the
// type; each type owns its vPermit claim URL, contact details and optional
// admin PIN.

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const scoped = resolveScopedVenueId(session, req)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [types, venue] = await Promise.all([
    prisma.ftpParkingType.findMany({
      where: { venueId: scoped.venueId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { members: true, claims: true } } },
    }),
    prisma.venue.findUnique({ where: { id: scoped.venueId }, select: { timezone: true } }),
  ])

  const now = new Date()
  const views = await Promise.all(
    types.map(async (type) => {
      const state = await guestSlotStateForType(type, now)
      const guest = guestEntryLinkView(type, state, now)
      return ftpTypeAdminView(
        type,
        { members: type._count.members, claims: type._count.claims },
        {
          used: guest.used,
          remaining: guest.remaining,
          full: guest.full,
          nextFreeAt: guest.nextFreeAt,
          entryUrl: guestEntryUrlFor(appUrl(), type.venueId, type.id),
        },
      )
    }),
  )

  return NextResponse.json({
    types: views,
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

  const input = normaliseFtpTypeInput(body)
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 422 })
  if (input.value.adminPinEnabled && !input.value.adminPin) {
    return NextResponse.json(
      { error: 'SET AN ADMIN PIN BEFORE ENABLING IT' },
      { status: 422 },
    )
  }
  if (input.value.guestEntryEnabled) {
    return NextResponse.json(
      {
        error:
          'SAVE THE TYPE FIRST, THEN SET THE CUSTOMER PIN AND TURN THE CUSTOMER ENTRY LINK ON',
      },
      { status: 422 },
    )
  }

  const duplicate = await prisma.ftpParkingType.findFirst({
    where: { venueId: scoped.venueId, name: input.value.name, deletedAt: null },
    select: { id: true },
  })
  if (duplicate) {
    return NextResponse.json({ error: 'A PARKING TYPE WITH THAT NAME ALREADY EXISTS' }, { status: 409 })
  }

  const adminPinHash = input.value.adminPin ? await hashAdminPin(input.value.adminPin) : null
  const row = await prisma.ftpParkingType.create({
    data: {
      venueId: scoped.venueId,
      name: input.value.name,
      windowLabel: input.value.windowLabel,
      durationMinutes: input.value.durationMinutes,
      claimUrl: input.value.claimUrl,
      claimCode: input.value.claimCode,
      contactName: input.value.contactName,
      contactEmail: input.value.contactEmail,
      contactPhone: input.value.contactPhone,
      useContactEmail: input.value.useContactEmail,
      useContactPhone: input.value.useContactPhone,
      logPlates: input.value.logPlates,
      adminPinEnabled: input.value.adminPinEnabled,
      adminPinHash,
      adminPinHint: input.value.adminPin ? pinHint(input.value.adminPin) : null,
      guestEntryEnabled: input.value.guestEntryEnabled,
      guestEntryLabel: input.value.guestEntryLabel,
      guestPlateLimitEnabled: input.value.guestPlateLimitEnabled,
      guestPlateLimit: input.value.guestPlateLimit,
      healthCheckMode: input.value.healthCheckMode,
      healthPlate: input.value.healthPlate,
      sortOrder: input.value.sortOrder,
      notes: input.value.notes,
      isActive: input.value.isActive,
    },
  })

  return NextResponse.json({ type: ftpTypeAdminView(row) }, { status: 201 })
}
