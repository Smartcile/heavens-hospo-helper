import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { runOrderPull } from '@/lib/woo-orders-sync'

// Manual PULL ORDERS NOW — fetch orders from WooCommerce for the current venue.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const venueId = session.user.role === 'MANAGER' ? session.user.venueId : (body.venueId || session.user.venueId)

  const results = await runOrderPull(venueId)
  if (results.length === 0) {
    return NextResponse.json(
      { error: 'No active WooCommerce integration for this venue' },
      { status: 400 },
    )
  }

  const totalSynced = results.reduce((s, r) => s + r.synced, 0)
  const totalErrors = results.reduce((s, r) => s + r.errors, 0)

  return NextResponse.json({
    message: `Pulled orders: ${totalSynced} synced${totalErrors > 0 ? `, ${totalErrors} errors` : ''}.`,
    results,
  })
}
