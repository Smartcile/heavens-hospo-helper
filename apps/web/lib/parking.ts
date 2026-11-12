// Pure helpers for the optional Scan2Pay guest-parking integration.
//
// This file must stay Prisma-free and Node-free: the worker UI imports it in
// the browser. All network work lives in `parking.server.ts`.

export const SCAN2PAY_HOSTS = ['scan2pay.nz', 'www.scan2pay.nz'] as const
export const SCAN2PAY_BASE_URL = 'https://scan2pay.nz'
export const PLATE_PATTERN = /^[A-Z0-9]{1,6}$/
export const DEFAULT_PARKING_DURATION_MINUTES = 90
export const DEFAULT_HEALTH_PLATE = 'STELLA'
export const HEALTH_STALE_HOURS = 36
export const MAX_ARRIVAL_LOOKBACK_MINUTES = 90

export type ParkingCheckMode = 'READINESS' | 'FULL' | 'OFF'
export type ParkingStatus = 'SUBMITTED' | 'CONFIRMED' | 'FAILED' | 'ALREADY_ACTIVE'

export interface ParsedScan2PayUrl {
  baseUrl: string
  carparkId: number
  entryUrl: string
}

export type ParseScan2PayUrlResult =
  | { ok: true; url: ParsedScan2PayUrl }
  | { ok: false; error: string }

export interface ParkingWindow {
  entry: string
  exit: string
  startsAt: Date
  expiresAt: Date
}

export interface ArrivalCheck {
  error?: string
  warning?: string
}

export interface ExistingSession {
  active: boolean
  transactionId?: string
  expiry?: string
}

export interface CreateSessionParseResult {
  status: ParkingStatus
  ok: boolean
  message: string
  confirmationRef?: string
  snippet: string
}

export interface ParkingHealthState {
  ok: boolean
  stale: boolean
  message: string
}

export type CookieJar = Record<string, string>

// ── URL / config ──────────────────────────────────────────────────────

/** Uppercase a plate and drop the separators people type (spaces / hyphens). */
export function normalisePlate(input: string): string {
  return (input ?? '').toUpperCase().replace(/[\s-]/g, '')
}

export function isValidPlate(input: string): boolean {
  return PLATE_PATTERN.test(input)
}

/**
 * Accept only a Scan2Pay carpark page URL and derive the carpark id from it.
 * This keeps the integration silent for FOSS installs: another host is refused.
 */
export function parseScan2PayUrl(raw: string): ParseScan2PayUrlResult {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return { ok: false, error: 'PASTE THE CARPARK URL' }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return { ok: false, error: 'THAT IS NOT A VALID URL' }
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'ONLY HTTP(S) CARPARK URLS ARE SUPPORTED' }
  }

  const host = url.hostname.toLowerCase()
  if (!(SCAN2PAY_HOSTS as readonly string[]).includes(host)) {
    return { ok: false, error: 'ONLY SCAN2PAY.NZ CARPARK URLS ARE SUPPORTED' }
  }

  if (!/^\/parking\/scan\/?$/i.test(url.pathname)) {
    return { ok: false, error: 'USE THE CARPARK PAGE URL THAT ENDS IN /Parking/Scan?carparkId=…' }
  }

  const rawId =
    url.searchParams.get('carparkId') ??
    url.searchParams.get('carparkid') ??
    url.searchParams.get('CarparkId') ??
    ''
  const carparkId = Number.parseInt(rawId, 10)
  if (!Number.isInteger(carparkId) || carparkId <= 0) {
    return { ok: false, error: 'THE URL IS MISSING A VALID carparkId' }
  }

  return {
    ok: true,
    url: {
      baseUrl: SCAN2PAY_BASE_URL,
      carparkId,
      entryUrl: `${SCAN2PAY_BASE_URL}/Parking/Scan?carparkId=${carparkId}`,
    },
  }
}

export function buildSelectTimeUrl(args: {
  baseUrl: string
  carparkId: number
  carparkName?: string | null
  plate: string
}): string {
  const params = new URLSearchParams({
    CarparkId: String(args.carparkId),
    CarparkName: args.carparkName ?? '',
    LicensePlate: args.plate,
  })
  return `${args.baseUrl.replace(/\/+$/, '')}/Parking/SelectTime?${params.toString()}`
}

