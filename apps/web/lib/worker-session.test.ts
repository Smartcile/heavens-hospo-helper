import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { cookieStore, cookieOptions } = vi.hoisted(() => ({
  cookieStore: new Map<string, string>(),
  cookieOptions: new Map<string, Record<string, unknown>>(),
}))

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) =>
      cookieStore.has(name) ? { name, value: cookieStore.get(name)! } : undefined,
    set: (name: string, value: string, options?: Record<string, unknown>) => {
      cookieStore.set(name, value)
      if (options) cookieOptions.set(name, options)
    },
  }),
}))

import {
  createWorkerSession,
  getWorkerSession,
  setWorkerSessionCookie,
  workerCookieSecure,
  workerSessionCookieOptions,
} from '@/lib/worker-session'

const SESSION = {
  staffId: 'staff-1',
  venueId: 'venue-1',
  departmentId: 'dept-1',
  firstName: 'TAYLOR',
  role: 'STAFF' as const,
}

describe('worker-session utilities', () => {
  beforeEach(() => {
    cookieStore.clear()
    cookieOptions.clear()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('workerCookieSecure is a boolean', () => {
    expect(typeof workerCookieSecure).toBe('boolean')
  })

  it('round-trips a session with the venue timeout and expires on schedule', async () => {
    const token = await createWorkerSession(SESSION, 5)
    setWorkerSessionCookie(token, 5)

    const session = await getWorkerSession()
    expect(session?.staffId).toBe('staff-1')
    expect(session?.venueId).toBe('venue-1')
    expect(session?.expiresAt).toBe(Date.now() + 5 * 60_000)
    expect(cookieOptions.get('hospo-worker-session')?.maxAge).toBe(5 * 60)

    // Still inside the window.
    vi.advanceTimersByTime(4 * 60_000)
    expect(await getWorkerSession()).not.toBeNull()

    // Past the configured 5-minute window.
    vi.advanceTimersByTime(2 * 60_000)
    expect(await getWorkerSession()).toBeNull()
  })

  it('uses the explicit timeout for both the JWT and the cookie', async () => {
    const token = await createWorkerSession(SESSION, 30)
    setWorkerSessionCookie(token, 30)

    const session = await getWorkerSession()
    expect(session?.expiresAt).toBe(Date.now() + 30 * 60_000)
    expect(cookieOptions.get('hospo-worker-session')?.maxAge).toBe(30 * 60)
  })

  it('cookie options resolve a blank venue value to the env fallback', () => {
    const original = process.env.WORKER_SESSION_EXPIRY_MINUTES
    process.env.WORKER_SESSION_EXPIRY_MINUTES = '25'
    expect(workerSessionCookieOptions(null).maxAge).toBe(25 * 60)
    if (original === undefined) delete process.env.WORKER_SESSION_EXPIRY_MINUTES
    else process.env.WORKER_SESSION_EXPIRY_MINUTES = original
  })
})
