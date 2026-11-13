import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { resolveScopedVenueId } from '@/lib/venue-scope'
import { generateKioskCode, hashKioskCode, kioskCodeHint } from '@/lib/parking-kiosk.server'

// Mint (or rotate) the kiosk code. The raw value is returned exactly once and
// only the sha256 hash is stored. ADMIN only — managers can run the kiosk but
// not change the device code.

export async function POST(req: NextRequest) {
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

  const code = generateKioskCode()
  const data = {
    kioskCodeHash: hashKioskCode(code),
    kioskCodeHint: kioskCodeHint(code),
    deletedAt: null,
  }

  await prisma.ftpSettings.upsert({
    where: { venueId: scoped.venueId },
    create: { venueId: scoped.venueId, ...data },
    update: data,
  })

  return NextResponse.json({ code, hint: data.kioskCodeHint })
}
