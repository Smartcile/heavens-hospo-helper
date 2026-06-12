import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { DashboardClient } from '@/components/admin/DashboardClient'

export default async function AdminDashboardPage() {
  const session = await getServerSession(authOptions)
  return <DashboardClient role={session!.user.role} />
}
