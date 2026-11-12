// ── Internal Cron Scheduler ───────────────────────────────────────────
// Replaces the host-machine crontab so the app is fully self-contained
// (works on any Docker host or managed platform — no OS access needed).
// Started once from instrumentation.ts on server boot.
//
// Jobs:
//   EXPIRY SCAN  — daily at 03:00 (DEFAULT_TIMEZONE)
//
// WooCommerce background pulls were removed in Phase 0 of the integration
// retirement. Disable with INTERNAL_CRON=false to use an external scheduler
// instead (the /api/cron/* endpoints remain available with CRON_SECRET auth).
// ──────────────────────────────────────────────────────────────────────

export const EXPIRY_SCAN_HOUR = 3
export const PARKING_HEALTH_HOUR = 5

export interface CronState {
  lastExpiryScanDate: string | null
  lastParkingHealthDate: string | null
}

export interface DueJobs {
  expiryScan: boolean
  parkingHealth: boolean
}

// Local calendar date key + hour for a timezone, e.g. { dateKey: '2026-07-15', hour: 3 }
export function localParts(now: Date, timezone: string): { dateKey: string; hour: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  })
  const parts = fmt.formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return {
    dateKey: `${get('year')}-${get('month')}-${get('day')}`,
    hour: parseInt(get('hour'), 10) % 24,
  }
}

// Pure: which jobs are due right now given the last-run state.
export function dueJobs(state: CronState, now: Date, timezone: string): DueJobs {
  const { dateKey, hour } = localParts(now, timezone)
  const expiryScan = hour >= EXPIRY_SCAN_HOUR && state.lastExpiryScanDate !== dateKey
  const parkingHealth =
    hour >= PARKING_HEALTH_HOUR && state.lastParkingHealthDate !== dateKey

  return { expiryScan, parkingHealth }
}

// ── Runtime ───────────────────────────────────────────────────────────

const TICK_MS = 60 * 1000

declare global {
  // Survives Next.js dev hot-reloads so we never start two schedulers.
  var __hospoInternalCron: { started: boolean; state: CronState } | undefined
}

async function tick(state: CronState) {
  const timezone = process.env.DEFAULT_TIMEZONE || 'Pacific/Auckland'
  const now = new Date()
  const due = dueJobs(state, now, timezone)

  if (due.expiryScan) {
    state.lastExpiryScanDate = localParts(now, timezone).dateKey
    try {
      const { runExpiryScan } = await import('@/lib/expiry-scan')
      const result = await runExpiryScan()
      console.log(`[internal-cron] expiry scan: ${result.message}`)
    } catch (e) {
      console.error('[internal-cron] expiry scan failed:', e)
    }
  }

  if (due.parkingHealth) {
    state.lastParkingHealthDate = localParts(now, timezone).dateKey
    try {
      const { runParkingHealthChecks } = await import('@/lib/parking-health.server')
      const results = await runParkingHealthChecks({ now })
      const failed = results.filter((r) => !r.ok && !r.skipped)
      console.log(
        `[internal-cron] parking health: ${results.length} checked, ${failed.length} failed`,
      )
    } catch (e) {
      console.error('[internal-cron] parking health failed:', e)
    }
  }
}

export function startInternalCron() {
  if (process.env.INTERNAL_CRON === 'false') {
    console.log('[internal-cron] disabled via INTERNAL_CRON=false')
    return
  }
  if (globalThis.__hospoInternalCron?.started) return

  const state: CronState = { lastExpiryScanDate: null, lastParkingHealthDate: null }
  globalThis.__hospoInternalCron = { started: true, state }

  console.log('[internal-cron] started — expiry scan daily 03:00, parking health daily 05:00')
  setInterval(() => {
    tick(state).catch((e) => console.error('[internal-cron] tick failed:', e))
  }, TICK_MS)

  // Kick off an initial tick shortly after boot so a restart can still run
  // today's expiry scan without waiting for the first interval.
  setTimeout(() => {
    tick(state).catch((e) => console.error('[internal-cron] initial tick failed:', e))
  }, 15 * 1000)
}
