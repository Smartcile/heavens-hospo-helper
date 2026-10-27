import { getWorkerSession } from '@/lib/worker-session'
import { workerTaskAccess } from '@/lib/worker-task-access.server'
import { WorkerTasksClient } from '@/components/worker/WorkerTasksClient'

export default async function WorkerTasksPage() {
  const session = await getWorkerSession()
  const access = await workerTaskAccess(session)
  return (
    <WorkerTasksClient
      role={session?.role ?? null}
      sessionVenueId={session?.venueId ?? null}
      access={access}
    />
  )
}
