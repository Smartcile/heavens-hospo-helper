import { hubRedirect } from '@/lib/ops-redirect'

export default function BookingsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  hubRedirect('/admin/ops', 'bookings', null, searchParams)
}
