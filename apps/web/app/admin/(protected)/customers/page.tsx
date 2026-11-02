import { hubRedirect } from '@/lib/ops-redirect'

export default function CustomersPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  hubRedirect('/admin/ops', 'customers', null, searchParams)
}
