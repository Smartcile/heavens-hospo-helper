import { ReportsClient } from '@/components/admin/ReportsClient'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export default async function ReportsPage() {
  const session = await getServerSession(authOptions)
  return <ReportsClient role={session!.user.role} sessionVenueId={session!.user.venueId} />
}
