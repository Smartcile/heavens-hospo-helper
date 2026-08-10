import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { fetchWooCategories } from '@/lib/woo-sync'
import { ensureWooCategory } from '@/lib/woo-categories'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Resolve shared Woo venue
  const venue = await prisma.venue.findUnique({
    where: { id: session.user.venueId, deletedAt: null },
    select: { sharedWooVenueId: true },
  })
  const wcVenueId = venue?.sharedWooVenueId ?? session.user.venueId

  const integration = await prisma.wooIntegration.findFirst({
    where: { venueId: wcVenueId, isActive: true, deletedAt: null },
  })
  if (!integration) return NextResponse.json({ categories: [] })

  try {
    const categories = await fetchWooCategories(
      integration.storeUrl,
      integration.consumerKey,
      integration.consumerSecret,
    )
    return NextResponse.json({ categories })
  } catch {
    return NextResponse.json({ categories: [] })
  }
}

/** Create (or match by name) a WooCommerce category on the store. Returns the
 *  category id so the caller can assign it to a product or menu immediately. */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name } = await req.json()
  const trimmed = String(name ?? '').toUpperCase().trim()
  if (!trimmed) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const id = await ensureWooCategory(session.user.venueId, trimmed)
  if (!id) {
    return NextResponse.json(
      { error: 'Category not created — check the WooCommerce integration' },
      { status: 400 },
    )
  }

  return NextResponse.json({ id, name: trimmed })
}
