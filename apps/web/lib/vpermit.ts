// Pure helpers for the vPermit claimable-event flow ("4 hour parking").
// Prisma-free and Node-free so the kiosk/client code can import them.
//
// The vendor page is an ASP.NET + Angular form. A real browser fills the form,
// ticks the confirmation checkbox and submits with a reCAPTCHA v3 token; the
// response is a simple confirmation page. These helpers validate the claim URL
// and parse that confirmation page.

export const VPERMIT_HOSTS = ['vpermit.com.au', 'www.vpermit.com.au'] as const
export const VPERMIT_BASE_URL = 'https://vpermit.com.au'
export const VPERMIT_CLAIM_PATH = /^\/tld\/ClaimableEvents\/Claim\/?$/i
export const MEMBERSHIP_MIN_LENGTH = 4
export const MEMBERSHIP_MAX_LENGTH = 12
export const ADMIN_PIN_MIN_LENGTH = 4
export const ADMIN_PIN_MAX_LENGTH = 8

export type FtpClaimStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'FAILED'
  | 'ALREADY_CLAIMED'
  | 'EXHAUSTED'
  | 'CAPTCHA_BLOCKED'
  | 'MANUAL_OPENED'
  | 'MANUAL_CONFIRMED'
  | 'MANUAL_UNCONFIRMED'

export interface ParsedVpermitUrl {
  url: string
  code: string
}

export type ParseVpermitUrlResult =
  | { ok: true; value: ParsedVpermitUrl }
  | { ok: false; error: string }

export interface VpermitConfirmation {
  status: FtpClaimStatus
  ok: boolean
  message: string
  validFrom: string | null
  validUntil: string | null
  locations: string[]
  text: string
}

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

function alertText(html: string): string | null {
  const match = html.match(
    /<div[^>]*class="[^"]*alert-(?:success|danger)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  )
  if (!match) return null
  const text = textOf(match[1])
  return text || null
}

function parseLocations(html: string): string[] {
  const list = html.match(
    /<ul[^>]*class="[^"]*\blist-inline\b[^"]*"[^>]*>([\s\S]*?)<\/ul>/i,
  )?.[1]
  if (!list) return []
  const out: string[] = []
  const re = /<li[^>]*>([\s\S]*?)<\/li>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(list))) {
    const text = textOf(match[1])
    if (text) out.push(text)
  }
  return out
}

/**
 * Accept only a vPermit claimable-event URL and extract its claim code.
 * Anything else is refused so the kiosk cannot be pointed at an arbitrary site.
 */
export function parseVpermitClaimUrl(raw: unknown): ParseVpermitUrlResult {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) return { ok: false, error: 'PASTE THE VPERMIT CLAIM URL' }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return { ok: false, error: 'THAT IS NOT A VALID URL' }
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'ONLY HTTP(S) CLAIM URLS ARE SUPPORTED' }
  }
  if (!(VPERMIT_HOSTS as readonly string[]).includes(url.hostname.toLowerCase())) {
    return { ok: false, error: 'ONLY VPERMIT.COM.AU CLAIM URLS ARE SUPPORTED' }
  }
  if (!VPERMIT_CLAIM_PATH.test(url.pathname)) {
    return {
      ok: false,
      error: 'USE THE CLAIMABLE EVENT URL THAT ENDS /tld/ClaimableEvents/Claim?code=…',
    }
  }

  const code = (
    url.searchParams.get('code') ??
    url.searchParams.get('Code') ??
    ''
  ).trim()
  if (!/^[A-Za-z0-9]{1,20}$/.test(code)) {
    return { ok: false, error: 'THE URL IS MISSING A VALID CLAIM CODE' }
  }

  return {
    ok: true,
    value: {
      url: `${VPERMIT_BASE_URL}/tld/ClaimableEvents/Claim?code=${encodeURIComponent(code)}`,
      code,
    },
  }
}

/** Membership numbers are the kiosk PIN, so keep them digits-only. */
export function normaliseMembershipNumber(raw: unknown): string {
  return (typeof raw === 'string' ? raw : '')
    .trim()
    .replace(/[\s-]/g, '')
}

export function membershipNumberError(raw: unknown): string | null {
  const value = normaliseMembershipNumber(raw)
  if (!value) return 'ENTER YOUR MEMBERSHIP NUMBER'
  if (!new RegExp(`^[0-9]{${MEMBERSHIP_MIN_LENGTH},${MEMBERSHIP_MAX_LENGTH}}$`).test(value)) {
    return `MEMBERSHIP NUMBER MUST BE ${MEMBERSHIP_MIN_LENGTH}–${MEMBERSHIP_MAX_LENGTH} DIGITS`
  }
  return null
}

