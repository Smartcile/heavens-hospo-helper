import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  clampWorkerSessionMinutes,
  resolveWorkerSessionMinutes,
  shouldRefreshWorkerSession,
  workerSessionExpiresAt,
  workerSessionRefreshIntervalMs,
  WORKER_SESSION_DEFAULT_MINUTES,
  WORKER_SESSION_MAX_MINUTES,
  WORKER_SESSION_MIN_MINUTES,
} from '@/lib/worker-session-timeout'

const originalEnv = process.env.WORKER_SESSION_EXPIRY_MINUTES

beforeEach(() => {
  delete process.env.WORKER_SESSION_EXPIRY_MINUTES
})

afterEach(() => {
  if (originalEnv === undefined) delete process.env.WORKER_SESSION_EXPIRY_MINUTES
  else process.env.WORKER_SESSION_EXPIRY_MINUTES = originalEnv
})

describe('worker session timeout', () => {
  it('defaults to 15 minutes when no venue or env value is set', () => {
    expect(resolveWorkerSessionMinutes(null)).toBe(WORKER_SESSION_DEFAULT_MINUTES)
    expect(resolveWorkerSessionMinutes(undefined)).toBe(WORKER_SESSION_DEFAULT_MINUTES)
    expect(resolveWorkerSessionMinutes('')).toBe(WORKER_SESSION_DEFAULT_MINUTES)
    expect(resolveWorkerSessionMinutes(0)).toBe(WORKER_SESSION_DEFAULT_MINUTES)
  })

  it('falls back to the env value when the venue value is null or 0', () => {
    process.env.WORKER_SESSION_EXPIRY_MINUTES = '20'
    expect(resolveWorkerSessionMinutes(null)).toBe(20)
    expect(resolveWorkerSessionMinutes(0)).toBe(20)
    expect(resolveWorkerSessionMinutes('')).toBe(20)
  })

  it('ignores an invalid env value and keeps the default', () => {
    process.env.WORKER_SESSION_EXPIRY_MINUTES = 'not-a-number'
    expect(resolveWorkerSessionMinutes(null)).toBe(WORKER_SESSION_DEFAULT_MINUTES)
    process.env.WORKER_SESSION_EXPIRY_MINUTES = '-4'
    expect(resolveWorkerSessionMinutes(null)).toBe(WORKER_SESSION_DEFAULT_MINUTES)
  })

  it('keeps a valid venue value', () => {
    process.env.WORKER_SESSION_EXPIRY_MINUTES = '20'
    expect(resolveWorkerSessionMinutes(45)).toBe(45)
    expect(resolveWorkerSessionMinutes('45')).toBe(45)
  })

  it('clamps venue values into 5–480', () => {
    expect(resolveWorkerSessionMinutes(1)).toBe(WORKER_SESSION_MIN_MINUTES)
    expect(resolveWorkerSessionMinutes(5)).toBe(5)
    expect(resolveWorkerSessionMinutes(480)).toBe(480)
    expect(resolveWorkerSessionMinutes(999)).toBe(WORKER_SESSION_MAX_MINUTES)
    expect(clampWorkerSessionMinutes(-10)).toBe(WORKER_SESSION_DEFAULT_MINUTES)
    expect(clampWorkerSessionMinutes(12.6)).toBe(13)
  })

  it('clamps the env fallback too', () => {
    process.env.WORKER_SESSION_EXPIRY_MINUTES = '1'
    expect(resolveWorkerSessionMinutes(null)).toBe(WORKER_SESSION_MIN_MINUTES)
    process.env.WORKER_SESSION_EXPIRY_MINUTES = '999'
    expect(resolveWorkerSessionMinutes(null)).toBe(WORKER_SESSION_MAX_MINUTES)
  })

  it('computes expiresAt from the resolved timeout', () => {
    const now = 1_000_000
    expect(workerSessionExpiresAt(15, now)).toBe(now + 15 * 60_000)
    expect(workerSessionExpiresAt(5, now)).toBe(now + 5 * 60_000)
  })

  it('refreshes at most once a minute, otherwise a third of the timeout', () => {
    expect(workerSessionRefreshIntervalMs(5)).toBe(100_000)
    expect(workerSessionRefreshIntervalMs(15)).toBe(300_000)
    expect(workerSessionRefreshIntervalMs(3)).toBe(100_000)
  })

  it('only refreshes when the token is inside one refresh window', () => {
    const now = 1_000_000
    const minutes = 15
    const interval = workerSessionRefreshIntervalMs(minutes)
    expect(shouldRefreshWorkerSession(now + interval + 1, minutes, now)).toBe(false)
    expect(shouldRefreshWorkerSession(now + interval, minutes, now)).toBe(true)
    expect(shouldRefreshWorkerSession(now - 1, minutes, now)).toBe(true)
    expect(shouldRefreshWorkerSession(undefined, minutes, now)).toBe(true)
  })
})
