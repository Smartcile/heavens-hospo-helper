import { GiftCardsClient } from '@/components/admin/GiftCardsClient'
import { getServerSession } from 'next-auth'
import { cookies } from 'next/headers'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { getTodayDate } from '@/lib/utils'

export const dynamic = 'force-dynamic'

/**
 * The current calendar year for the ACTIVE venue (its own timezone, falling
 * back to DEFAULT_TIMEZONE) — the gift card page defaults its YEAR filter to
 * this so a refresh always shows this year's cards per the server's clock.
 */
async function currentVenueYear(): Promise<number> {
  const session = await getServerSession(authOptions)
  if (!session) return new Date().getUTCFullYear()
  const cookieStore = cookies()
  const venueId = cookieStore.get('admin-active-venue')?.value ?? session.user.defaultVenueId ?? session.user.venueId
  const venue = venueId
    ? await prisma.venue.findUnique({ where: { id: venueId }, select: { timezone: true } }).catch(() => null)
    : null
  return getTodayDate(venue?.timezone ?? process.env.DEFAULT_TIMEZONE).getUTCFullYear()
}

export default async function GiftCardsPage() {
  const year = await currentVenueYear()
  return (
    <div className="min-h-screen bg-black p-4 md:p-6">
      <GiftCardsClient defaultYear={String(year)} />
    </div>
  )
}
