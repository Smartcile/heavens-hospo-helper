import { hubRedirect } from '@/lib/ops-redirect'

export default function SuppliersPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  hubRedirect('/admin/settings', 'suppliers', null, searchParams)
}
