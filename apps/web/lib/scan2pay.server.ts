// Server-only Scan2Pay client. Replays the public carpark form flow
// (SelectTime → CreateSession) with a manual cookie jar because Node's fetch
// does not persist cookies. Never call this from a client component.

import {
  applySetCookies,
  buildParkingWindow,
  buildSelectTimeUrl,
  cookieHeader,
  detectExistingSession,
  isValidPlate,
  normalisePlate,
  parseAntiforgeryToken,
  parseCarparkName,
  parseCreateSessionResult,
  type CookieJar,
  type ExistingSession,
  type ParkingStatus,
  type ParkingWindow,
} from './parking'

const TIMEOUT_MS = 15_000
const MAX_REDIRECTS = 5

export interface ParkingTarget {
  baseUrl: string
  carparkId: number
  carparkName?: string | null
  durationMinutes?: number
}

interface PageResult {
  ok: boolean
  status: number
  finalUrl: string
  html: string
  jar: CookieJar
}

export interface SelectTimeResult {
  ok: boolean
  status: number
  url: string
  html: string
  token: string | null
  existing: ExistingSession
  jar: CookieJar
}

export interface RegisterParkingArgs {
  target: ParkingTarget
  plate: string
  arrivedAt: Date
  timezone: string
}

export interface RegisterParkingResult {
  status: ParkingStatus
  ok: boolean
  message: string
  licensePlate: string
  window: ParkingWindow
  confirmationRef?: string
  snippet: string
  httpStatus: number
  existing?: ExistingSession
}

export interface ParkingCheckResult {
  ok: boolean
  httpStatus: number
  message: string
  mode: 'READINESS' | 'FULL'
  confirmationRef?: string
  snippet: string
  existing: ExistingSession
}

type HeadersWithSetCookie = Headers & { getSetCookie?: () => string[] }

