import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { verifyCredentialToken } from '@/lib/ftp-credentials.server'
import { submitFtpClaim } from '@/lib/ftp-claims.server'
import { resolveKioskAccess } from '@/lib/parking-kiosk-access.server'
import { isValidPlate, normalisePlate } from '@/lib/parking'
import { clientKey, createRateLimiter } from '@/lib/rate-limit'

// Public 4-hour claim step. The short-lived credential token is issued after a
// membership number/admin PIN check; the server re-resolves the type, member and
// venue before driving vPermit.

const limiter = createRateLimiter(5, 60_000)

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
  const credential = await verifyCredentialToken(token)
  if (!credential) {
    return noStore({ error: 'START AGAIN — THE KIOSK SESSION EXPIRED' }, 401)
  }

  const access = await resolveKioskAccess({ venueId: credential.venueId })
  if (!access.ok) return noStore({ error: access.error }, access.status)

  const plate = normalisePlate(typeof body.plate === 'string' ? body.plate : '')
  if (!isValidPlate(plate)) {
    return noStore({ error: 'NUMBER PLATE MUST BE 1–6 LETTERS OR DIGITS' }, 422)
  }

  const venue = await prisma.venue.findUnique({
    where: { id: credential.venueId },
    select: { timezone: true },
  })
  const timezone = venue?.timezone || 'Pacific/Auckland'

  const result = await submitFtpClaim({
    venueId: credential.venueId,
    typeId: credential.typeId,
    memberId: credential.memberId,
    credentialKind: credential.kind,
    plate,
    timezone,
  })

  if (!result.claimId) {
    return noStore({ error: result.message }, 422)
  }
  return noStore(result)
}
