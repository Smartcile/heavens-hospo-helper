import { NextRequest, NextResponse } from 'next/server'
import { runOrderPull } from '@/lib/woo-orders-sync'

// ── WooCommerce Order Sync Cron ────────────────────────────────────────
// The internal scheduler (instrumentation.ts) runs this automatically.
// This endpoint remains for external schedulers and manual triggers.
//
// Trigger: GET /api/cron/woocommerce-orders-sync
// Auth:    Authorization: Bearer <CRON_SECRET>
// ──────────────────────────────────────────────────────────────────────

async function authenticate(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization') ?? ''
  return auth === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!(await authenticate(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results = await runOrderPull()

  const totalSynced = results.reduce((s, r) => s + r.synced, 0)
  const totalErrors = results.reduce((s, r) => s + r.errors, 0)

  return NextResponse.json({
    message: `Order sync complete. ${results.length} store(s) processed, ${totalSynced} orders synced${totalErrors > 0 ? `, ${totalErrors} errors` : ''}.`,
    results,
  })
}
