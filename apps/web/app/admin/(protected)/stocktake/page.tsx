import { hubRedirect } from '@/lib/ops-redirect'

export default function StocktakePage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  hubRedirect('/admin/ops', 'inventory', 'stocktake', searchParams)
}
