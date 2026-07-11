import { CalendarClient } from '@/components/admin/CalendarClient'
import { getServerSession } from 'next-auth'
import { cookies } from 'next/headers'
import { authOptions } from '@/lib/auth'

export default async function CalendarPage() {
  const session = await getServerSession(authOptions)
  const cookieStore = cookies()
  const activeVenueId = cookieStore.get('admin-active-venue')?.value ?? session!.user.defaultVenueId ?? undefined
  return <CalendarClient role={session!.user.role} sessionVenueId={session!.user.venueId} defaultVenueId={activeVenueId} />
}
