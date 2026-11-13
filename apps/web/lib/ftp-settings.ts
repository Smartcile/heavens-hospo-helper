// Pure validation/normalisation for Settings → FTP ("Free the Carpark").

export const DEFAULT_KIOSK_RESET_SECONDS = 60
export const MIN_KIOSK_RESET_SECONDS = 15
export const MAX_KIOSK_RESET_SECONDS = 300
export const DEFAULT_FOUR_HOUR_MINUTES = 240
export const DEFAULT_FOUR_HOUR_NAME = '4 HOUR CAR PARK'
export const DEFAULT_STAFF_CARPARK_NAME = 'STAFF CARPARK'

export interface FtpSettingsInput {
  contactEmail: string | null
  kioskEnabled: boolean
  kioskAutoResetSeconds: number
  fourHourName: string
  fourHourEnabled: boolean
  fourHourEntryUrl: string | null
  fourHourDurationMinutes: number
  staffParkingEnabled: boolean
  staffCarparkName: string
  staffCarparkNotes: string | null
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normaliseEmail(raw: unknown): string | null {
  const value = typeof raw === 'string' ? raw.trim() : ''
  return value ? value : null
}

export function emailValidationError(raw: unknown): string | null {
  const value = normaliseEmail(raw)
  if (!value) return null
  return EMAIL_PATTERN.test(value) ? null : 'ENTER A VALID EMAIL OR LEAVE IT BLANK'
}

export function clampKioskResetSeconds(value: unknown): number {
  const raw = Number(value)
  if (!Number.isFinite(raw)) return DEFAULT_KIOSK_RESET_SECONDS
  return Math.min(MAX_KIOSK_RESET_SECONDS, Math.max(MIN_KIOSK_RESET_SECONDS, Math.round(raw)))
}

export function clampDurationMinutes(value: unknown, fallback: number): number {
  const raw = Number(value)
  if (!Number.isFinite(raw)) return fallback
  return Math.min(1440, Math.max(15, Math.round(raw)))
}

export function normaliseHttpUrl(
  raw: unknown,
): { ok: true; value: string | null } | { ok: false; error: string } {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) return { ok: true, value: null }
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { ok: false, error: 'THE URL MUST START WITH HTTP:// OR HTTPS://' }
    }
    return { ok: true, value: url.toString() }
  } catch {
    return { ok: false, error: 'THAT IS NOT A VALID URL' }
  }
}

export type NormaliseFtpResult =
  | { ok: true; value: FtpSettingsInput }
  | { ok: false; error: string }

export function normaliseFtpInput(body: Record<string, unknown>): NormaliseFtpResult {
  const emailError = emailValidationError(body.contactEmail)
  if (emailError) return { ok: false, error: emailError }

  const fourHourUrl = normaliseHttpUrl(body.fourHourEntryUrl)
  if (!fourHourUrl.ok) return { ok: false, error: fourHourUrl.error }

  const fourHourEnabled = body.fourHourEnabled === true
  if (fourHourEnabled && !fourHourUrl.value) {
    return { ok: false, error: 'PASTE THE 4 HOUR CARPARK URL BEFORE ENABLING' }
  }

  const fourHourName =
    typeof body.fourHourName === 'string' && body.fourHourName.trim()
      ? body.fourHourName.trim().toUpperCase()
      : DEFAULT_FOUR_HOUR_NAME
  const staffCarparkName =
    typeof body.staffCarparkName === 'string' && body.staffCarparkName.trim()
      ? body.staffCarparkName.trim().toUpperCase()
      : DEFAULT_STAFF_CARPARK_NAME
  const notes = typeof body.staffCarparkNotes === 'string' ? body.staffCarparkNotes.trim() : ''

  return {
    ok: true,
    value: {
      contactEmail: normaliseEmail(body.contactEmail),
      kioskEnabled: body.kioskEnabled === true,
      kioskAutoResetSeconds: clampKioskResetSeconds(body.kioskAutoResetSeconds),
      fourHourName,
      fourHourEnabled,
      fourHourEntryUrl: fourHourUrl.value,
      fourHourDurationMinutes: clampDurationMinutes(
        body.fourHourDurationMinutes,
        DEFAULT_FOUR_HOUR_MINUTES,
      ),
      staffParkingEnabled: body.staffParkingEnabled === true,
      staffCarparkName,
      staffCarparkNotes: notes || null,
    },
  }
}

export function ftpSettingsView(row: {
  contactEmail?: string | null
  kioskEnabled?: boolean | null
  kioskCodeHint?: string | null
  kioskAutoResetSeconds?: number | null
  fourHourName?: string | null
  fourHourEnabled?: boolean | null
  fourHourEntryUrl?: string | null
  fourHourDurationMinutes?: number | null
  staffParkingEnabled?: boolean | null
  staffCarparkName?: string | null
  staffCarparkNotes?: string | null
} | null) {
  return {
    contactEmail: row?.contactEmail ?? null,
    kioskEnabled: Boolean(row?.kioskEnabled),
    kioskCodeHint: row?.kioskCodeHint ?? null,
    kioskAutoResetSeconds: clampKioskResetSeconds(row?.kioskAutoResetSeconds),
    fourHourName: row?.fourHourName ?? DEFAULT_FOUR_HOUR_NAME,
    fourHourEnabled: Boolean(row?.fourHourEnabled),
    fourHourEntryUrl: row?.fourHourEntryUrl ?? null,
    fourHourDurationMinutes: clampDurationMinutes(
      row?.fourHourDurationMinutes,
      DEFAULT_FOUR_HOUR_MINUTES,
    ),
    staffParkingEnabled: Boolean(row?.staffParkingEnabled),
    staffCarparkName: row?.staffCarparkName ?? DEFAULT_STAFF_CARPARK_NAME,
    staffCarparkNotes: row?.staffCarparkNotes ?? null,
  }
}

export function kioskUrlFor(appUrl: string | undefined | null): string {
  const base = (appUrl ?? '').trim().replace(/\/+$/, '') || 'http://localhost:3000'
  return `${base}/park`
}
