import { hubRedirect } from '@/lib/ops-redirect'

export default function RecipesPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  hubRedirect('/admin/ops', 'inventory', 'recipes', searchParams)
}
