import { hubRedirect } from '@/lib/ops-redirect'

export default function ReviewPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  hubRedirect('/admin/execution', 'review', null, searchParams)
}
