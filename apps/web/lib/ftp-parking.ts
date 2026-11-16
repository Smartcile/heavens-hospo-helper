// Pure validation/display helpers for the FTP 4-hour parking types, test
// members and claim log. Prisma-free; the server half lives in
// `ftp-parking.server.ts`.

import {
  emailValidationError,
  normaliseEmail,
} from './ftp-settings'
import { DEFAULT_HEALTH_PLATE, isValidPlate, normalisePlate } from './parking'
import {
  membershipNumberError,
  normaliseMembershipNumber,
  parseVpermitClaimUrl,
  type FtpClaimStatus,
} from './vpermit'

export const FTP_TYPE_NAME_MAX = 60
export const FTP_WINDOW_LABEL_MAX = 40
export const FTP_CONTACT_NAME_MAX = 80
export const FTP_PHONE_MAX = 30
export const FTP_NOTES_MAX = 500
export const FTP_MEMBER_NAME_MAX = 60
export const FTP_GUEST_LABEL_MAX = 60
export const DEFAULT_FTP_DURATION_MINUTES = 240
export const GUEST_PLATE_LIMIT_DEFAULT = 50
export const GUEST_PLATE_LIMIT_MIN = 1
export const GUEST_PLATE_LIMIT_MAX = 9999
export const FTP_HEALTH_PLATE = DEFAULT_HEALTH_PLATE

export type FtpHealthCheckMode = 'BROWSER' | 'FULL' | 'OFF'

export interface FtpTypeInput {
  name: string
  windowLabel: string | null
  durationMinutes: number
  claimUrl: string | null
  claimCode: string | null
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  useContactEmail: boolean
  useContactPhone: boolean
  logPlates: boolean
  showOnKiosk: boolean
  adminPinEnabled: boolean
  adminPin: string | null
  guestEntryEnabled: boolean
  guestEntryLabel: string | null
  guestPlateLimitEnabled: boolean
  guestPlateLimit: number | null
  healthCheckMode: FtpHealthCheckMode
  healthPlate: string
  sortOrder: number
  notes: string | null
  isActive: boolean
}

export interface FtpTestMemberInput {
  membershipNumber: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  parkingTypeId: string
  isActive: boolean
  isTest: boolean
  notes: string | null
}

export type NormaliseFtpTypeResult =
  | { ok: true; value: FtpTypeInput }
  | { ok: false; error: string }

export type NormaliseFtpMemberResult =
  | { ok: true; value: FtpTestMemberInput }
  | { ok: false; error: string }

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function upper(value: unknown): string {
  return text(value).toUpperCase()
}

