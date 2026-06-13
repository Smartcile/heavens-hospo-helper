import { TrainingClient } from '@/components/admin/TrainingClient'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export default async function TrainingPage() {
  const session = await getServerSession(authOptions)
  return <TrainingClient role={session!.user.role} sessionVenueId={session!.user.venueId} />
}
