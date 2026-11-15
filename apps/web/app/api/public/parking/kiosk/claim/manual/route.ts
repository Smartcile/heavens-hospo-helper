import { NextRequest, NextResponse } from 'next/server'
import { setFtpManualOutcome, type FtpManualOutcome } from '@/lib/ftp-claims.server'
import { verifyManualToken } from '@/lib/ftp-credentials.server'
import { resolveKioskAccess } from '@/lib/parking-kiosk-access.server'
import { clientKey, createRateLimiter } from '@/lib/rate-limit'

// Public fallback tracking. If the automatic browser cannot start the vendor
// session, the kiosk opens the vPermit page in a new tab. On return the guest
// tells us whether it worked; this updates the audit row (no vendor evidence).

const limiter = createRateLimiter(10, 60_000)
const OUTCOMES: FtpManualOutcome[] = ['OPENED', 'CONFIRMED', 'NOT_CONFIRMED']

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const limit = limiter.take(clientKey(req.headers))
  if (!limit.allowed) {
    return noStore({ error: 'TOO MANY ATTEMPTS — WAIT A MINUTE' }, 429)
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const token = typeof body.token === 'string' ? body.token : ''
  const outcome = typeof body.outcome === 'string' ? body.outcome : ''
  if (!OUTCOMES.includes(outcome as FtpManualOutcome)) {
    return noStore({ error: 'INVALID OUTCOME' }, 400)
  }

  const manual = await verifyManualToken(token)
  if (!manual) return noStore({ error: 'THE KIOSK SESSION EXPIRED' }, 401)

  const access = await resolveKioskAccess({ venueId: manual.venueId })
  if (!access.ok) return noStore({ error: access.error }, access.status)

  const result = await setFtpManualOutcome({
    venueId: manual.venueId,
    claimId: manual.claimId,
    outcome: outcome as FtpManualOutcome,
  })
  if (!result.ok) return noStore({ error: result.message ?? 'COULD NOT UPDATE' }, 409)
  return noStore({ ok: true, status: result.status })
}
