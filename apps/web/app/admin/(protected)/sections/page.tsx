import { SectionsClient } from '@/components/admin/SectionsClient'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export default async function SectionsPage() {
  const session = await getServerSession(authOptions)
  return <SectionsClient role={session!.user.role} venueId={session!.user.venueId} />
}
