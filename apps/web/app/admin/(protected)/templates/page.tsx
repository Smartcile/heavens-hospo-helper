import { redirect } from 'next/navigation'

// Templates were merged into the Tasks page (Checklists tab) — checklists now
// reference live tasks instead of holding copies. Redirect any old links.
export default function TemplatesPage() {
  redirect('/admin/tasks')
}
