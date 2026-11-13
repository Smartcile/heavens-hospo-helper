import { describe, expect, it } from 'vitest'
import { clientKey, createRateLimiter, takeToken } from './rate-limit'

describe('takeToken', () => {
  it('allows requests up to the limit then blocks', () => {
    const now = 1_000
    const first = takeToken(undefined, now, 2, 60_000)
    expect(first.allowed).toBe(true)
    const second = takeToken(first.bucket, now, 2, 60_000)
    expect(second.allowed).toBe(true)
    const third = takeToken(second.bucket, now, 2, 60_000)
    expect(third.allowed).toBe(false)
    expect(third.retryAfterMs).toBe(60_000)
  })

  it('resets once the window passes', () => {
    const first = takeToken(undefined, 0, 1, 1_000)
    expect(first.allowed).toBe(true)
    const blocked = takeToken(first.bucket, 500, 1, 1_000)
    expect(blocked.allowed).toBe(false)
    const reset = takeToken(first.bucket, 1_001, 1, 1_000)
    expect(reset.allowed).toBe(true)
  })
})

describe('createRateLimiter', () => {
  it('keeps keys independent', () => {
    const limiter = createRateLimiter(1, 60_000)
    expect(limiter.take('a', 0).allowed).toBe(true)
    expect(limiter.take('a', 0).allowed).toBe(false)
    expect(limiter.take('b', 0).allowed).toBe(true)
  })
})

describe('clientKey', () => {
  it('uses the first forwarded address', () => {
    const headers = new Headers({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' })
    expect(clientKey(headers)).toBe('1.2.3.4')
  })

  it('falls back to a stable marker', () => {
    expect(clientKey(new Headers())).toBe('unknown')
  })
})
