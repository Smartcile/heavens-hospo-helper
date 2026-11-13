// Server-only half of the parking kiosk: code hashing, the signed cookie and
// random code generation. Never import this from a client component.

import { createHash, randomInt } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import {
  KIOSK_CODE_ALPHABET,
  KIOSK_CODE_MIN_LENGTH,
  KIOSK_COOKIE_MAX_AGE_DAYS,
  KIOSK_COOKIE_NAME,
  normaliseKioskCode,
} from './parking-kiosk'

const secret = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET ?? 'fallback-dev-secret-change-in-prod',
)

// Mirror the worker cookie rule: HTTPS only when the public URL is HTTPS, so a
// plain-HTTP LAN deploy still works.
export const kioskCookieSecure = (
  process.env.APP_URL ??
  process.env.NEXTAUTH_URL ??
  ''
).startsWith('https://')

export interface KioskSession {
  venueId: string
  codeHash: string
}

export function hashKioskCode(raw: string): string {
  return createHash('sha256').update(normaliseKioskCode(raw)).digest('hex')
}

export function generateKioskCode(length = 8): string {
  const size = Math.max(KIOSK_CODE_MIN_LENGTH, Math.min(24, length))
  let code = ''
  for (let i = 0; i < size; i += 1) {
    code += KIOSK_CODE_ALPHABET[randomInt(KIOSK_CODE_ALPHABET.length)]
  }
  return code
}

export function kioskCodeHint(raw: string): string {
  return normaliseKioskCode(raw).slice(-2)
}

export function kioskCookieOptions() {
  return {
    httpOnly: true,
    secure: kioskCookieSecure,
    sameSite: 'lax' as const,
    maxAge: KIOSK_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60,
    path: '/',
  }
}

export async function createKioskSession(session: KioskSession): Promise<string> {
  return new SignJWT({ venueId: session.venueId, codeHash: session.codeHash })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(`${KIOSK_COOKIE_MAX_AGE_DAYS}d`)
    .sign(secret)
}

export async function getKioskSession(): Promise<KioskSession | null> {
  const token = cookies().get(KIOSK_COOKIE_NAME)?.value
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secret)
    const venueId = typeof payload.venueId === 'string' ? payload.venueId : ''
    const codeHash = typeof payload.codeHash === 'string' ? payload.codeHash : ''
    if (!venueId || !codeHash) return null
    return { venueId, codeHash }
  } catch {
    return null
  }
}

export function setKioskCookie(token: string) {
  cookies().set(KIOSK_COOKIE_NAME, token, kioskCookieOptions())
}

export function clearKioskCookie() {
  cookies().set(KIOSK_COOKIE_NAME, '', {
    httpOnly: true,
    secure: kioskCookieSecure,
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
}
