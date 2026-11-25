// Server-only credential resolution for the 4-hour kiosk. A membership number
// (primary) or the type's optional admin PIN selects a parking type. The kiosk
// receives a short-lived signed token, never the member's contact details.

import { randomInt } from 'node:crypto'
import { Prisma, prisma, type FtpParkingType } from '@hospo-ops/db'
import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'
import { sortMemberPlates } from './ftp-parking'
import { isValidAdminPin, isValidMembershipNumber, normaliseMembershipNumber } from './vpermit'

const secret = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET ?? 'fallback-dev-secret-change-in-prod',
)
// Ten minutes so a member can manage their saved plates after the credential
// step. Every public write still re-checks kiosk access and venue scope.
export const CREDENTIAL_TTL = '10m'
const MANUAL_TTL = '30m'

const memberInclude = {
  plates: {
    where: { status: 'ACTIVE', deletedAt: null },
    orderBy: { isDefault: 'desc' },
  },
} satisfies Prisma.MemberInclude

export type FtpMemberWithPlates = Prisma.MemberGetPayload<{ include: { plates: true } }>
export type FtpTypeRow = FtpParkingType

export interface FtpCredentialToken {
  kind: 'MEMBER' | 'ADMIN_PIN'
  venueId: string
  typeId: string
  memberId: string | null
}

export interface FtpManualToken {
  venueId: string
  claimId: string
}

export type FtpCredential =
  | { kind: 'MEMBER'; type: FtpTypeRow; member: FtpMemberWithPlates }
  | { kind: 'ADMIN_PIN'; type: FtpTypeRow; member: null }

export type ResolveFtpCredentialResult =
  | { ok: true; credential: FtpCredential }
  | { ok: false; reason: 'TYPE_UNAVAILABLE' | 'NOT_FOUND' }

export async function resolveFtpCredential(args: {
  venueId: string
  typeId: string
  credential: string
  mode?: 'MEMBER' | 'ADMIN'
}): Promise<ResolveFtpCredentialResult> {
  const type = await prisma.ftpParkingType.findFirst({
    where: {
      id: args.typeId,
      venueId: args.venueId,
      isActive: true,
      deletedAt: null,
    },
  })
  if (!type || !type.claimUrl) return { ok: false, reason: 'TYPE_UNAVAILABLE' }

  const value = args.credential.trim()
  const mode = args.mode ?? 'MEMBER'

  // The admin PIN is only accepted after the hidden five-tap gesture. Member
  // mode never falls back to it, so a customer cannot discover it by trying.
  if (mode === 'ADMIN') {
    if (type.adminPinEnabled && type.adminPinHash && isValidAdminPin(value)) {
      const matches = await bcrypt.compare(value, type.adminPinHash)
      if (matches) return { ok: true, credential: { kind: 'ADMIN_PIN', type, member: null } }
    }
    return { ok: false, reason: 'NOT_FOUND' }
  }

  if (isValidMembershipNumber(value)) {
    const member = await prisma.member.findFirst({
      where: {
        venueId: args.venueId,
        membershipNumber: normaliseMembershipNumber(value),
        parkingTypeId: type.id,
        isActive: true,
        deletedAt: null,
      },
      include: memberInclude,
    })
    if (member) return { ok: true, credential: { kind: 'MEMBER', type, member } }
  }

  return { ok: false, reason: 'NOT_FOUND' }
}

export interface FtpCredentialPublicView {
  kind: 'MEMBER' | 'ADMIN_PIN'
  type: {
    id: string
    name: string
    windowLabel: string | null
    durationMinutes: number
    plateRemovalRequiresPin: boolean
  }
  member: {
    id: string
    firstName: string
    lastName: string
    plateSavingEnabled: boolean
    plates: { id: string; plate: string; isDefault: boolean }[]
  } | null
}

// When the member has turned plate saving off, the kiosk never sees their
// stored plates: it must ask for a plate and must not reveal old ones. The
// plates stay on the record for the admin to manage.
export function ftpCredentialPublicView(credential: FtpCredential): FtpCredentialPublicView {
  return {
    kind: credential.kind,
    type: {
      id: credential.type.id,
      name: credential.type.name,
      windowLabel: credential.type.windowLabel,
      durationMinutes: credential.type.durationMinutes,
      plateRemovalRequiresPin: credential.type.plateRemovalRequiresPin,
    },
    member: credential.member
      ? {
          id: credential.member.id,
          firstName: credential.member.firstName,
          lastName: credential.member.lastName,
          plateSavingEnabled: credential.member.savePlates,
          plates: credential.member.savePlates
            ? sortMemberPlates(credential.member.plates).map((plate) => ({
                id: plate.id,
                plate: plate.plate,
                isDefault: plate.isDefault,
              }))
            : [],
        }
      : null,
  }
}

export function generateAdminPin(length = 6): string {
  const size = Math.max(4, Math.min(8, length))
  let pin = ''
  for (let i = 0; i < size; i += 1) pin += String(randomInt(0, 10))
  return pin
}

export async function hashAdminPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10)
}

export async function createCredentialToken(credential: FtpCredential): Promise<string> {
  return new SignJWT({
    kind: credential.kind,
    venueId: credential.type.venueId,
    typeId: credential.type.id,
    memberId: credential.member?.id ?? null,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(CREDENTIAL_TTL)
    .sign(secret)
}

export async function verifyCredentialToken(
  token: string,
): Promise<FtpCredentialToken | null> {
  try {
    const { payload } = await jwtVerify(token, secret)
    if (payload.kind !== 'MEMBER' && payload.kind !== 'ADMIN_PIN') return null
    if (typeof payload.venueId !== 'string' || typeof payload.typeId !== 'string') return null
    return {
      kind: payload.kind,
      venueId: payload.venueId,
      typeId: payload.typeId,
      memberId: typeof payload.memberId === 'string' ? payload.memberId : null,
    }
  } catch {
    return null
  }
}

export async function createManualToken(args: FtpManualToken): Promise<string> {
  return new SignJWT({ kind: 'MANUAL', venueId: args.venueId, claimId: args.claimId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(MANUAL_TTL)
    .sign(secret)
}

export async function verifyManualToken(token: string): Promise<FtpManualToken | null> {
  try {
    const { payload } = await jwtVerify(token, secret)
    if (payload.kind !== 'MANUAL') return null
    if (typeof payload.venueId !== 'string' || typeof payload.claimId !== 'string') return null
    return { venueId: payload.venueId, claimId: payload.claimId }
  } catch {
    return null
  }
}

