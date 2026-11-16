// Pure helpers for the event guest-entry link ("customer entry"). A guest
// scans a QR code, enters the link's shared PIN, then enters plate after plate.
// Every plate is submitted to the link's vPermit claim URL.
//
// Keep this file Prisma-free: the public page and its client components import
// it. The server half lives in `ftp-guest-entry.server.ts`.

import { DEFAULT_FOUR_HOUR_MINUTES } from './ftp-settings'
import { isValidAdminPin } from './vpermit'

export const DEFAULT_GUEST_ENTRY_LABEL = 'CUSTOMER ENTRY'
export const GUEST_ENTRY_LABEL_MAX = 60
export const GUEST_TOKEN_TTL_MINUTES = 120
export const GUEST_CLAIM_CREDENTIAL_KIND = 'GUEST'

export const GUEST_LIMIT_MIN = 1
export const GUEST_LIMIT_MAX = 9999
export const GUEST_LIMIT_DEFAULT = 50

export function guestEntryLabel(label: string | null | undefined): string {
  const value = (label ?? '').trim().toUpperCase()
  return value || DEFAULT_GUEST_ENTRY_LABEL
}

export function normaliseGuestLimit(raw: unknown): number {
  if (raw === null || raw === undefined || raw === '') return GUEST_LIMIT_DEFAULT
  const value = Number(raw)
  if (!Number.isFinite(value)) return GUEST_LIMIT_DEFAULT
  return Math.min(GUEST_LIMIT_MAX, Math.max(GUEST_LIMIT_MIN, Math.round(value)))
}

export function guestPinError(raw: unknown): string | null {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) return 'ENTER THE CUSTOMER ENTRY PIN'
  if (!isValidAdminPin(value)) return 'THE PIN MUST BE 4–8 DIGITS'
  return null
}

export interface GuestSlotClaim {
  createdAt: Date
}

export interface GuestSlotInput {
  limitEnabled: boolean
  limit: number | null
  durationMinutes: number
  claims: GuestSlotClaim[]
  now?: Date
}

export interface GuestSlotState {
  used: number
  limit: number | null
  remaining: number | null
  full: boolean
  /** When the oldest occupied slot expires and a new plate can be entered. */
  nextFreeAt: Date | null
}

/**
 * Rolling slot maths. Each confirmed guest claim occupies one slot for the
 * link's duration. When the link is full, the oldest active claim's expiry is
 * when the next slot frees.
 */
export function guestSlotState(input: GuestSlotInput): GuestSlotState {
  const now = input.now ?? new Date()
  const duration = Math.max(
    1,
    Number.isFinite(input.durationMinutes)
      ? input.durationMinutes
      : DEFAULT_FOUR_HOUR_MINUTES,
  )
  const windowStart = now.getTime() - duration * 60_000
  const active = input.claims
    .map((claim) => claim.createdAt)
    .filter((at) => {
      const time = at.getTime()
      return time > windowStart && time <= now.getTime()
    })
    .sort((a, b) => a.getTime() - b.getTime())

  const used = active.length
  const limit =
    input.limitEnabled && input.limit != null ? normaliseGuestLimit(input.limit) : null
  const remaining = limit == null ? null : Math.max(0, limit - used)
  const full = limit != null && used >= limit
  const nextFreeAt = full
    ? new Date(active[0].getTime() + duration * 60_000)
    : null

  return { used, limit, remaining, full, nextFreeAt }
}

export function describeGuestSlots(state: GuestSlotState): string {
  if (state.limit == null) return `${state.used} PLATES ENTERED`
  if (state.full) return `FULL · ${state.used}/${state.limit} PLATES`
  return `${state.remaining} OF ${state.limit} SLOTS LEFT`
}

/** Venue-local clock label for the next free slot, e.g. `14:30`. */
export function formatGuestNextFree(
  date: Date | string | null | undefined,
  timezone: string,
): string {
  if (!date) return ''
  const value = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(value.getTime())) return ''
  return new Intl.DateTimeFormat('en-NZ', {
    timeZone: timezone || 'Pacific/Auckland',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(value)
}

export function guestResultTone(status: string): 'success' | 'warning' | 'danger' {
  if (status === 'CONFIRMED') return 'success'
  if (status === 'ALREADY_CLAIMED' || status === 'EXHAUSTED') return 'warning'
  return 'danger'
}

export function guestResultTitle(status: string): string {
  switch (status) {
    case 'CONFIRMED':
      return 'PARKING CONFIRMED'
    case 'ALREADY_CLAIMED':
      return 'ALREADY REGISTERED'
    case 'EXHAUSTED':
      return 'NO SLOTS LEFT'
    case 'CAPTCHA_BLOCKED':
      return 'COULD NOT START'
    default:
      return 'COULD NOT START'
  }
}
