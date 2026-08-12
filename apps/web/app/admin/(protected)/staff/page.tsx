import { hubRedirect } from '@/lib/ops-redirect'

export default function StaffPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  hubRedirect('/admin/team', 'staff', null, searchParams)
}
