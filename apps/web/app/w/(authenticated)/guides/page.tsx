import { WorkerGuidesClient } from '@/components/worker/WorkerGuidesClient'
import { getWorkerSession } from '@/lib/worker-session'

export default async function GuidesPage() {
  const session = await getWorkerSession()
  return <WorkerGuidesClient role={session?.role ?? 'STAFF'} />
}
