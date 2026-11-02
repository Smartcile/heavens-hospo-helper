import { hubRedirect } from '@/lib/ops-redirect'

export default function PathwaysPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  hubRedirect('/admin/training', 'pathways', null, searchParams)
}
