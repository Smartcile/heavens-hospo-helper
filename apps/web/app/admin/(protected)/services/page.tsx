import { ServicesClient } from '@/components/admin/ServicesClient'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export default async function ServicesPage() {
  const session = await getServerSession(authOptions)
  if (!session) return null

  return (
    <ServicesClient
      role={session.user.role}
      sessionVenueId={session.user.venueId}
      defaultVenueId={session.user.defaultVenueId ?? null}
    />
  )
}