function setCookiesFrom(res: Response): string[] {
  const headers = res.headers as HeadersWithSetCookie
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie()
  const single = res.headers.get('set-cookie')
  return single ? [single] : []
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function fetchPage(
  url: string,
  jar: CookieJar,
  init?: RequestInit,
  redirects = 0,
): Promise<PageResult> {
  const headers = new Headers(init?.headers)
  headers.set('Accept', 'text/html,application/xhtml+xml')
  if (Object.keys(jar).length > 0) headers.set('Cookie', cookieHeader(jar))

  const res = await fetch(url, {
    ...init,
    headers,
    redirect: 'manual',
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })

  const nextJar = applySetCookies(jar, setCookiesFrom(res))
  const location = res.headers.get('location')

  if (res.status >= 300 && res.status < 400 && location && redirects < MAX_REDIRECTS) {
    const nextUrl = new URL(location, url).toString()
    const preserveMethod = res.status === 307 || res.status === 308
    const nextInit: RequestInit = preserveMethod
      ? { ...init }
      : { method: 'GET', headers: { Referer: url } }
    return fetchPage(nextUrl, nextJar, nextInit, redirects + 1)
  }

  const html = await res.text()
  return { ok: res.ok, status: res.status, finalUrl: url, html, jar: nextJar }
}

/** The Payment page embeds the token used by the final ProcessPayment call. */
function extractPaymentToken(page: PageResult): string | null {
  try {
    const fromUrl = new URL(page.finalUrl).searchParams.get('token')
    if (fromUrl) return fromUrl
  } catch {
    // fall through to the HTML scan
  }
  const match = page.html.match(/\/Parking\/ProcessPayment\?token=([A-Za-z0-9]+)/i)
  return match?.[1] ?? null
}

interface ProcessPaymentResponse {
  redirectUrl?: string
  sessionId?: string
  error?: string
}

/**
 * CreateSession redirects to a Payment page; the session is only finalised by
 * ProcessPayment. A free session returns a Confirmation redirect URL; a paid
 * session returns a Stripe session id that we deliberately do not handle.
 */
async function completePayment(
  paymentPage: PageResult,
  target: ParkingTarget,
  token: string,
): Promise<Omit<RegisterParkingResult, 'licensePlate' | 'window'>> {
  const headers = new Headers({
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Origin: target.baseUrl,
    Referer: paymentPage.finalUrl,
  })
  if (Object.keys(paymentPage.jar).length > 0) headers.set('Cookie', cookieHeader(paymentPage.jar))

  const res = await fetch(
    `${target.baseUrl}/Parking/ProcessPayment?token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ CustomerEmail: '' }),
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  )

  const jar = applySetCookies(paymentPage.jar, setCookiesFrom(res))
  const text = await res.text()

  if (!res.ok) {
    return {
      status: 'FAILED',
      ok: false,
      message: `SCAN2PAY PAYMENT STEP RETURNED ${res.status}`,
      snippet: text.slice(0, 280),
      httpStatus: res.status,
    }
  }

  let body: ProcessPaymentResponse
  try {
    body = JSON.parse(text) as ProcessPaymentResponse
  } catch {
    return {
      status: 'FAILED',
      ok: false,
      message: 'SCAN2PAY PAYMENT STEP RETURNED AN UNEXPECTED RESPONSE',
      snippet: text.slice(0, 280),
      httpStatus: res.status,
    }
  }

  if (body.error) {
    return {
      status: 'FAILED',
      ok: false,
      message: body.error,
      snippet: text.slice(0, 280),
      httpStatus: res.status,
    }
  }

  if (body.redirectUrl) {
    const finalPage = await fetchPage(
      new URL(body.redirectUrl, target.baseUrl).toString(),
      jar,
      { method: 'GET' },
    )
    const parsed = parseCreateSessionResult({
      httpStatus: finalPage.status,
      html: finalPage.html,
      finalUrl: finalPage.finalUrl,
    })
    return {
      ...parsed,
      confirmationRef: parsed.confirmationRef ?? token,
      httpStatus: finalPage.status,
    }
  }

  if (body.sessionId) {
    return {
      status: 'FAILED',
      ok: false,
      message: 'PAYMENT REQUIRED — USE SCAN2PAY TO PAY',
      snippet: '',
      httpStatus: res.status,
    }
  }

  return {
    status: 'FAILED',
    ok: false,
    message: 'SCAN2PAY DID NOT RETURN A CONFIRMATION',
    snippet: text.slice(0, 280),
    httpStatus: res.status,
  }
}

/** GET the SelectTime page for a plate, capturing the antiforgery cookie + token. */
export async function fetchSelectTime(target: ParkingTarget, rawPlate: string): Promise<SelectTimeResult> {
  const plate = normalisePlate(rawPlate)
  const url = buildSelectTimeUrl({
    baseUrl: target.baseUrl,
    carparkId: target.carparkId,
    carparkName: target.carparkName,
    plate,
  })
  const page = await fetchPage(url, {}, {
    headers: { Referer: `${target.baseUrl}/Parking/Scan?carparkId=${target.carparkId}` },
  })
  return {
    ok: page.ok,
    status: page.status,
    url,
    html: page.html,
    token: parseAntiforgeryToken(page.html),
    existing: detectExistingSession(page.html),
    jar: page.jar,
  }
}

/** Read the carpark name from the Scan page when saving the config. */
export async function fetchCarparkName(target: { baseUrl: string; carparkId: number }): Promise<string | null> {
  const url = `${target.baseUrl}/Parking/Scan?carparkId=${target.carparkId}`
  const page = await fetchPage(url, {})
  return page.ok ? parseCarparkName(page.html) : null
}

async function postSession(
  target: ParkingTarget,
  plate: string,
  arrivedAt: Date,
  timezone: string,
  select: SelectTimeResult,
): Promise<RegisterParkingResult> {
  const window = buildParkingWindow(arrivedAt, timezone, target.durationMinutes)

  const body = new URLSearchParams({
    CarparkId: String(target.carparkId),
    CarparkName: target.carparkName ?? '',
    LicensePlate: plate,
    EntryTime: window.entry,
    ExitTime: window.exit,
    CalculatedFee: '0',
    IsExtendingSession: 'false',
    IsExtendingExpiredSession: 'false',
    OriginalExpiryTime: '',
    ExistingTransactionId: '',
    __RequestVerificationToken: select.token ?? '',
  })

  const page = await fetchPage(`${target.baseUrl}/Parking/CreateSession`, select.jar, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: target.baseUrl,
      Referer: select.url,
    },
    body: body.toString(),
  })

  const token = extractPaymentToken(page)
  if (token) {
    const paid = await completePayment(page, target, token)
    return { ...paid, licensePlate: plate, window }
  }

  const parsed = parseCreateSessionResult({
    httpStatus: page.status,
    html: page.html,
    finalUrl: page.finalUrl,
  })

  return {
    ...parsed,
    licensePlate: plate,
    window,
    httpStatus: page.status,
  }
}

function failure(
  message: string,
  httpStatus: number,
  plate: string,
  window: ParkingWindow,
): RegisterParkingResult {
  return {
    status: 'FAILED',
    ok: false,
    message,
    licensePlate: plate,
    window,
    snippet: '',
    httpStatus,
  }
}

/**
 * Register a guest plate for the free window. Refuses to resubmit when the
 * plate already has a session (the site allows one free claim per day).
 */
export async function registerParking(args: RegisterParkingArgs): Promise<RegisterParkingResult> {
  const plate = normalisePlate(args.plate)
  const window = buildParkingWindow(args.arrivedAt, args.timezone, args.target.durationMinutes)

  if (!isValidPlate(plate)) {
    return failure('INVALID NUMBER PLATE', 0, plate, window)
  }

  let select: SelectTimeResult
  try {
    select = await fetchSelectTime(args.target, plate)
  } catch (error) {
    return failure(`COULD NOT REACH SCAN2PAY: ${errorMessage(error)}`, 0, plate, window)
  }

  if (!select.ok) {
    return failure(`SCAN2PAY RETURNED ${select.status}`, select.status, plate, window)
  }
  if (!select.token) {
    return failure('SCAN2PAY FORM CHANGED — NO ANTIFORGERY TOKEN', select.status, plate, window)
  }
  if (select.existing.active) {
    return {
      status: 'ALREADY_ACTIVE',
      ok: true,
      message: 'THIS PLATE ALREADY HAS A SESSION TODAY',
      licensePlate: plate,
      window,
      snippet: '',
      httpStatus: select.status,
      existing: select.existing,
    }
  }

  try {
    return await postSession(args.target, plate, args.arrivedAt, args.timezone, select)
  } catch (error) {
    return failure(`COULD NOT REACH SCAN2PAY: ${errorMessage(error)}`, 0, plate, window)
  }
}

/**
 * Health check. READINESS only GETs the form with a fake plate (no session
 * created). FULL additionally submits the fake plate end-to-end.
 */
export async function checkParking(args: {
  target: ParkingTarget
  plate: string
  mode: 'READINESS' | 'FULL'
  timezone: string
  now?: Date
}): Promise<ParkingCheckResult> {
  const plate = normalisePlate(args.plate)
  if (!isValidPlate(plate)) {
    return { ok: false, httpStatus: 0, message: 'INVALID HEALTH PLATE', mode: args.mode, snippet: '', existing: { active: false } }
  }

  let select: SelectTimeResult
  try {
    select = await fetchSelectTime(args.target, plate)
  } catch (error) {
    return {
      ok: false,
      httpStatus: 0,
      message: `COULD NOT REACH SCAN2PAY: ${errorMessage(error)}`,
      mode: args.mode,
      snippet: '',
      existing: { active: false },
    }
  }

  if (!select.ok) {
    return {
      ok: false,
      httpStatus: select.status,
      message: `SCAN2PAY RETURNED ${select.status}`,
      mode: args.mode,
      snippet: '',
      existing: select.existing,
    }
  }
  if (!select.token) {
    return {
      ok: false,
      httpStatus: select.status,
      message: 'FORM CHANGED — NO ANTIFORGERY TOKEN',
      mode: args.mode,
      snippet: '',
      existing: select.existing,
    }
  }

  if (args.mode === 'READINESS' || select.existing.active) {
    return {
      ok: true,
      httpStatus: select.status,
      message: select.existing.active ? 'FORM READY (PLATE HAS A SESSION)' : 'FORM READY',
      mode: args.mode,
      snippet: '',
      existing: select.existing,
    }
  }

  try {
    const result = await postSession(args.target, plate, args.now ?? new Date(), args.timezone, select)
    return {
      ok: result.ok,
      httpStatus: result.httpStatus,
      message: result.message,
      mode: args.mode,
      confirmationRef: result.confirmationRef,
      snippet: result.snippet,
      existing: select.existing,
    }
  } catch (error) {
    return {
      ok: false,
      httpStatus: 0,
      message: `COULD NOT REACH SCAN2PAY: ${errorMessage(error)}`,
      mode: args.mode,
      snippet: '',
      existing: select.existing,
    }
  }
}
