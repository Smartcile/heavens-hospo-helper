import { hubRedirect } from '@/lib/ops-redirect'

export default function FloorPlanPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  hubRedirect('/admin/settings', 'floorplans', null, searchParams)
}
