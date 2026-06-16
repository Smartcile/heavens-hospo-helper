import { FollowUpsClient } from '@/components/admin/FollowUpsClient'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export default async function FollowUpsPage() {
  const session = await getServerSession(authOptions)
  return <FollowUpsClient role={session!.user.role} />
}
