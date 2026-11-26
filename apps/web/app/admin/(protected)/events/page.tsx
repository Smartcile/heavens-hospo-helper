import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { cookies } from 'next/headers'
import { prisma } from '@hospo-ops/db'
import { sessionGrantedAreas } from '@/lib/permissions'
import { EventsClient } from '@/components/admin/EventsClient'

export default async function EventsPage() {
  const session = await getServerSession(authOptions)
  if (!session) return null

  const activeVenueId = cookies().get('admin-active-venue')?.value ?? session.user.defaultVenueId ?? null
  const venueId = activeVenueId ?? session.user.venueId
  const [grantedAreas, venue] = await Promise.all([
    sessionGrantedAreas(session, activeVenueId),
    venueId ? prisma.venue.findUnique({ where: { id: venueId }, select: { timezone: true } }) : null,
  ])

  return (
    <EventsClient
      role={session.user.role}
      sessionVenueId={session.user.venueId}
      defaultVenueId={activeVenueId}
      grantedAreas={grantedAreas}
      venueTimezone={venue?.timezone ?? null}
    />
  )
}
