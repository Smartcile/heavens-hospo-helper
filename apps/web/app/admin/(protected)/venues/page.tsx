import { VenuesClient } from '@/components/admin/VenuesClient'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export default async function VenuesPage() {
  const session = await getServerSession(authOptions)
  return <VenuesClient role={session!.user.role} />
}
