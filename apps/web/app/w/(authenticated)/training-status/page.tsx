import { redirect } from 'next/navigation'
import { getWorkerSession } from '@/lib/worker-session'
import { TrainingStatusClient } from '@/components/admin/TrainingStatusClient'

// Manager view of the training board inside the worker chrome. Managers reach
// this after switching from the admin panel, so the admin session that backs
// the training APIs is present.
export default async function WorkerTrainingStatusPage() {
  const session = await getWorkerSession()
  if (!session || (session.role !== 'ADMIN' && session.role !== 'MANAGER')) {
    redirect('/w/dashboard')
  }

  return (
    <div className="min-h-screen bg-black p-4">
      <TrainingStatusClient
        role={session.role}
        sessionVenueId={session.venueId}
        defaultVenueId={session.venueId}
      />
    </div>
  )
}
