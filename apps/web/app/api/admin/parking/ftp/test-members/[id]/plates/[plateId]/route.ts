import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { resolveScopedVenueId } from '@/lib/venue-scope'
import {
  applyMemberPlateAction,
  removeMemberPlate,
  type MemberPlateAction,
} from '@/lib/ftp-member-plates.server'

// Plate management for a parking member. Plates are added by the kiosk; the
// admin can remove one or choose the default. Removal is a soft-delete and
// promotes the oldest remaining plate, never a hard delete.

async function load(req: NextRequest, id: string, plateId: string) {
  const session = await getServerSession(authOptions)
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const scoped = resolveScopedVenueId(session, req)
  if ('error' in scoped) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  const member = await prisma.member.findFirst({
    where: { id, venueId: scoped.venueId, deletedAt: null },
    select: { id: true },
  })
  if (!member) return { error: NextResponse.json({ error: 'NOT FOUND' }, { status: 404 }) }

  return { venueId: scoped.venueId, memberId: member.id, plateId }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; plateId: string } },
) {
  const loaded = await load(req, params.id, params.plateId)
  if ('error' in loaded) return loaded.error

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const action: MemberPlateAction = body.action === 'REMOVE' ? 'REMOVE' : 'SET_DEFAULT'

  const result = await applyMemberPlateAction({
    venueId: loaded.venueId,
    memberId: loaded.memberId,
    plateId: loaded.plateId,
    action,
  })
  if (!result.ok) return NextResponse.json({ error: 'NOT FOUND' }, { status: 404 })
  return NextResponse.json({ ok: true, plates: result.plates })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; plateId: string } },
) {
  const loaded = await load(req, params.id, params.plateId)
  if ('error' in loaded) return loaded.error

  const result = await removeMemberPlate({
    venueId: loaded.venueId,
    memberId: loaded.memberId,
    plateId: loaded.plateId,
  })
  if (!result.ok) return NextResponse.json({ error: 'NOT FOUND' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
