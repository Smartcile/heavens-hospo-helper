import { hubRedirect } from '@/lib/ops-redirect'

export default function QRCodesPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  hubRedirect('/admin/settings', 'qrcodes', null, searchParams)
}
