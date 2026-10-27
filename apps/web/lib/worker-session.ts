import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import type { WorkerSession } from '@hospo-ops/types'
import { resolveWorkerSessionMinutes } from '@/lib/worker-session-timeout'

const COOKIE_NAME = 'hospo-worker-session'
const secret = new TextEncoder().encode(
  process.env.WORKER_SESSION_SECRET ?? 'fallback-dev-secret-change-in-prod'
)

// Secure cookies are only stored/sent by browsers over HTTPS. Derive the flag
// from the app's public URL scheme so the worker session works on a plain-HTTP
// LAN deployment (http://ip:port) and flips on automatically behind HTTPS
// (e.g. a Cloudflare Tunnel at https://app.domain.com). This mirrors how
// NextAuth decides its own cookie's Secure flag from NEXTAUTH_URL.
export const workerCookieSecure = (
  process.env.APP_URL ??
  process.env.NEXTAUTH_URL ??
  ''
).startsWith('https://')

/**
 * One cookie shape used by login, switch and refresh, so the JWT `exp` and the
 * cookie `maxAge` are always derived from the same resolved timeout.
 */
export function workerSessionCookieOptions(timeoutMinutes?: number | null) {
  const minutes = resolveWorkerSessionMinutes(timeoutMinutes)
  return {
    httpOnly: true,
    secure: workerCookieSecure,
    sameSite: 'lax' as const,
    maxAge: minutes * 60,
    path: '/',
  }
}

export async function createWorkerSession(
  data: Omit<WorkerSession, 'expiresAt'>,
  timeoutMinutes?: number | null
): Promise<string> {
  const minutes = resolveWorkerSessionMinutes(timeoutMinutes)
  const expiresAt = Date.now() + minutes * 60 * 1000
  const token = await new SignJWT({ ...data, expiresAt })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(`${minutes}m`)
    .sign(secret)
  return token
}

export async function getWorkerSession(): Promise<WorkerSession | null> {
  const cookieStore = cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, secret)
    return payload as unknown as WorkerSession
  } catch {
    return null
  }
}

export function setWorkerSessionCookie(token: string, timeoutMinutes?: number | null) {
  cookies().set(COOKIE_NAME, token, workerSessionCookieOptions(timeoutMinutes))
}

export function clearWorkerSessionCookie() {
  cookies().set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: workerCookieSecure,
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
}
