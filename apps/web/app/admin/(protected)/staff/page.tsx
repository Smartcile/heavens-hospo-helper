import { StaffClient } from '@/components/admin/StaffClient'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export default async function StaffPage() {
  const session = await getServerSession(authOptions)
  return <StaffClient role={session!.user.role} sessionVenueId={session!.user.venueId} />
}
