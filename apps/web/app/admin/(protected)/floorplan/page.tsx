import { FloorPlansClient } from '@/components/admin/FloorPlansClient'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export default async function FloorPlanPage() {
  const session = await getServerSession(authOptions)
  return <FloorPlansClient role={session!.user.role} venueId={session!.user.venueId} />
}
