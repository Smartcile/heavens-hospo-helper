import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveScopedVenueId } from '@/lib/venue-scope'
import {
  runFtpHealthCheck,
  runFtpHealthChecksForVenue,
} from '@/lib/ftp-health.server'
import { ftpHealthForVenue } from '@/lib/ftp-health-state.server'

// Manual 4-hour health checks. BROWSER is read-only; FULL submits a real test
// claim and consumes a slot, so it needs an explicit confirmation flag.

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const scoped = resolveScopedVenueId(
    session,
    req,
    typeof body.venueId === 'string' ? body.venueId : undefined,
  )
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const mode = body.mode === 'FULL' ? 'FULL' : body.mode === 'BROWSER' ? 'BROWSER' : undefined
  if (mode === 'FULL' && body.confirm !== true) {
    return NextResponse.json(
      { error: 'FULL CHECK USES A REAL PARKING SLOT — CONFIRM TO CONTINUE' },
      { status: 422 },
    )
  }

  const typeId = typeof body.typeId === 'string' ? body.typeId : ''
  const results = typeId
    ? [
        await runFtpHealthCheck({
          venueId: scoped.venueId,
          typeId,
          mode,
          force: true,
        }),
      ].filter((result): result is NonNullable<typeof result> => Boolean(result))
    : await runFtpHealthChecksForVenue({ venueId: scoped.venueId, mode, force: true })

  return NextResponse.json({
    results,
    health: await ftpHealthForVenue(scoped.venueId),
  })
}