function nullableUpper(value: unknown, max: number): string | null | undefined {
  const v = upper(value)
  if (!v) return null
  if (v.length > max) return undefined
  return v
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function phoneError(value: string): string | null {
  if (!value) return null
  if (value.length > FTP_PHONE_MAX) return 'PHONE NUMBER IS TOO LONG'
  if (!/^[0-9+()\s-]{6,30}$/.test(value)) return 'ENTER A VALID PHONE NUMBER'
  return null
}

function normalisePhone(value: unknown): string | null {
  return text(value) || null
}

export function normaliseHealthCheckMode(value: unknown): FtpHealthCheckMode {
  return value === 'FULL' || value === 'OFF' || value === 'BROWSER' ? value : 'BROWSER'
}

export function normaliseFtpTypeInput(body: Record<string, unknown>): NormaliseFtpTypeResult {
  const name = upper(body.name)
  if (!name) return { ok: false, error: 'ENTER A NAME FOR THIS PARKING TYPE' }
  if (name.length > FTP_TYPE_NAME_MAX) {
    return { ok: false, error: `NAME MUST BE ${FTP_TYPE_NAME_MAX} CHARACTERS OR FEWER` }
  }

  const windowLabel = nullableUpper(body.windowLabel, FTP_WINDOW_LABEL_MAX)
  if (windowLabel === undefined) {
    return { ok: false, error: `WINDOW LABEL MUST BE ${FTP_WINDOW_LABEL_MAX} CHARACTERS OR FEWER` }
  }

  const contactName = nullableUpper(body.contactName, FTP_CONTACT_NAME_MAX)
  if (contactName === undefined) {
    return { ok: false, error: `CONTACT NAME MUST BE ${FTP_CONTACT_NAME_MAX} CHARACTERS OR FEWER` }
  }

  const emailError = emailValidationError(body.contactEmail)
  if (emailError) return { ok: false, error: emailError }

  const contactPhone = normalisePhone(body.contactPhone)
  const phoneErr = phoneError(contactPhone ?? '')
  if (phoneErr) return { ok: false, error: phoneErr }

  const parsedUrl = parseVpermitClaimUrl(body.claimUrl)
  const claimUrl = parsedUrl.ok ? parsedUrl.value.url : null
  const claimCode = parsedUrl.ok ? parsedUrl.value.code : null
  const rawUrl = text(body.claimUrl)
  if (rawUrl && !parsedUrl.ok) {
    return { ok: false, error: parsedUrl.error }
  }

  const isActive = body.isActive !== false
  if (isActive && !claimUrl) {
    return { ok: false, error: 'PASTE THE VPERMIT CLAIM URL BEFORE ACTIVATING' }
  }

  const adminPinEnabled = body.adminPinEnabled === true
  const adminPin = text(body.adminPin) || null
  if (adminPin && !/^[0-9]{4,8}$/.test(adminPin)) {
    return { ok: false, error: 'ADMIN PIN MUST BE 4–8 DIGITS' }
  }

  const guestEntryLabel = nullableUpper(body.guestEntryLabel, FTP_GUEST_LABEL_MAX)
  if (guestEntryLabel === undefined) {
    return { ok: false, error: `GUEST ENTRY LABEL MUST BE ${FTP_GUEST_LABEL_MAX} CHARACTERS OR FEWER` }
  }

  const guestPlateLimitEnabled = body.guestPlateLimitEnabled === true
  const guestPlateLimit = guestPlateLimitEnabled
    ? clampInt(body.guestPlateLimit, GUEST_PLATE_LIMIT_DEFAULT, GUEST_PLATE_LIMIT_MIN, GUEST_PLATE_LIMIT_MAX)
    : null

  const healthPlate = normalisePlate(text(body.healthPlate) || FTP_HEALTH_PLATE)
  if (!isValidPlate(healthPlate)) {
    return { ok: false, error: 'HEALTH CHECK PLATE MUST BE 1�?"6 LETTERS OR DIGITS' }
  }

  const notes = text(body.notes) || null
  if (notes && notes.length > FTP_NOTES_MAX) {
    return { ok: false, error: `NOTES MUST BE ${FTP_NOTES_MAX} CHARACTERS OR FEWER` }
  }

  return {
    ok: true,
    value: {
      name,
      windowLabel: windowLabel ?? null,
      durationMinutes: clampInt(
        body.durationMinutes,
        DEFAULT_FTP_DURATION_MINUTES,
        15,
        1440,
      ),
      claimUrl,
      claimCode,
      contactName: contactName ?? null,
      contactEmail: normaliseEmail(body.contactEmail),
      contactPhone,
      useContactEmail: body.useContactEmail !== false,
      useContactPhone: body.useContactPhone !== false,
      logPlates: body.logPlates !== false,
      showOnKiosk: body.showOnKiosk !== false,
      adminPinEnabled,
      adminPin,
      guestEntryEnabled: body.guestEntryEnabled === true,
      guestEntryLabel: guestEntryLabel ?? null,
      guestPlateLimitEnabled,
      guestPlateLimit,
      healthCheckMode: normaliseHealthCheckMode(body.healthCheckMode),
      healthPlate,
      sortOrder: clampInt(body.sortOrder, 0, 0, 999),
      notes,
      isActive,
    },
  }
}

export function normaliseTestMemberInput(
  body: Record<string, unknown>,
): NormaliseFtpMemberResult {
  const membershipError = membershipNumberError(body.membershipNumber)
  if (membershipError) return { ok: false, error: membershipError }

  const firstName = upper(body.firstName)
  const lastName = upper(body.lastName)
  if (!firstName) return { ok: false, error: 'ENTER A FIRST NAME' }
  if (!lastName) return { ok: false, error: 'ENTER A LAST NAME' }
  if (firstName.length > FTP_MEMBER_NAME_MAX || lastName.length > FTP_MEMBER_NAME_MAX) {
    return { ok: false, error: `NAMES MUST BE ${FTP_MEMBER_NAME_MAX} CHARACTERS OR FEWER` }
  }

  const emailError = emailValidationError(body.email)
  if (emailError) return { ok: false, error: emailError }

  const phone = normalisePhone(body.phone)
  const phoneErr = phoneError(phone ?? '')
  if (phoneErr) return { ok: false, error: phoneErr }

  const parkingTypeId = text(body.parkingTypeId)
  if (!parkingTypeId) return { ok: false, error: 'CHOOSE A PARKING TYPE' }

  const notes = text(body.notes) || null
  if (notes && notes.length > FTP_NOTES_MAX) {
    return { ok: false, error: `NOTES MUST BE ${FTP_NOTES_MAX} CHARACTERS OR FEWER` }
  }

  return {
    ok: true,
    value: {
      membershipNumber: normaliseMembershipNumber(body.membershipNumber),
      firstName,
      lastName,
      email: normaliseEmail(body.email),
      phone,
      parkingTypeId,
      isActive: body.isActive !== false,
      isTest: body.isTest === true,
      notes,
    },
  }
}

export interface FtpContactInput {
  member: {
    firstName: string
    lastName: string
    email: string | null
    phone: string | null
  } | null
  type: {
    contactName: string | null
    contactEmail: string | null
    contactPhone: string | null
    useContactEmail: boolean
    useContactPhone: boolean
  }
}

/**
 * Decide which contact details go to the vendor. When the type's "use contact"
 * switch is on, the member's own email/phone is deliberately ignored.
 */
export function resolveFtpContact(input: FtpContactInput): {
  name: string | null
  email: string | null
  phone: string | null
} {
  const memberName = input.member
    ? `${input.member.firstName} ${input.member.lastName}`.trim()
    : null

  return {
    name: memberName || input.type.contactName || null,
    email: input.type.useContactEmail
      ? input.type.contactEmail
      : input.member?.email ?? input.type.contactEmail ?? null,
    phone: input.type.useContactPhone
      ? input.type.contactPhone
      : input.member?.phone ?? input.type.contactPhone ?? null,
  }
}

export function memberDisplayName(member: {
  firstName: string
  lastName: string
}): string {
  return `${member.firstName} ${member.lastName}`.trim()
}

export function sortMemberPlates<T extends { isDefault: boolean; createdAt: Date | string }>(
  plates: T[],
): T[] {
  return [...plates].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })
}

