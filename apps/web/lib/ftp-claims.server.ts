// Server-only claim orchestration for the FTP 4-hour kiosk: duplicate guard,
// audit row, headless vPermit submit, member plate memory and evidence.
//
// The claim row is written before the browser starts so a crash still leaves a
// visible PENDING/FAILED record for the admin.

import { Prisma, prisma } from '@hospo-ops/db'
import { createManualToken } from './ftp-credentials.server'
import { writeFtpEvidence } from './ftp-evidence.server'
import { resolveFtpContact } from './ftp-parking'
import { isValidPlate, normalisePlate, wallClockParts } from './parking'
import { type FtpClaimStatus } from './vpermit'
import { claimWithVpermit } from './vpermit.server'

const DUPLICATE_LOOKBACK_HOURS = 36

export interface FtpClaimFilters {
  typeId?: string | null
  status?: string | null
  from?: Date | null
  to?: Date | null
  plate?: string | null
}

export function ftpClaimWhere(
  venueId: string,
  filters: FtpClaimFilters = {},
): Prisma.FtpClaimWhereInput {
  const where: Prisma.FtpClaimWhereInput = { venueId, deletedAt: null }
  if (filters.typeId) where.typeId = filters.typeId
  if (filters.status) where.status = filters.status
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    }
  }
  if (filters.plate) {
    where.licensePlate = {
      contains: normalisePlate(filters.plate),
      mode: 'insensitive',
    }
  }
  return where
}

export interface SubmitFtpClaimArgs {
  venueId: string
  typeId: string
  memberId: string | null
  credentialKind: 'MEMBER' | 'ADMIN_PIN' | 'GUEST'
  plate: string
  timezone: string
}

export interface SubmitFtpClaimResult {
  claimId: string
  status: FtpClaimStatus
  ok: boolean
  message: string
  plate: string
  typeName: string
  memberName: string | null
  validFrom: string | null
  validUntil: string | null
  locations: string[]
  already?: { validUntil: string | null; claimedAt: string }
  fallbackUrl: string | null
  manualToken: string | null
}

function failure(message: string): SubmitFtpClaimResult {
  return {
    claimId: '',
    status: 'FAILED',
    ok: false,
    message,
    plate: '',
    typeName: '',
    memberName: null,
    validFrom: null,
    validUntil: null,
    locations: [],
    fallbackUrl: null,
    manualToken: null,
  }
}

async function rememberMemberPlate(args: {
  venueId: string
  memberId: string
  plate: string
}): Promise<void> {
  const existing = await prisma.memberPlate.findFirst({
    where: { memberId: args.memberId, plate: args.plate },
  })
  if (existing) {
    if (existing.deletedAt) {
      await prisma.memberPlate.update({
        where: { id: existing.id },
        data: { deletedAt: null, status: 'ACTIVE' },
      })
    }
    return
  }
  const defaults = await prisma.memberPlate.count({
    where: {
      memberId: args.memberId,
      venueId: args.venueId,
      status: 'ACTIVE',
      isDefault: true,
      deletedAt: null,
    },
  })
  await prisma.memberPlate.create({
    data: {
      venueId: args.venueId,
      memberId: args.memberId,
      plate: args.plate,
      isDefault: defaults === 0,
    },
  })
}

