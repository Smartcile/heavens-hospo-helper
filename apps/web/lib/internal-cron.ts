// ── Internal Cron Scheduler ───────────────────────────────────────────
// Replaces the host-machine crontab so the app is fully self-contained
// (works on any Docker host or managed platform — no OS access needed).
// Started once from instrumentation.ts on server boot.
//
// Jobs:
//   PRODUCT PULL — WooCommerce product sync every 15 minutes
//                  (backstop for the product.* webhooks)
//   ORDER PULL   — WooCommerce order sync every 15 minutes
//                  (backstop for the order.* webhooks)
//   EXPIRY SCAN  — daily at 03:00 (DEFAULT_TIMEZONE)
//
// Disable with INTERNAL_CRON=false to use an external scheduler instead
// (the /api/cron/* endpoints remain available with CRON_SECRET auth).
// ──────────────────────────────────────────────────────────────────────

export const PRODUCT_PULL_INTERVAL_MS = 15 * 60 * 1000
export const ORDER_PULL_INTERVAL_MS = 15 * 60 * 1000
export const EXPIRY_SCAN_HOUR = 3

export interface CronState {
  lastProductPullAt: number | null
  lastOrderPullAt: number | null
  lastExpiryScanDate: string | null
}

export interface DueJobs {
  productPull: boolean
  orderPull: boolean
  expiryScan: boolean
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
  const productPull =
    state.lastProductPullAt === null || now.getTime() - state.lastProductPullAt >= PRODUCT_PULL_INTERVAL_MS

  const orderPull =
    state.lastOrderPullAt === null || now.getTime() - state.lastOrderPullAt >= ORDER_PULL_INTERVAL_MS

  const { dateKey, hour } = localParts(now, timezone)
  const expiryScan = hour >= EXPIRY_SCAN_HOUR && state.lastExpiryScanDate !== dateKey

  return { productPull, orderPull, expiryScan }
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

  if (due.productPull) {
    state.lastProductPullAt = now.getTime()
    try {
      const { runProductPull } = await import('@/lib/woo-sync')
      const results = await runProductPull()
      if (results.length > 0) {
        console.log(`[internal-cron] product pull: ${results.length} store(s) synced`)
      }
    } catch (e) {
      console.error('[internal-cron] product pull failed:', e)
    }
  }

  if (due.orderPull) {
    state.lastOrderPullAt = now.getTime()
    try {
      const { runOrderPull } = await import('@/lib/woo-orders-sync')
      const results = await runOrderPull()
      if (results.length > 0) {
        console.log(`[internal-cron] order pull: ${results.length} store(s) synced`)
      }
    } catch (e) {
      console.error('[internal-cron] order pull failed:', e)
    }
  }

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
}

export function startInternalCron() {
  if (process.env.INTERNAL_CRON === 'false') {
    console.log('[internal-cron] disabled via INTERNAL_CRON=false')
    return
  }
  if (globalThis.__hospoInternalCron?.started) return

  const state: CronState = { lastProductPullAt: null, lastOrderPullAt: null, lastExpiryScanDate: null }
  globalThis.__hospoInternalCron = { started: true, state }

  console.log('[internal-cron] started — product + order pull every 15 min, expiry scan daily 03:00')
  setInterval(() => {
    tick(state).catch((e) => console.error('[internal-cron] tick failed:', e))
  }, TICK_MS)

  // Kick off an initial product pull shortly after boot so a fresh deploy
  // is populated without waiting for the first interval.
  setTimeout(() => {
    tick(state).catch((e) => console.error('[internal-cron] initial tick failed:', e))
  }, 15 * 1000)
}
