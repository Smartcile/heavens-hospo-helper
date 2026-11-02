import { hubRedirect } from '@/lib/ops-redirect'

export default function StructurePage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  hubRedirect('/admin/settings', 'structure', null, searchParams)
}
