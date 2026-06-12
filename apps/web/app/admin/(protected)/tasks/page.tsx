import { TasksClient } from '@/components/admin/TasksClient'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export default async function TasksPage() {
  const session = await getServerSession(authOptions)
  return <TasksClient role={session!.user.role} sessionVenueId={session!.user.venueId} />
}
