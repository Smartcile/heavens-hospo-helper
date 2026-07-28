import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { runProductPull } from '@/lib/woo-sync'

// Manual PULL NOW — fetch products from WooCommerce for the current venue.
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const results = await runProductPull(session.user.venueId)
  if (results.length === 0) {
    return NextResponse.json(
      { error: 'No active WooCommerce integration for this venue' },
      { status: 400 },
    )
  }

  const totalCreated = results.reduce((s, r) => s + r.created, 0)
  const totalUpdated = results.reduce((s, r) => s + r.updated, 0)
  const totalErrors = results.reduce((s, r) => s + r.errors, 0)

  return NextResponse.json({
    message: `Pulled products: ${totalCreated} created, ${totalUpdated} updated${totalErrors > 0 ? `, ${totalErrors} errors` : ''}.`,
    results,
  })
}
