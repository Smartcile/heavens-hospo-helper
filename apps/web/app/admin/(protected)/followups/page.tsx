import { hubRedirect } from '@/lib/ops-redirect'

export default function FollowUpsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  hubRedirect('/admin/execution', 'followups', null, searchParams)
}
