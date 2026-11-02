import { WorkerDashboardClient } from '@/components/worker/WorkerDashboardClient'
import { getWorkerSession } from '@/lib/worker-session'

export default async function DashboardPage() {
  const session = await getWorkerSession()
  return <WorkerDashboardClient role={session?.role ?? 'STAFF'} />
}
