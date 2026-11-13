// Pure, Prisma-free helpers for the customer parking kiosk. Imported by the
// browser UI and the server routes, so nothing here may touch Node crypto or
// the database. The server half lives in `parking-kiosk.server.ts`.

export const KIOSK_COOKIE_NAME = 'hospo-parking-kiosk'
export const KIOSK_COOKIE_MAX_AGE_DAYS = 30
export const KIOSK_CODE_MIN_LENGTH = 6
// Unambiguous alphabet: no O/0 or I/1.
export const KIOSK_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const PLATE_MAX_LENGTH = 6
export const KIOSK_EXIT_HOLD_MS = 5000
export const KIOSK_EXIT_LOCKOUT_MS = 60_000
export const KIOSK_EXIT_MAX_ATTEMPTS = 5

export function normaliseKioskCode(raw: string): string {
  return (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function kioskCodeError(raw: string): string | null {
  const code = normaliseKioskCode(raw)
  if (code.length < KIOSK_CODE_MIN_LENGTH) {
    return `KIOSK CODE MUST BE AT LEAST ${KIOSK_CODE_MIN_LENGTH} CHARACTERS`
  }
  if (code.length > 24) return 'KIOSK CODE IS TOO LONG'
  return null
}

export function isValidKioskCode(raw: string): boolean {
  return kioskCodeError(raw) === null
}

export function isPlateKey(key: string): boolean {
  return /^[A-Z0-9]$/.test(key)
}

/** Append one keypad press, or a pasted string, keeping 1–6 alphanumerics. */
export function appendPlateKey(plate: string, key: string): string {
  const cleaned = String(key ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  if (!cleaned) return plate
  return `${plate}${cleaned}`.slice(0, PLATE_MAX_LENGTH)
}

export function removeLastPlateKey(plate: string): string {
  return plate.slice(0, -1)
}

/** `45` → `0:45`, `90` → `1:30`. Never negative. */
export function formatKioskCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** 1 → full bar at the start of the countdown, 0 → empty. */
export function kioskCountdownProgress(
  remainingSeconds: number,
  totalSeconds: number,
): number {
  if (totalSeconds <= 0) return 0
  const clamped = Math.max(0, Math.min(totalSeconds, remainingSeconds))
  return clamped / totalSeconds
}

/** Venue-local clock label, e.g. `22:15`. */
export function formatKioskClock(date: Date, timezone: string): string {
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-NZ', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

/** Once-per-day messaging for the duplicate case. */
export function describeKioskResult(status: string): string {
  if (status === 'ALREADY_ACTIVE') return 'ALREADY REGISTERED'
  if (status === 'CONFIRMED') return 'REGISTERED'
  return 'COULD NOT REGISTER'
}
