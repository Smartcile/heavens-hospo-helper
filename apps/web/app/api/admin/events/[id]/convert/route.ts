import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { guardAccess } from '@/lib/permissions'
import { BEO_STATUS_VALUES, convertEnquiry } from '@/lib/enquiries.server'

type Params = { params: { id: string } }

/**
 * POST /api/admin/events/[id]/convert — turn an ENQUIRY into a BEO.
 * Body: { status?: 'DRAFT' | 'TENTATIVE' | 'CONFIRMED' } (default TENTATIVE).
 */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'events.events.edit')
  if (denied) return denied

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const requested = String(body.status ?? 'TENTATIVE').toUpperCase()
  const status = (BEO_STATUS_VALUES as readonly string[]).includes(requested)
    ? (requested as (typeof BEO_STATUS_VALUES)[number])
    : 'TENTATIVE'

  const venueId = session.user.role === 'MANAGER' ? session.user.venueId : null
  const event = await convertEnquiry(params.id, venueId, status)
  if (!event) {
    return NextResponse.json({ error: 'Not an enquiry in this venue' }, { status: 404 })
  }
  return NextResponse.json(event)
}
