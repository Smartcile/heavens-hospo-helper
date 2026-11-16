// Server-only half of the event guest-entry link. A guest unlocks one link
// with a shared PIN, then submits plate after plate to that link's vPermit
// claim URL. The rolling limit is computed from confirmed claims.

import { prisma, type FtpParkingType } from '@hospo-ops/db'
import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'
import { submitFtpClaim } from './ftp-claims.server'
import {
  DEFAULT_GUEST_ENTRY_LABEL,
  GUEST_CLAIM_CREDENTIAL_KIND,
  GUEST_TOKEN_TTL_MINUTES,
  guestEntryLabel,
  guestSlotState,
  type GuestSlotClaim,
} from './ftp-guest-entry'
import { guestEntryUrlFor } from './ftp-settings'

const secret = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET ?? 'fallback-dev-secret-change-in-prod',
)

const PUBLIC_APP_URL =
  process.env.PARKING_PUBLIC_URL ??
  process.env.APP_URL ??
  process.env.NEXTAUTH_URL ??
  ''

export interface GuestEntryLinkView {
  id: string
  name: string
  label: string
  windowLabel: string | null
  durationMinutes: number
  limitEnabled: boolean
  limit: number | null
  used: number
  remaining: number | null
  full: boolean
  nextFreeAt: string | null
  pinSet: boolean
  entryUrl: string
}

export interface GuestEntryBootstrap {
  enabled: boolean
  venueId: string | null
  venueName: string
  label: string
  timezone: string
  links: GuestEntryLinkView[]
  message?: string
}

export interface GuestEntryToken {
  venueId: string
  typeId: string
}

export type ResolvedGuestType =
  | { ok: true; type: FtpParkingType }
  | { ok: false; status: number; error: string }

function appUrl(): string {
  return PUBLIC_APP_URL
}

export async function resolveGuestEntryType(
  venueId: string,
  typeId: string,
): Promise<ResolvedGuestType> {
  const type = await prisma.ftpParkingType.findFirst({
    where: {
      id: typeId,
      venueId,
      guestEntryEnabled: true,
      isActive: true,
      deletedAt: null,
      claimUrl: { not: null },
    },
  })
  if (!type) {
    return { ok: false, status: 404, error: 'THIS CUSTOMER ENTRY LINK IS NOT AVAILABLE' }
  }
  if (!type.guestEntryPinHash) {
    return { ok: false, status: 409, error: 'THE PIN HAS NOT BEEN SET FOR THIS LINK' }
  }
  return { ok: true, type }
}

