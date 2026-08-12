import { hubRedirect } from '@/lib/ops-redirect'

export default function PayrollPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  hubRedirect('/admin/team', 'payroll', null, searchParams)
}
