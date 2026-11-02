import { hubRedirect } from '@/lib/ops-redirect'

export default function RosterPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  hubRedirect('/admin/team', 'roster', null, searchParams)
}
