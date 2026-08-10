import { BookingClient } from '@/app/admin/(protected)/bookings/BookingClient'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { cookies } from 'next/headers'

export default async function BookingsPage() {
  const session = await getServerSession(authOptions)
  if (!session) return null

  // The sidebar venue selection drives this page: the admin-active-venue
  // cookie when set, else the user's default venue.
  const activeVenueId = cookies().get('admin-active-venue')?.value ?? session.user.defaultVenueId ?? undefined

  return (
    <BookingClient
      role={session.user.role}
      sessionVenueId={session.user.venueId}
      defaultVenueId={activeVenueId}
    />
  )
}