// ── Dates ─────────────────────────────────────────────────────────────

/** Venue-local wall-clock parts for an instant (no timezone offset). */
export function wallClockParts(date: Date, timezone: string): { date: string; time: string; dateTime: string } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const parts = fmt.formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  const dateStr = `${get('year')}-${get('month')}-${get('day')}`
  const timeStr = `${get('hour')}:${get('minute')}:${get('second')}`
  return { date: dateStr, time: timeStr, dateTime: `${dateStr}T${timeStr}` }
}

/** Scan2Pay expects `yyyy-MM-ddTHH:mm:ss` in the carpark's local timezone. */
export function buildParkingWindow(
  arrivedAt: Date,
  timezone: string,
  durationMinutes: number = DEFAULT_PARKING_DURATION_MINUTES,
): ParkingWindow {
  const expiresAt = new Date(arrivedAt.getTime() + durationMinutes * 60_000)
  return {
    entry: wallClockParts(arrivedAt, timezone).dateTime,
    exit: wallClockParts(expiresAt, timezone).dateTime,
    startsAt: arrivedAt,
    expiresAt,
  }
}

/** Reject future arrivals and arrivals whose free window has already elapsed. */
export function checkArrival(
  arrivedAt: Date,
  now: Date,
  durationMinutes: number = DEFAULT_PARKING_DURATION_MINUTES,
): ArrivalCheck {
  if (Number.isNaN(arrivedAt.getTime())) return { error: 'ARRIVAL TIME IS NOT VALID' }

  const futureMs = arrivedAt.getTime() - now.getTime()
  if (futureMs > 2 * 60_000) return { error: 'ARRIVAL TIME IS IN THE FUTURE' }

  const lookbackMs = now.getTime() - arrivedAt.getTime()
  const limitMinutes = Math.max(durationMinutes, MAX_ARRIVAL_LOOKBACK_MINUTES)
  if (lookbackMs > limitMinutes * 60_000) {
    return { error: `ARRIVAL WAS MORE THAN ${limitMinutes} MINUTES AGO — THE FREE WINDOW HAS ALREADY PASSED` }
  }

  return {}
}

export function formatVenueDateTime(date: Date, timezone: string): string {
  const parts = wallClockParts(date, timezone)
  return `${parts.date.slice(5).replace('-', '/')} ${parts.time.slice(0, 5)}`
}

// ── HTML parsing (the Scan2Pay pages) ────────────────────────────────

/** Pull the ASP.NET antiforgery token out of the SelectTime page. */
export function parseAntiforgeryToken(html: string): string | null {
  const tag = html.match(/<input[^>]*__RequestVerificationToken[^>]*>/i)?.[0]
  if (!tag) return null
  return tag.match(/value="([^"]+)"/i)?.[1] ?? null
}

/** The carpark name shown on the Scan page (`<div class="location">…</div>`). */
export function parseCarparkName(html: string): string | null {
  const match = html.match(/<div[^>]*class="[^"]*\blocation\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
  if (!match) return null
  const text = decodeEntities(match[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
  return text || null
}

/**
 * A plate with a live/expired session is rendered with a non-empty
 * ExistingTransactionId, IsExtendingSession="True" or an expired-session notice.
 */
export function detectExistingSession(html: string): ExistingSession {
  const transactionId =
    html.match(/id="existingTransactionId"[^>]*value="([^"]*)"/i)?.[1]?.trim() || undefined
  const extending = /id="isExtendingSession"[^>]*value="true"/i.test(html)
  const expiredNotice = /class="[^"]*expired-session-notice/i.test(html)
  const expiry =
    html.match(/id="originalExpiryTime"[^>]*value="([^"]+)"/i)?.[1]?.trim() || undefined

  return {
    active: Boolean(transactionId) || extending || expiredNotice,
    transactionId,
    expiry,
  }
}

