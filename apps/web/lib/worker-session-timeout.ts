/**
 * Worker phone-session timeout rules.
 *
 * `Venue.workerSessionTimeoutMinutes` is the per-venue inactivity limit. A
 * null/0 value falls back to the server env (WORKER_SESSION_EXPIRY_MINUTES),
 * so older deployments keep behaving exactly as before. Every path that mints
 * a worker session reads its timeout through here so the JWT `exp`, the cookie
 * `maxAge` and the client idle guard can never disagree.
 */

export const WORKER_SESSION_DEFAULT_MINUTES = 15
export const WORKER_SESSION_MIN_MINUTES = 5
export const WORKER_SESSION_MAX_MINUTES = 480

/** The smallest interval between sliding refreshes, regardless of timeout. */
export const WORKER_SESSION_REFRESH_MIN_MS = 60_000

function envFallbackMinutes(): number {
  const raw = Number(process.env.WORKER_SESSION_EXPIRY_MINUTES ?? '')
  if (!Number.isFinite(raw) || raw <= 0) return WORKER_SESSION_DEFAULT_MINUTES
  return Math.min(WORKER_SESSION_MAX_MINUTES, Math.max(WORKER_SESSION_MIN_MINUTES, Math.round(raw)))
}

/**
 * Clamp any numeric timeout into the supported 5–480 minute window. Empty,
 * non-numeric and non-positive values fall back to the env/default value.
 */
export function clampWorkerSessionMinutes(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return envFallbackMinutes()
  return Math.min(WORKER_SESSION_MAX_MINUTES, Math.max(WORKER_SESSION_MIN_MINUTES, Math.round(n)))
}

export type VenueWorkerSessionParse =
  | { ok: true; minutes: number | null }
  | { ok: false }

/**
 * Validate a venue-settings payload. Null / undefined / blank / 0 mean "use the
 * env fallback" (stored as null); a non-numeric value is rejected so a typo
 * cannot silently reset the venue timeout. Other numbers are clamped to 5–480
 * (so -10 becomes 5).
 */
export function parseVenueWorkerSessionMinutes(value: unknown): VenueWorkerSessionParse {
  if (value === null || value === undefined) return { ok: true, minutes: null }
  if (typeof value === 'string' && value.trim() === '') return { ok: true, minutes: null }

  const n = Number(value)
  if (!Number.isFinite(n)) return { ok: false }
  if (n === 0) return { ok: true, minutes: null }

  return {
    ok: true,
    minutes: Math.min(
      WORKER_SESSION_MAX_MINUTES,
      Math.max(WORKER_SESSION_MIN_MINUTES, Math.round(n))
    ),
  }
}

/**
 * Resolve the timeout for a venue. Null / undefined / blank / 0 mean "use the
 * env fallback"; anything else is clamped to 5–480.
 */
export function resolveWorkerSessionMinutes(venueValue: unknown): number {
  if (
    venueValue === null ||
    venueValue === undefined ||
    venueValue === '' ||
    Number(venueValue) === 0
  ) {
    return envFallbackMinutes()
  }
  return clampWorkerSessionMinutes(venueValue)
}

/** Absolute expiry stamp (ms since epoch) for a fresh worker session. */
export function workerSessionExpiresAt(minutes: number, now = Date.now()): number {
  return now + clampWorkerSessionMinutes(minutes) * 60_000
}

/**
 * How often an active session should slide: at most once a minute, otherwise
 * a third of the idle timeout (so a 15-minute session refreshes about every
 * five minutes while in use).
 */
export function workerSessionRefreshIntervalMs(minutes: number): number {
  return Math.max(
    WORKER_SESSION_REFRESH_MIN_MS,
    Math.round((clampWorkerSessionMinutes(minutes) * 60_000) / 3)
  )
}

/**
 * Server-side throttle: only re-mint when the token is within one refresh
 * window of expiry. This keeps a busy user's cookie rolling without minting a
 * new token on every activity ping.
 */
export function shouldRefreshWorkerSession(
  expiresAt: number | null | undefined,
  minutes: number,
  now = Date.now()
): boolean {
  if (!expiresAt || !Number.isFinite(expiresAt)) return true
  return expiresAt - now <= workerSessionRefreshIntervalMs(minutes)
}
