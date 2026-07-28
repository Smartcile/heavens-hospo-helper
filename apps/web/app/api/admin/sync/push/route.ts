import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { pushAllProducts } from '@/lib/woo-push'

// Manual PUSH NOW — push all linked menu items to WooCommerce for the current venue.
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { pushed, skipped } = await pushAllProducts(session.user.venueId)

  return NextResponse.json({
    message: `Pushed ${pushed} linked products to WooCommerce${skipped > 0 ? ` (${skipped} unlinked items skipped)` : ''}.`,
    pushed,
    skipped,
  })
}
