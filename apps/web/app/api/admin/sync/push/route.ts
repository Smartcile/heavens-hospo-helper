import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { pushAllProducts } from '@/lib/woo-push'

// Manual PUSH NOW — push all linked menu items to WooCommerce for the current venue.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const venueId = session.user.role === 'MANAGER' ? session.user.venueId : (body.venueId || session.user.venueId)

  const { pushed } = await pushAllProducts(venueId)

  return NextResponse.json({
    message: `Pushed ${pushed} products to WooCommerce.`,
    pushed,
  })
}
