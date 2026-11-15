import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { resolveScopedVenueId } from '@/lib/venue-scope'
import { generateAdminPin, hashAdminPin } from '@/lib/ftp-credentials.server'
import { isValidAdminPin, pinHint } from '@/lib/vpermit'

// Set or rotate a parking type's admin PIN. The raw PIN is returned once and
// only the bcrypt hash is stored. ADMIN only, mirroring the kiosk code.

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'ADMIN ONLY' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const scoped = resolveScopedVenueId(
    session,
    req,
    typeof body.venueId === 'string' ? body.venueId : undefined,
  )
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const row = await prisma.ftpParkingType.findFirst({
    where: { id: params.id, venueId: scoped.venueId, deletedAt: null },
    select: { id: true },
  })
  if (!row) return NextResponse.json({ error: 'NOT FOUND' }, { status: 404 })

  const wanted = typeof body.pin === 'string' ? body.pin.trim() : ''
  if (wanted && !isValidAdminPin(wanted)) {
    return NextResponse.json({ error: 'ADMIN PIN MUST BE 4–8 DIGITS' }, { status: 422 })
  }
  const pin = wanted || generateAdminPin(6)
  await prisma.ftpParkingType.update({
    where: { id: row.id },
    data: { adminPinHash: await hashAdminPin(pin), adminPinHint: pinHint(pin) },
  })
  return NextResponse.json({ pin, hint: pinHint(pin) })
}
