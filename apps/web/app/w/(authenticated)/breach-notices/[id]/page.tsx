import { WorkerBreachNoticeClient } from '@/components/worker/WorkerBreachNoticeClient'

export default function WorkerBreachNoticePage({ params }: { params: { id: string } }) {
  return <WorkerBreachNoticeClient initialId={params.id} />
}
