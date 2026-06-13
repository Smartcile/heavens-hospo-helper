import { CalendarClient } from '@/components/admin/CalendarClient'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export default async function CalendarPage() {
  const session = await getServerSession(authOptions)
  return <CalendarClient role={session!.user.role} sessionVenueId={session!.user.venueId} />
}
