import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { guardAccess } from '@/lib/permissions'
import { resolveScopedVenueId } from '@/lib/venue-scope'
import { commitMemberImport } from '@/lib/customer-memberships.server'
import type { MemberImportRow } from '@/lib/member-import'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'customers.customers.edit')
  if (denied) return denied

  const body = await req.json().catch(() => ({}))
  const scoped = resolveScopedVenueId(session, req, typeof body.venueId === 'string' ? body.venueId : undefined)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!body.groupId || !Array.isArray(body.rows)) {
    return NextResponse.json({ error: 'GROUP AND ROWS ARE REQUIRED' }, { status: 422 })
  }
  if (body.rows.length === 0) {
    return NextResponse.json({ error: 'NOTHING TO IMPORT' }, { status: 422 })
  }

  try {
    const result = await commitMemberImport({
      venueId: scoped.venueId,
      groupId: String(body.groupId),
      rows: body.rows as MemberImportRow[],
    })
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'IMPORT FAILED' },
      { status: 422 },
    )
  }
}
