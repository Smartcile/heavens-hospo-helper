import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { guardAccess } from '@/lib/permissions'
import { resolveScopedVenueId } from '@/lib/venue-scope'
import { reviewBreachNotice, withdrawBreachNotice } from '@/lib/breach-notices.server'

type Params = { params: { id: string } }

/** POST /api/admin/breach-notices/[id]/review — WAIVE / DECLINE / MARK PAID / WITHDRAW. */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.breaches.review')
  if (denied) return denied

  const scoped = resolveScopedVenueId(session, req, req.nextUrl.searchParams.get('venueId'))
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const rawAction = String(body.action ?? '').toUpperCase().replace(/[\s_-]+/g, '')

  const result =
    rawAction === 'WITHDRAW' || rawAction === 'WITHDRAWN'
      ? await withdrawBreachNotice({
          id: params.id,
          venueId: scoped.venueId,
          staffId: session.user.id,
          allowAny: true,
        })
      : await reviewBreachNotice({
          id: params.id,
          venueId: scoped.venueId,
          reviewedById: session.user.id,
          action: body.action,
          note: typeof body.note === 'string' ? body.note : null,
        })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ notice: result.notice })
}
