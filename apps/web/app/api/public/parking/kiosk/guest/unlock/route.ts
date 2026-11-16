import { NextRequest, NextResponse } from 'next/server'
import {
  createGuestEntryToken,
  guestEntryLinkView,
  guestSlotStateForType,
  resolveGuestEntryType,
  verifyGuestEntryPin,
} from '@/lib/ftp-guest-entry.server'
import { guestPinError } from '@/lib/ftp-guest-entry'
import { clientKey, createRateLimiter } from '@/lib/rate-limit'

// Public customer-entry PIN step. A correct PIN returns a short-lived signed
// token; the guest never sees a member or admin credential.

const limiter = createRateLimiter(8, 60_000)

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const limit = limiter.take(clientKey(req.headers))
  if (!limit.allowed) {
    return noStore({ error: 'TOO MANY ATTEMPTS — WAIT A MINUTE' }, 429)
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const venueId = typeof body.venueId === 'string' ? body.venueId : ''
  const typeId = typeof body.typeId === 'string' ? body.typeId : ''
  const pin = typeof body.pin === 'string' ? body.pin.trim() : ''
  if (!venueId || !typeId) {
    return noStore({ error: 'CHOOSE A CUSTOMER ENTRY LINK' }, 422)
  }
  const pinError = guestPinError(pin)
  if (pinError) return noStore({ error: pinError }, 422)

  const resolved = await resolveGuestEntryType(venueId, typeId)
  if (!resolved.ok) return noStore({ error: resolved.error }, resolved.status)

  const ok = await verifyGuestEntryPin(resolved.type, pin)
  if (!ok) return noStore({ error: 'WRONG PIN — SPEAK WITH STAFF' }, 401)

  const token = await createGuestEntryToken({ venueId, typeId })
  const state = await guestSlotStateForType(resolved.type)
  return noStore({
    token,
    type: guestEntryLinkView(resolved.type, state),
    slots: state,
  })
}
