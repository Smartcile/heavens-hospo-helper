import { loadKioskBootstrap } from '@/lib/parking-kiosk-bootstrap.server'
import { KioskUnlock } from '@/components/parking/KioskUnlock'
import { KioskParkingClient } from '@/components/parking/KioskParkingClient'

export const dynamic = 'force-dynamic'

export default async function ParkPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const requested =
    typeof searchParams.venue === 'string'
      ? searchParams.venue
      : Array.isArray(searchParams.venue)
        ? searchParams.venue[0]
        : undefined

  const result = await loadKioskBootstrap(requested)
  if (result.locked) return <KioskUnlock message={result.message} />

  return <KioskParkingClient config={result.config} />
}
