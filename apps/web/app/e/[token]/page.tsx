import { EventShareClient } from '@/components/EventShareClient'

export default function EventSharePage({ params }: { params: { token: string } }) {
  return <EventShareClient token={params.token} />
}
