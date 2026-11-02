import { hubRedirect } from '@/lib/ops-redirect'

// Templates were merged into the Tasks page (Checklists tab) — checklists now
// reference live tasks instead of holding copies. Redirect any old links.
export default function TemplatesPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  hubRedirect('/admin/execution', 'tasks', null, searchParams)
}
