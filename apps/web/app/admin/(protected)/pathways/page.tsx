import { PathwaysClient } from '@/components/admin/PathwaysClient'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export default async function PathwaysPage() {
  const session = await getServerSession(authOptions)
  return <PathwaysClient role={session!.user.role} sessionVenueId={session!.user.venueId} />
}
