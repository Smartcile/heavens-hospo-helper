import { ParkingMetricsClient } from '@/components/admin/ParkingMetricsClient'

export const dynamic = 'force-dynamic'

export default function ParkingMetricsPage() {
  return (
    <div className="min-h-screen bg-black p-4 md:p-6">
      <ParkingMetricsClient />
    </div>
  )
}
