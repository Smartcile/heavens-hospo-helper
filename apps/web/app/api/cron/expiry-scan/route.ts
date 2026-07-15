import { NextRequest, NextResponse } from 'next/server'
import { runExpiryScan } from '@/lib/expiry-scan'

// ── Auto-Expiry Cron ──────────────────────────────────────────────────
// The internal scheduler (instrumentation.ts) runs this automatically.
// This endpoint remains for external schedulers and manual triggers.
//
// Trigger: GET /api/cron/expiry-scan
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

  const result = await runExpiryScan()
  return NextResponse.json(result)
}
