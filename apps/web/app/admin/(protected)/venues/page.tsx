import { OrganisationClient } from '@/components/admin/OrganisationClient'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export default async function VenuesPage() {
  const session = await getServerSession(authOptions)
  return (
    <OrganisationClient
      role={session!.user.role}
      sessionVenueId={session!.user.venueId}
      defaultVenueId={session!.user.defaultVenueId ?? undefined}
    />
  )
}
