import { NextRequest, NextResponse } from 'next/server'
import { runProductPull } from '@/lib/woo-sync'

// ── WooCommerce Product Sync Cron ─────────────────────────────────────
// The internal scheduler (instrumentation.ts) runs this automatically.
// This endpoint remains for external schedulers and manual triggers.
//
// Trigger: GET /api/cron/woocommerce-sync
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

  const results = await runProductPull()

  const totalCreated = results.reduce((s, r) => s + r.created, 0)
  const totalUpdated = results.reduce((s, r) => s + r.updated, 0)

  return NextResponse.json({
    message: `Synced ${results.length} stores. ${totalCreated} products created, ${totalUpdated} updated.`,
    results,
  })
}
