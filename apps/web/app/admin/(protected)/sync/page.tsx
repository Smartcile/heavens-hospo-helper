import { hubRedirect } from '@/lib/ops-redirect'

export default function SyncPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  hubRedirect('/admin/settings', 'sync', null, searchParams)
}
