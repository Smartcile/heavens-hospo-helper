import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveScopedVenueId } from '@/lib/venue-scope'
import { setFtpClaimNote } from '@/lib/ftp-claims.server'

// Add the admin's follow-up note to a plate-log row.

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const scoped = resolveScopedVenueId(session, req)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const note = typeof body.note === 'string' ? body.note.slice(0, 1000) : null
  const ok = await setFtpClaimNote({
    venueId: scoped.venueId,
    claimId: params.id,
    note,
  })
  if (!ok) return NextResponse.json({ error: 'NOT FOUND' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