/** Tolerant parse of the CreateSession response (its markup is not documented). */
export function parseCreateSessionResult(input: {
  httpStatus: number
  html: string
  finalUrl?: string
}): CreateSessionParseResult {
  const text = textOf(input.html)
  const haystack = `${input.finalUrl ?? ''} ${text}`.toLowerCase()
  const snippet = snippetAround(text, ['success', 'confirm', 'already', 'paid until', 'error', 'invalid', 'unable'], 280)
  const confirmationRef = extractConfirmationRef(text, input.html)

  if (input.httpStatus >= 400) {
    return {
      status: 'FAILED',
      ok: false,
      message: `SCAN2PAY RETURNED ${input.httpStatus}`,
      confirmationRef,
      snippet,
    }
  }

  if (/already|existing session|active session/.test(haystack)) {
    return {
      status: 'ALREADY_ACTIVE',
      ok: true,
      message: 'THIS PLATE ALREADY HAS A SESSION TODAY',
      confirmationRef,
      snippet,
    }
  }

  const error =
    /text-danger|validation-summary|an error occurred|could not|invalid|is required|not available|unable to/.test(
      haystack,
    )
  const success =
    /success|confirmed|confirmation|paid until|thank you|receipt|session created|parking session/.test(haystack)

  if (success || !error) {
    return {
      status: 'CONFIRMED',
      ok: true,
      message: 'PARKING REGISTERED',
      confirmationRef,
      snippet,
    }
  }

  return {
    status: 'FAILED',
    ok: false,
    message: 'SCAN2PAY DID NOT CONFIRM THE SESSION',
    confirmationRef,
    snippet,
  }
}

// ── Cookies ───────────────────────────────────────────────────────────

/** Merge `Set-Cookie` header values into a simple name→value jar. */
export function applySetCookies(jar: CookieJar, setCookies: string[]): CookieJar {
  const next: CookieJar = { ...jar }
  for (const raw of setCookies) {
    if (!raw) continue
    const first = raw.split(';', 1)[0]
    const eq = first.indexOf('=')
    if (eq <= 0) continue
    const name = first.slice(0, eq).trim()
    const value = first.slice(eq + 1).trim()
    if (name) next[name] = value
  }
  return next
}

export function cookieHeader(jar: CookieJar): string {
  return Object.entries(jar)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')
}

// ── Health ────────────────────────────────────────────────────────────

export function parkingHealthState(
  lastCheckAt: Date | null | undefined,
  lastCheckOk: boolean | null | undefined,
  lastCheckMessage: string | null | undefined,
  now: Date,
): ParkingHealthState {
  if (!lastCheckAt) return { ok: false, stale: true, message: 'NO CHECK HAS RUN YET' }

  const ageMs = now.getTime() - lastCheckAt.getTime()
  if (ageMs > HEALTH_STALE_HOURS * 60 * 60 * 1000) {
    const hours = Math.max(1, Math.floor(ageMs / 3_600_000))
    return { ok: false, stale: true, message: `LAST CHECK WAS ${hours}H AGO` }
  }

  return {
    ok: lastCheckOk === true,
    stale: false,
    message: lastCheckMessage || (lastCheckOk === true ? 'OK' : 'FAILED'),
  }
}

export function normaliseCheckMode(value: unknown): ParkingCheckMode {
  return value === 'FULL' || value === 'OFF' || value === 'READINESS' ? value : 'READINESS'
}

// ── Internal text helpers ─────────────────────────────────────────────

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
}

function textOf(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim()
}

function snippetAround(text: string, keywords: string[], max: number): string {
  const lower = text.toLowerCase()
  for (const keyword of keywords) {
    const index = lower.indexOf(keyword)
    if (index >= 0) {
      const start = Math.max(0, index - 80)
      return text.slice(start, start + max).trim()
    }
  }
  return text.slice(0, max).trim()
}

function extractConfirmationRef(text: string, html: string): string | undefined {
  const patterns = [
    /(?:transaction|reference|receipt)\s*(?:id|number|no\.?|#)?\s*[:#]?\s*([A-Z0-9-]*\d[A-Z0-9-]{2,})/i,
    /id="(?:transactionId|receiptNumber|reference)"[^>]*value="([^"]+)"/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern) ?? html.match(pattern)
    const value = match?.[1]?.trim()
    if (value && !/^(id|number|the|your|session)$/i.test(value)) return value
  }
  return undefined
}