export function defaultMemberPlate<T extends { isDefault: boolean }>(plates: T[]): T | null {
  return plates.find((plate) => plate.isDefault) ?? plates[0] ?? null
}

export function credentialLabel(kind: string): string {
  return kind === 'ADMIN_PIN' ? 'ADMIN PIN' : 'MEMBER'
}

export function claimStatusTone(status: string): 'success' | 'warning' | 'danger' | 'muted' {
  if (status === 'CONFIRMED' || status === 'MANUAL_CONFIRMED') return 'success'
  if (status === 'ALREADY_CLAIMED' || status === 'MANUAL_OPENED') return 'warning'
  if (status === 'PENDING') return 'muted'
  return 'danger'
}

export function describeValidity(
  validFrom: string | null,
  validUntil: string | null,
): string {
  if (validFrom && validUntil) return `${validFrom} – ${validUntil}`
  if (validUntil) return `UNTIL ${validUntil}`
  if (validFrom) return `FROM ${validFrom}`
  return 'NO VALIDITY RETURNED'
}

export function isClaimStatus(status: string): status is FtpClaimStatus {
  return [
    'PENDING',
    'CONFIRMED',
    'FAILED',
    'ALREADY_CLAIMED',
    'EXHAUSTED',
    'CAPTCHA_BLOCKED',
    'MANUAL_OPENED',
    'MANUAL_CONFIRMED',
    'MANUAL_UNCONFIRMED',
  ].includes(status)
}
