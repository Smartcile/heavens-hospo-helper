import { hubRedirect } from '@/lib/ops-redirect'

export default function ClocksPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  hubRedirect('/admin/team', 'clocks', null, searchParams)
}
