import { NextRequest, NextResponse } from 'next/server'
import { normaliseKioskCode } from '@/lib/parking-kiosk'
import {
  clearKioskCookie,
  getKioskSession,
  hashKioskCode,
} from '@/lib/parking-kiosk.server'
import { clientKey, createRateLimiter } from '@/lib/rate-limit'

// Leaving kiosk mode needs the same code as unlocking it. The five-second
// hold lives in the UI; this route is the hard gate.

const limiter = createRateLimiter(5, 60_000)

export async function POST(req: NextRequest) {
  const limit = limiter.take(clientKey(req.headers))
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'TOO MANY ATTEMPTS — WAIT A MINUTE' },
      { status: 429 },
    )
  }

  const session = await getKioskSession()
  if (!session) {
    clearKioskCookie()
    return NextResponse.json({ ok: true })
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const code = normaliseKioskCode(typeof body.code === 'string' ? body.code : '')
  if (!code || hashKioskCode(code) !== session.codeHash) {
    return NextResponse.json({ error: 'WRONG KIOSK CODE' }, { status: 401 })
  }

  clearKioskCookie()
  return NextResponse.json({ ok: true })
}
