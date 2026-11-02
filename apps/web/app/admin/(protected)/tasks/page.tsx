import { hubRedirect } from '@/lib/ops-redirect'

export default function TasksPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  hubRedirect('/admin/execution', 'tasks', null, searchParams)
}
