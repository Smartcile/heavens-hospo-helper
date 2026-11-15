import { NextRequest, NextResponse } from 'next/server'
import { resolveKioskAccess } from '@/lib/parking-kiosk-access.server'
import {
  createCredentialToken,
  ftpCredentialPublicView,
  resolveFtpCredential,
} from '@/lib/ftp-credentials.server'
import { clientKey, createRateLimiter } from '@/lib/rate-limit'
import { isValidAdminPin, isValidMembershipNumber } from '@/lib/vpermit'

// Public 4-hour kiosk credential step. A membership number is the primary
// credential; the type's optional admin PIN is a staff/testing fallback.
// The response is a short-lived signed token, never the member's contact data.

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
  const access = await resolveKioskAccess(body)
  if (!access.ok) return noStore({ error: access.error }, access.status)

  const typeId = typeof body.typeId === 'string' ? body.typeId : ''
  const credential = typeof body.credential === 'string' ? body.credential.trim() : ''
  if (!typeId) return noStore({ error: 'CHOOSE A PARKING TYPE' }, 422)
  if (!credential) return noStore({ error: 'ENTER YOUR MEMBERSHIP NUMBER' }, 422)
  if (!isValidMembershipNumber(credential) && !isValidAdminPin(credential)) {
    return noStore({ error: 'NOT RECOGNISED — SPEAK WITH STAFF' }, 401)
  }

  const result = await resolveFtpCredential({
    venueId: access.venueId,
    typeId,
    credential,
  })
  if (!result.ok) {
    if (result.reason === 'TYPE_UNAVAILABLE') {
      return noStore({ error: 'THIS PARKING TYPE IS NOT AVAILABLE' }, 409)
    }
    return noStore({ error: 'NOT RECOGNISED — SPEAK WITH STAFF' }, 401)
  }

  const token = await createCredentialToken(result.credential)
  return noStore({ ...ftpCredentialPublicView(result.credential), token })
}
