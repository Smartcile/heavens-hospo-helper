import { hubRedirect } from '@/lib/ops-redirect'

export default function OrdersPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  hubRedirect('/admin/ops', 'orders', null, searchParams)
}
