import { hubRedirect } from '@/lib/ops-redirect'

export default function GuidesPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  hubRedirect('/admin/training', 'playbook', null, searchParams)
}
