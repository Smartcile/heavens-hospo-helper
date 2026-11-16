import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { isValidPlate, normalisePlate } from '@/lib/parking'
import {
  submitGuestEntryPlate,
  verifyGuestEntryToken,
} from '@/lib/ftp-guest-entry.server'
import { clientKey, createRateLimiter } from '@/lib/rate-limit'

// Public customer-entry plate step. The token from the PIN screen selects the
// link; the plate is submitted to that link's vPermit claim URL and the rolling
// slot count is returned so the next guest knows when the link is full.

const limiter = createRateLimiter(30, 60_000)

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const limit = limiter.take(clientKey(req.headers))
  if (!limit.allowed) {
    return noStore({ error: 'TOO MANY PLATES — WAIT A MINUTE' }, 429)
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const token = typeof body.token === 'string' ? body.token : ''
  const credential = await verifyGuestEntryToken(token)
  if (!credential) {
    return noStore({ error: 'START AGAIN — THE ENTRY SESSION EXPIRED' }, 401)
  }

  const plate = normalisePlate(typeof body.plate === 'string' ? body.plate : '')
  if (!isValidPlate(plate)) {
    return noStore({ error: 'NUMBER PLATE MUST BE 1–6 LETTERS OR DIGITS' }, 422)
  }

  const venue = await prisma.venue.findUnique({
    where: { id: credential.venueId },
    select: { timezone: true },
  })
  const timezone = venue?.timezone || 'Pacific/Auckland'

  const result = await submitGuestEntryPlate({
    venueId: credential.venueId,
    typeId: credential.typeId,
    plate,
    timezone,
  })

  if (!result.ok) {
    return noStore(
      {
        error: result.error,
        full: result.full,
        slots: result.slots,
      },
      result.full ? 409 : 404,
    )
  }

  if (!result.claim.claimId) {
    return noStore(
      { error: result.claim.message, slots: result.slots },
      422,
    )
  }

  return noStore({
    status: result.claim.status,
    ok: result.claim.ok,
    message: result.claim.message,
    plate: result.claim.plate || plate,
    typeName: result.claim.typeName,
    validFrom: result.claim.validFrom,
    validUntil: result.claim.validUntil,
    locations: result.claim.locations,
    fallbackUrl: result.claim.fallbackUrl,
    manualToken: result.claim.manualToken,
    slots: result.slots,
  })
}
