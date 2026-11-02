import { hubRedirect } from '@/lib/ops-redirect'

export default function ServicesPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  hubRedirect('/admin/ops', 'menu', 'services', searchParams)
}
