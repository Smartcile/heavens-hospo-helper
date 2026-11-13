// Tiny in-memory fixed-window rate limiter used by the public kiosk routes.
// Single-instance deploys only — the buckets live for the life of the process.
// The window maths is pure so it can be unit-tested without timers.

export interface RateBucket {
  count: number
  resetAt: number
}

export interface RateDecision {
  allowed: boolean
  remaining: number
  retryAfterMs: number
  bucket: RateBucket
}

export function takeToken(
  bucket: RateBucket | undefined,
  now: number,
  limit: number,
  windowMs: number,
): RateDecision {
  const current =
    bucket && bucket.resetAt > now ? bucket : { count: 0, resetAt: now + windowMs }

  if (current.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, current.resetAt - now),
      bucket: current,
    }
  }

  const bucketNext = { count: current.count + 1, resetAt: current.resetAt }
  return {
    allowed: true,
    remaining: Math.max(0, limit - bucketNext.count),
    retryAfterMs: 0,
    bucket: bucketNext,
  }
}

export interface RateLimiter {
  take(key: string, now?: number): RateDecision
}

export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  const buckets = new Map<string, RateBucket>()

  return {
    take(key: string, now: number = Date.now()) {
      if (buckets.size > 5000) {
        for (const [bucketKey, bucket] of buckets) {
          if (bucket.resetAt <= now) buckets.delete(bucketKey)
        }
      }
      const decision = takeToken(buckets.get(key), now, limit, windowMs)
      buckets.set(key, decision.bucket)
      return decision
    },
  }
}

/** Best-effort client key for an in-memory limit. */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || headers.get('x-real-ip') || 'unknown'
}