export function isValidMembershipNumber(raw: unknown): boolean {
  return membershipNumberError(raw) === null
}

/** Optional per-type admin PIN. */
export function normaliseAdminPin(raw: unknown): string {
  return (typeof raw === 'string' ? raw : '').trim()
}

export function adminPinError(raw: unknown): string | null {
  const value = normaliseAdminPin(raw)
  if (!value) return 'ENTER AN ADMIN PIN'
  if (!new RegExp(`^[0-9]{${ADMIN_PIN_MIN_LENGTH},${ADMIN_PIN_MAX_LENGTH}}$`).test(value)) {
    return `ADMIN PIN MUST BE ${ADMIN_PIN_MIN_LENGTH}–${ADMIN_PIN_MAX_LENGTH} DIGITS`
  }
  return null
}

export function isValidAdminPin(raw: unknown): boolean {
  return adminPinError(raw) === null
}

export function pinHint(raw: unknown): string {
  return normaliseAdminPin(raw).slice(-2)
}

/**
 * Parse the confirmation/error page returned by the vPermit claim POST.
 * The success page has no transaction number: the validity window, locations
 * and plate are the evidence.
 */
export function parseVpermitConfirmation(html: string): VpermitConfirmation {
  const text = textOf(html)
  const alert = alertText(html)

  const validFrom =
    text
      .match(/Valid\s+From\s*:\s*([^<]+?)(?=\s+Valid\s+Until|$)/i)?.[1]
      ?.trim() ?? null
  const validUntil =
    text
      .match(/Valid\s+Until\s*:\s*([^<]+?)(?=\s+You may park|$)/i)?.[1]
      ?.trim() ?? null
  const locations = parseLocations(html)

  const confirmed = /Congratulations, your parking session has been confirmed/i.test(text)
  const captcha = /A problem occur with the captcha|recaptcha|captcha/i.test(text)
  const already = /already (?:has|registered|confirmed)|existing session|active session/i.test(
    text,
  )
  const exhausted =
    /no (?:parking )?sessions?|no longer available|fully claimed|limit reached|quota|sold out|exhausted/i.test(
      text,
    )
  const expired = /expired|not found|has (?:closed|ended)|invalid code|code (?:is )?not valid/i.test(
    text,
  )
  const invalid =
    /invalid|not valid|is required|error occurred|unable to|could not|not available/i.test(text)

  let status: FtpClaimStatus = 'FAILED'
  if (confirmed) status = 'CONFIRMED'
  else if (captcha) status = 'CAPTCHA_BLOCKED'
  else if (already) status = 'ALREADY_CLAIMED'
  else if (exhausted) status = 'EXHAUSTED'
  else if (expired || invalid) status = 'FAILED'
  else if (!alert && !html.trim()) status = 'FAILED'

  const fallbackMessage =
    status === 'CONFIRMED'
      ? 'PARKING CONFIRMED'
      : status === 'CAPTCHA_BLOCKED'
        ? 'THE PARKING SITE BLOCKED THE AUTOMATIC START'
        : status === 'ALREADY_CLAIMED'
          ? 'THIS PLATE ALREADY HAS A PARKING SESSION'
          : status === 'EXHAUSTED'
            ? 'NO PARKING SESSIONS ARE AVAILABLE'
            : 'THE PARKING SITE DID NOT CONFIRM THE SESSION'

  return {
    status,
    ok: status === 'CONFIRMED' || status === 'ALREADY_CLAIMED',
    message: alert ?? fallbackMessage,
    validFrom,
    validUntil,
    locations,
    text,
  }
}

export function isTerminalClaimStatus(status: string): boolean {
  return [
    'CONFIRMED',
    'FAILED',
    'ALREADY_CLAIMED',
    'EXHAUSTED',
    'CAPTCHA_BLOCKED',
    'MANUAL_CONFIRMED',
    'MANUAL_UNCONFIRMED',
  ].includes(status)
}

export function describeClaimStatus(status: string): string {
  switch (status) {
    case 'PENDING':
      return 'STARTING'
    case 'CONFIRMED':
      return 'CONFIRMED'
    case 'ALREADY_CLAIMED':
      return 'ALREADY CLAIMED'
    case 'EXHAUSTED':
      return 'NO SLOTS'
    case 'CAPTCHA_BLOCKED':
      return 'BLOCKED'
    case 'MANUAL_OPENED':
      return 'OPENED MANUALLY'
    case 'MANUAL_CONFIRMED':
      return 'CONFIRMED MANUALLY'
    case 'MANUAL_UNCONFIRMED':
      return 'NOT CONFIRMED'
    default:
      return 'FAILED'
  }
}
