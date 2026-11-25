import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import bcrypt from 'bcryptjs'
import { verifyCredentialToken } from '@/lib/ftp-credentials.server'
import {
  applyMemberPlateAction,
  type MemberPlateAction,
} from '@/lib/ftp-member-plates.server'
import { resolveKioskAccess } from '@/lib/parking-kiosk-access.server'
import { clientKey, createRateLimiter } from '@/lib/rate-limit'
import { isValidAdminPin } from '@/lib/vpermit'

// Public member plate management for the 4-hour kiosk. The credential token is
// re-checked on every write, as is the kiosk lock and venue/member/type scope.
// Removal soft-deletes (never hard-deletes) and may require the type's admin PIN.

const limiter = createRateLimiter(10, 60_000)

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
  if (!credential || credential.kind !== 'MEMBER' || !credential.memberId) {
    return noStore({ error: 'START AGAIN — THE KIOSK SESSION EXPIRED' }, 401)
  }

  const access = await resolveKioskAccess({ venueId: credential.venueId })
  if (!access.ok) return noStore({ error: access.error }, access.status)

  const action = typeof body.action === 'string' ? body.action : ''
  if (action !== 'SET_DEFAULT' && action !== 'REMOVE') {
    return noStore({ error: 'INVALID ACTION' }, 422)
  }
  const plateId = typeof body.plateId === 'string' ? body.plateId : ''
  if (!plateId) return noStore({ error: 'CHOOSE A NUMBER PLATE' }, 422)

  const type = await prisma.ftpParkingType.findFirst({
    where: {
      id: credential.typeId,
      venueId: credential.venueId,
      isActive: true,
      deletedAt: null,
    },
    select: { id: true, plateRemovalRequiresPin: true, adminPinHash: true },
  })
  if (!type) return noStore({ error: 'THIS PARKING TYPE IS NOT AVAILABLE' }, 409)

  const member = await prisma.member.findFirst({
    where: {
      id: credential.memberId,
      venueId: credential.venueId,
      parkingTypeId: type.id,
      isActive: true,
      deletedAt: null,
    },
    select: { id: true, savePlates: true },
  })
  if (!member) return noStore({ error: 'MEMBER NOT FOUND' }, 404)
  if (!member.savePlates) {
    return noStore({ error: 'PLATE SAVING IS OFF — SPEAK WITH STAFF' }, 409)
  }

  if (action === 'REMOVE' && type.plateRemovalRequiresPin) {
    if (!type.adminPinHash) {
      return noStore({ error: 'PLATE REMOVAL IS NOT CONFIGURED — SPEAK WITH STAFF' }, 409)
    }
    const pin = typeof body.adminPin === 'string' ? body.adminPin.trim() : ''
    if (!isValidAdminPin(pin)) {
      return noStore({ error: 'ENTER THE ADMIN PIN TO REMOVE A PLATE' }, 403)
    }
    const matches = await bcrypt.compare(pin, type.adminPinHash)
    if (!matches) return noStore({ error: 'WRONG ADMIN PIN' }, 403)
  }

  const result = await applyMemberPlateAction({
    venueId: credential.venueId,
    memberId: member.id,
    plateId,
    action: action as MemberPlateAction,
  })
  if (!result.ok) return noStore({ error: 'PLATE NOT FOUND' }, 404)

  return noStore({ ok: true, plates: result.plates })
}
