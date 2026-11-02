import { hubRedirect } from '@/lib/ops-redirect'

export default function InventoryPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  hubRedirect('/admin/ops', 'inventory', 'inventory', searchParams)
}
