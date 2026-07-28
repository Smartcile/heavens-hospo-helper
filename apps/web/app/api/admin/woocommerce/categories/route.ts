import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { fetchWooCategories } from '@/lib/woo-sync'

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
