import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { hashApiKey } from '@/lib/public-api'
import { generateShareToken, logEventEvent } from '@/lib/events.server'

type Params = { params: { id: string } }

function appBase(req: NextRequest): string {
  const configured = process.env.APP_URL || process.env.NEXTAUTH_URL
  if (configured) return configured.replace(/\/+$/, '')
  return new URL(req.url).origin
}

/** POST /api/admin/events/[id]/share — mint (or rotate) the customer link. */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'events.events.share')
  if (denied) return denied

  const event = await prisma.event.findFirst({
    where: {
      id: params.id,
      deletedAt: null,
      ...(session.user.role === 'MANAGER' ? { venueId: session.user.venueId } : {}),
    },
    select: { id: true },
  })
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  let expiresAt: Date | null = null
  if (body.expiresAt) {
    const d = new Date(String(body.expiresAt))
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: 'Invalid expiry date' }, { status: 400 })
    }
    expiresAt = d
  }

  // Rotating the token invalidates any previously shared link.
  const token = generateShareToken()
  await prisma.event.update({
    where: { id: params.id },
    data: {
      shareTokenHash: hashApiKey(token),
      shareEnabled: true,
      shareExpiresAt: expiresAt,
    },
  })
  await logEventEvent(params.id, 'SHARE', expiresAt ? `CUSTOMER LINK ENABLED (EXPIRES ${expiresAt.toISOString().slice(0, 10)})` : 'CUSTOMER LINK ENABLED')

  return NextResponse.json({
    token,
    url: `${appBase(req)}/e/${token}`,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
  })
}

/** DELETE /api/admin/events/[id]/share — revoke the customer link. */
export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'events.events.share')
  if (denied) return denied

  const event = await prisma.event.findFirst({
    where: {
      id: params.id,
      deletedAt: null,
      ...(session.user.role === 'MANAGER' ? { venueId: session.user.venueId } : {}),
    },
    select: { id: true },
  })
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.event.update({
    where: { id: params.id },
    data: { shareEnabled: false, shareTokenHash: null, shareExpiresAt: null },
  })
  await logEventEvent(params.id, 'SHARE', 'CUSTOMER LINK REVOKED')

  return NextResponse.json({ ok: true })
}