async function claimsForType(
  type: FtpParkingType,
  now = new Date(),
): Promise<GuestSlotClaim[]> {
  const since = new Date(now.getTime() - type.durationMinutes * 60_000)
  const rows = await prisma.ftpClaim.findMany({
    where: {
      venueId: type.venueId,
      typeId: type.id,
      deletedAt: null,
      status: { in: ['CONFIRMED', 'MANUAL_CONFIRMED'] },
      createdAt: { gte: since },
    },
    select: { createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  return rows
}

export async function guestSlotStateForType(
  type: FtpParkingType,
  now = new Date(),
) {
  const claims = await claimsForType(type, now)
  return guestSlotState({
    limitEnabled: type.guestPlateLimitEnabled,
    limit: type.guestPlateLimit,
    durationMinutes: type.durationMinutes,
    claims,
    now,
  })
}

export function guestEntryLinkView(
  type: FtpParkingType,
  state: ReturnType<typeof guestSlotState>,
  now = new Date(),
): GuestEntryLinkView {
  return {
    id: type.id,
    name: type.name,
    label: guestEntryLabel(type.guestEntryLabel),
    windowLabel: type.windowLabel,
    durationMinutes: type.durationMinutes,
    limitEnabled: type.guestPlateLimitEnabled,
    limit: state.limit,
    used: state.used,
    remaining: state.remaining,
    full: state.full,
    nextFreeAt: state.nextFreeAt ? state.nextFreeAt.toISOString() : null,
    pinSet: Boolean(type.guestEntryPinHash),
    entryUrl: guestEntryUrlFor(appUrl(), type.venueId, type.id),
  }
}

export async function loadGuestEntryBootstrap(
  requestedVenue?: string | null,
  requestedType?: string | null,
): Promise<GuestEntryBootstrap> {
  const fallback: GuestEntryBootstrap = {
    enabled: false,
    venueId: null,
    venueName: '',
    label: DEFAULT_GUEST_ENTRY_LABEL,
    timezone: 'Pacific/Auckland',
    links: [],
  }

  const settings = requestedVenue
    ? await prisma.ftpSettings.findUnique({ where: { venueId: requestedVenue } })
    : await prisma.ftpSettings.findFirst({
        where: { customerEntryEnabled: true, deletedAt: null },
        orderBy: { updatedAt: 'desc' },
      })

  if (!settings || settings.deletedAt || !settings.customerEntryEnabled) {
    return {
      ...fallback,
      message: 'CUSTOMER ENTRY IS NOT ENABLED FOR THIS VENUE',
    }
  }

  const [venue, types] = await Promise.all([
    prisma.venue.findUnique({
      where: { id: settings.venueId },
      select: { name: true, timezone: true },
    }),
    prisma.ftpParkingType.findMany({
      where: {
        venueId: settings.venueId,
        guestEntryEnabled: true,
        isActive: true,
        deletedAt: null,
        claimUrl: { not: null },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
  ])

  const usable = types.filter((type) => Boolean(type.guestEntryPinHash))
  let chosen = usable
  if (requestedType) {
    const match = usable.find((type) => type.id === requestedType)
    if (!match) {
      return {
        ...fallback,
        venueId: settings.venueId,
        venueName: venue?.name ?? '',
        label: guestEntryLabel(settings.customerEntryLabel),
        timezone: venue?.timezone || 'Pacific/Auckland',
        message: 'THIS CUSTOMER ENTRY LINK IS NOT AVAILABLE',
      }
    }
    chosen = [match]
  }

  const now = new Date()
  const links = await Promise.all(
    chosen.map(async (type) => {
      const state = await guestSlotStateForType(type, now)
      return guestEntryLinkView(type, state, now)
    }),
  )

  return {
    enabled: links.length > 0,
    venueId: settings.venueId,
    venueName: venue?.name ?? '',
    label: guestEntryLabel(settings.customerEntryLabel),
    timezone: venue?.timezone || 'Pacific/Auckland',
    links,
    message: links.length > 0 ? undefined : 'NO CUSTOMER ENTRY LINKS ARE SET UP',
  }
}

export async function verifyGuestEntryPin(
  type: FtpParkingType,
  pin: string,
): Promise<boolean> {
  if (!type.guestEntryPinHash) return false
  return bcrypt.compare(pin, type.guestEntryPinHash)
}

export async function createGuestEntryToken(token: GuestEntryToken): Promise<string> {
  return new SignJWT({ venueId: token.venueId, typeId: token.typeId, kind: 'GUEST' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${GUEST_TOKEN_TTL_MINUTES}m`)
    .sign(secret)
}

export async function verifyGuestEntryToken(
  raw: string,
): Promise<GuestEntryToken | null> {
  try {
    const { payload } = await jwtVerify(raw, secret)
    if (payload.kind !== 'GUEST') return null
    if (typeof payload.venueId !== 'string' || typeof payload.typeId !== 'string') {
      return null
    }
    return { venueId: payload.venueId, typeId: payload.typeId }
  } catch {
    return null
  }
}

export interface SubmitGuestPlateArgs {
  venueId: string
  typeId: string
  plate: string
  timezone: string
}

export type SubmitGuestPlateResult =
  | {
      ok: true
      claim: Awaited<ReturnType<typeof submitFtpClaim>>
      slots: ReturnType<typeof guestSlotState>
    }
  | {
      ok: false
      full: boolean
      error: string
      slots: ReturnType<typeof guestSlotState>
    }

export async function submitGuestEntryPlate(
  args: SubmitGuestPlateArgs,
): Promise<SubmitGuestPlateResult> {
  const resolved = await resolveGuestEntryType(args.venueId, args.typeId)
  if (!resolved.ok) {
    return {
      ok: false,
      full: false,
      error: resolved.error,
      slots: guestSlotState({
        limitEnabled: false,
        limit: null,
        durationMinutes: 240,
        claims: [],
      }),
    }
  }

  const before = await guestSlotStateForType(resolved.type)
  if (before.full) {
    return {
      ok: false,
      full: true,
      error: 'NO PARKING SLOTS ARE AVAILABLE FOR THIS LINK',
      slots: before,
    }
  }

  const claim = await submitFtpClaim({
    venueId: args.venueId,
    typeId: args.typeId,
    memberId: null,
    credentialKind: GUEST_CLAIM_CREDENTIAL_KIND,
    plate: args.plate,
    timezone: args.timezone,
  })

  const after = await guestSlotStateForType(resolved.type)
  return { ok: true, claim, slots: after }
}

export function guestEntryPinHint(pin: string): string {
  return pin.trim().slice(-2)
}
