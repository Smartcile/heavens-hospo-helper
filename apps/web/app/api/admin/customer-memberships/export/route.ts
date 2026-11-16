import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { guardAccess } from '@/lib/permissions'
import { resolveScopedVenueId } from '@/lib/venue-scope'
import { exportMembershipsCsv } from '@/lib/customer-memberships.server'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'customers.customers.view')
  if (denied) return denied

  const scoped = resolveScopedVenueId(session, req)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(req.url)
  const groupId = url.searchParams.get('groupId')
  if (!groupId) return NextResponse.json({ error: 'groupId is required' }, { status: 422 })
  const rawStatus = (url.searchParams.get('status') ?? 'active').toLowerCase()
  const status = rawStatus === 'inactive' || rawStatus === 'all' ? rawStatus : 'active'

  try {
    const result = await exportMembershipsCsv(scoped.venueId, groupId, status)
    const payload = result.encoding === 'UTF8_BOM' ? `\uFEFF${result.csv}` : result.csv
    return new NextResponse(payload, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'EXPORT FAILED' },
      { status: 422 },
    )
  }
}
