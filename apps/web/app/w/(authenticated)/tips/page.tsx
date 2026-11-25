import { getWorkerSession } from '@/lib/worker-session'
import { workerMayAccessTips } from '@/lib/worker-tips-access'
import { WorkerTipsClient } from '@/components/worker/WorkerTipsClient'

export const dynamic = 'force-dynamic'

export default async function WorkerTipsPage() {
  const session = await getWorkerSession()
  if (!workerMayAccessTips(session?.role)) {
    return (
      <div className="min-h-screen bg-black p-6">
        <h1 className="font-mono text-xl font-bold uppercase tracking-widest text-white">TIPS</h1>
        <p className="mt-3 font-mono text-sm text-danger">ACCESS DENIED — MANAGERS ONLY.</p>
        <p className="mt-1 font-mono text-xs text-grey-light">
          FLOOR STAFF DO NOT HAVE ACCESS TO TIP VALUES.
        </p>
      </div>
    )
  }
  return <WorkerTipsClient />
}
