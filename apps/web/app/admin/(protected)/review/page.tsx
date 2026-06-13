import { ReviewClient } from '@/components/admin/ReviewClient'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export default async function ReviewPage() {
  const session = await getServerSession(authOptions)
  return <ReviewClient role={session!.user.role} sessionVenueId={session!.user.venueId} />
}
