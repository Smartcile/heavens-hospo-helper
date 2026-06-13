import { NoticesClient } from '@/components/admin/NoticesClient'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export default async function NoticesPage() {
  const session = await getServerSession(authOptions)
  return <NoticesClient role={session!.user.role} sessionVenueId={session!.user.venueId} />
}