export async function submitFtpClaim(
  args: SubmitFtpClaimArgs,
): Promise<SubmitFtpClaimResult> {
  const type = await prisma.ftpParkingType.findFirst({
    where: {
      id: args.typeId,
      venueId: args.venueId,
      isActive: true,
      deletedAt: null,
    },
  })
  if (!type || !type.claimUrl) return failure('THIS PARKING TYPE IS NOT AVAILABLE')

  const member = args.memberId
    ? await prisma.member.findFirst({
        where: {
          id: args.memberId,
          venueId: args.venueId,
          isActive: true,
          deletedAt: null,
        },
      })
    : null
  if (args.credentialKind === 'MEMBER' && !member) {
    return failure('THAT MEMBER IS NOT AVAILABLE')
  }

  const plate = normalisePlate(args.plate)
  if (!isValidPlate(plate)) return failure('INVALID NUMBER PLATE')

  const storedPlate = type.logPlates ? plate : null
  const memberName = member ? `${member.firstName} ${member.lastName}`.trim() : null
  const contact = resolveFtpContact({ member, type })
  const contactName = contact.name
  const contactEmail = contact.email
  const contactPhone = contact.phone

  if (storedPlate) {
    const since = new Date(Date.now() - DUPLICATE_LOOKBACK_HOURS * 60 * 60 * 1000)
    const candidates = await prisma.ftpClaim.findMany({
      where: {
        venueId: args.venueId,
        typeId: type.id,
        licensePlate: storedPlate,
        status: 'CONFIRMED',
        deletedAt: null,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
    })
    const today = wallClockParts(new Date(), args.timezone).date
    const existing = candidates.find(
      (claim) => wallClockParts(claim.createdAt, args.timezone).date === today,
    )
    if (existing) {
      return {
        claimId: existing.id,
        status: 'ALREADY_CLAIMED',
        ok: true,
        message: 'THIS PLATE ALREADY HAS A PARKING SESSION TODAY',
        plate,
        typeName: type.name,
        memberName,
        validFrom: existing.validFrom,
        validUntil: existing.validUntil,
        locations: (existing.locations as string[] | null) ?? [],
        already: {
          validUntil: existing.validUntil,
          claimedAt: existing.createdAt.toISOString(),
        },
        fallbackUrl: null,
        manualToken: null,
      }
    }
  }

  const claim = await prisma.ftpClaim.create({
    data: {
      venueId: args.venueId,
      typeId: type.id,
      typeName: type.name,
      memberId: member?.id ?? null,
      membershipNumber: member?.membershipNumber ?? null,
      credentialKind: args.credentialKind,
      licensePlate: storedPlate,
      contactName,
      contactEmail,
      contactPhone,
      claimCode: type.claimCode,
      status: 'PENDING',
    },
  })

  const result = await claimWithVpermit({
    claimUrl: type.claimUrl,
    contactName,
    contactEmail,
    plate,
  })

  await prisma.ftpClaim.update({
    where: { id: claim.id },
    data: {
      status: result.status,
      message: result.message,
      httpStatus: result.httpStatus,
      validFrom: result.validFrom,
      validUntil: result.validUntil,
      locations:
        result.locations.length > 0 ? result.locations : Prisma.JsonNull,
      confirmationText: result.confirmationText,
      durationMs: result.durationMs,
    },
  })

  if (result.status === 'CONFIRMED' && result.ok) {
    // Evidence is best-effort; never hide a confirmed claim because a file write failed.
    try {
      const venue = await prisma.venue.findUnique({
        where: { id: args.venueId },
        select: { name: true, timezone: true },
      })
      const paths = await writeFtpEvidence({
        claimId: claim.id,
        venueName: venue?.name ?? '',
        typeName: type.name,
        plate: storedPlate,
        credentialKind: args.credentialKind,
        membershipNumber: member?.membershipNumber ?? null,
        contactName,
        contactEmail,
        contactPhone,
        status: result.status,
        claimedAt: new Date(),
        timezone: venue?.timezone || args.timezone,
        validFrom: result.validFrom,
        validUntil: result.validUntil,
        locations: result.locations,
        confirmationText: result.confirmationText,
        screenshot: result.screenshot,
        html: result.html,
      })
      await prisma.ftpClaim.update({
        where: { id: claim.id },
        data: {
          evidencePdfPath: paths.pdfPath,
          evidenceImagePath: paths.imagePath,
          evidenceHtmlPath: paths.htmlPath,
        },
      })
    } catch {
      // Keep the confirmed claim even without the evidence files.
    }

    if (member && storedPlate) {
      try {
        await rememberMemberPlate({
          venueId: args.venueId,
          memberId: member.id,
          plate: storedPlate,
        })
      } catch {
        // The claim is still valid; the plate can be added later.
      }
    }
  }

  const manualToken =
    result.status === 'CONFIRMED' || result.status === 'ALREADY_CLAIMED'
      ? null
      : await createManualToken({ venueId: args.venueId, claimId: claim.id })

  return {
    claimId: claim.id,
    status: result.status,
    ok: result.ok,
    message: result.message,
    plate,
    typeName: type.name,
    memberName,
    validFrom: result.validFrom,
    validUntil: result.validUntil,
    locations: result.locations,
    fallbackUrl:
      result.status === 'CONFIRMED' || result.status === 'ALREADY_CLAIMED'
        ? null
        : type.claimUrl,
    manualToken,
  }
}

export type FtpManualOutcome = 'OPENED' | 'CONFIRMED' | 'NOT_CONFIRMED'

export async function setFtpManualOutcome(args: {
  venueId: string
  claimId: string
  outcome: FtpManualOutcome
}): Promise<{ ok: boolean; status?: FtpClaimStatus; message?: string }> {
  const claim = await prisma.ftpClaim.findFirst({
    where: { id: args.claimId, venueId: args.venueId, deletedAt: null },
  })
  if (!claim) return { ok: false, message: 'CLAIM NOT FOUND' }
  if (claim.status === 'CONFIRMED') return { ok: false, message: 'ALREADY CONFIRMED' }
  if (claim.status === 'ALREADY_CLAIMED') return { ok: false, message: 'ALREADY CLAIMED' }

  const allowed = [
    'FAILED',
    'CAPTCHA_BLOCKED',
    'EXHAUSTED',
    'MANUAL_OPENED',
    'MANUAL_CONFIRMED',
    'MANUAL_UNCONFIRMED',
  ]
  if (!allowed.includes(claim.status)) return { ok: false, message: 'CLAIM IS NOT WAITING' }
  if (args.outcome === 'OPENED' && claim.status === 'MANUAL_CONFIRMED') {
    return { ok: true, status: 'MANUAL_CONFIRMED' }
  }

  const status: FtpClaimStatus =
    args.outcome === 'OPENED'
      ? 'MANUAL_OPENED'
      : args.outcome === 'CONFIRMED'
        ? 'MANUAL_CONFIRMED'
        : 'MANUAL_UNCONFIRMED'

  await prisma.ftpClaim.update({ where: { id: claim.id }, data: { status } })
  return { ok: true, status }
}

/** Admin note on a claim (the plate log's follow-up field). */
export async function setFtpClaimNote(args: {
  venueId: string
  claimId: string
  note: string | null
}): Promise<boolean> {
  const result = await prisma.ftpClaim.updateMany({
    where: { id: args.claimId, venueId: args.venueId, deletedAt: null },
    data: { note: args.note?.trim() || null },
  })
  return result.count > 0
}
