import { GuidesClient } from '@/components/admin/GuidesClient'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export default async function GuidesPage() {
  const session = await getServerSession(authOptions)
  return <GuidesClient role={session!.user.role} sessionVenueId={session!.user.venueId} />
}
