import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { cookies } from 'next/headers'
import { sessionGrantedAreas } from '@/lib/permissions'
import { EventsClient } from '@/components/admin/EventsClient'

export default async function EventsPage() {
  const session = await getServerSession(authOptions)
  if (!session) return null

  const activeVenueId = cookies().get('admin-active-venue')?.value ?? session.user.defaultVenueId ?? undefined
  const grantedAreas = await sessionGrantedAreas(session, activeVenueId)

  return (
    <EventsClient
      role={session.user.role}
      sessionVenueId={session.user.venueId}
      defaultVenueId={activeVenueId}
      grantedAreas={grantedAreas}
    />
  )
}
