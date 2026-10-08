import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { getManagerVenueId } from '@/lib/venue-scope'
import { guardAccess } from '@/lib/permissions'
import { applyEditRequest, discardEditRequest } from '@/lib/availability.server'

// Apply or discard a worker's edit request to an approved availability day or
// series. Applying executes the stored plan with manager authority; discarding
// leaves the approved rows exactly as they are.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.availability.approve')
  if (denied) return denied

  const body = await req.json().catch(() => null) as {
    action?: 'APPLY' | 'DISCARD'
    reviewNote?: string | null
  } | null
  const action = body?.action
  if (action !== 'APPLY' && action !== 'DISCARD') {
    return NextResponse.json({ error: 'action must be APPLY or DISCARD' }, { status: 400 })
  }

  const request = await prisma.availabilityEditRequest.findUnique({ where: { id: params.id } })
  if (!request || request.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const managerVenueId = getManagerVenueId(session, req)
  if (managerVenueId && request.venueId !== managerVenueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const ok = action === 'APPLY'
    ? await applyEditRequest(params.id, session.user.id, body?.reviewNote)
    : await discardEditRequest(params.id, session.user.id, body?.reviewNote)

  if (!ok) return NextResponse.json({ error: 'REQUEST ALREADY RESOLVED' }, { status: 409 })
  return NextResponse.json({ success: true })
}
