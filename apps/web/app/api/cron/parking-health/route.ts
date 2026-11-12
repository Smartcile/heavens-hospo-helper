import { NextRequest, NextResponse } from 'next/server'
import { runParkingHealthChecks } from '@/lib/parking-health.server'

// External scheduler fallback. The internal scheduler runs this daily at 05:00.
// Auth: Authorization: Bearer <CRON_SECRET>
// `?force=1` re-runs venues already checked today.

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

  const force = req.nextUrl.searchParams.get('force') === '1'
  const results = await runParkingHealthChecks({ force })

  return NextResponse.json({
    checked: results.length,
    failed: results.filter((r) => !r.ok && !r.skipped).length,
    skipped: results.filter((r) => r.skipped).length,
    results,
  })
}
