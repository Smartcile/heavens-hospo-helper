import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import type { WorkerSession } from '@hospo-ops/types'

const COOKIE_NAME = 'hospo-worker-session'
const secret = new TextEncoder().encode(
  process.env.WORKER_SESSION_SECRET ?? 'fallback-dev-secret-change-in-prod'
)
const expiryMinutes = Number(process.env.WORKER_SESSION_EXPIRY_MINUTES ?? 15)

export async function createWorkerSession(data: Omit<WorkerSession, 'expiresAt'>): Promise<string> {
  const expiresAt = Date.now() + expiryMinutes * 60 * 1000
  const token = await new SignJWT({ ...data, expiresAt })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(`${expiryMinutes}m`)
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

export function setWorkerSessionCookie(token: string) {
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: expiryMinutes * 60,
    path: '/',
  })
}

export function clearWorkerSessionCookie() {
  cookies().set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
}
