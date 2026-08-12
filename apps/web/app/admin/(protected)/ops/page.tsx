import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { cookies } from 'next/headers'
import { OpsClient } from '@/components/admin/OpsClient'

export default async function OpsPage() {
  const session = await getServerSession(authOptions)
  if (!session) return null

  // The sidebar venue selection drives this page: the admin-active-venue
  // cookie when set, else the user's default venue.
  const activeVenueId = cookies().get('admin-active-venue')?.value ?? session.user.defaultVenueId ?? undefined

  return (
    <OpsClient
      role={session.user.role}
      sessionVenueId={session.user.venueId}
      defaultVenueId={activeVenueId}
    />
  )
}
