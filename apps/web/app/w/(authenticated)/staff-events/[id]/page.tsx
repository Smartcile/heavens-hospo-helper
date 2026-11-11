import { WorkerStaffEventClient } from '@/components/worker/WorkerStaffEventClient'

export default function WorkerStaffEventPage({ params }: { params: { id: string } }) {
  return <WorkerStaffEventClient id={params.id} />
}
