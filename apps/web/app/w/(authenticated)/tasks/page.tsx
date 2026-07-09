import { getWorkerSession } from '@/lib/worker-session'
import { WorkerTasksClient } from '@/components/worker/WorkerTasksClient'

export default async function WorkerTasksPage() {
  const session = await getWorkerSession()
  return (
    <WorkerTasksClient
      role={session?.role ?? null}
      sessionVenueId={session?.venueId ?? null}
    />
  )
}
