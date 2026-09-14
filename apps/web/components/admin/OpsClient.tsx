'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { OPS_SUB_TABS, resolveOps, hubUrl } from '@/lib/hub-tabs'
import { LineTabs } from '@/components/admin/LineTabs'
import { RecipesClient } from '@/app/admin/(protected)/recipes/RecipesClient'
import { MenusClient } from '@/components/admin/MenusClient'
import { ServicesClient } from '@/components/admin/ServicesClient'
import { BookingClient } from '@/app/admin/(protected)/bookings/BookingClient'
import { OrdersClient } from '@/app/admin/(protected)/orders/OrdersClient'
import { CustomersClient } from '@/app/admin/(protected)/customers/CustomersClient'
import { InventoryClient } from '@/app/admin/(protected)/inventory/InventoryClient'
import { StocktakeClient } from '@/app/admin/(protected)/stocktake/StocktakeClient'

interface OpsClientProps {
  role: string
  sessionVenueId: string
  defaultVenueId?: string | null
}

export function OpsClient({ role, sessionVenueId, defaultVenueId }: OpsClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { area, sub } = resolveOps(searchParams.get('tab'), searchParams.get('sub'))

  function go(nextSub: string) {
    router.push(hubUrl('/admin/ops', area, nextSub), { scroll: false })
  }

  const venueProps = { role, sessionVenueId, defaultVenueId: defaultVenueId ?? undefined }
  // The active area's fine tabs are the page's top bar (customers is a leaf).
  const fineTabs = OPS_SUB_TABS[area]

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {fineTabs && sub && (
        <LineTabs tabs={fineTabs} tab={sub} onNavigate={go} />
      )}

      {/* Active area */}
      <div className="flex-1 p-4 md:p-6">
        {area === 'menu' && sub === 'recipes' && <RecipesClient {...venueProps} />}
        {area === 'menu' && sub === 'menus' && <MenusClient {...venueProps} />}
        {area === 'menu' && sub === 'services' && <ServicesClient {...venueProps} />}
        {area === 'bookings' && <BookingClient {...venueProps} sub={sub} />}
        {area === 'orders' && <OrdersClient {...venueProps} sub={sub} />}
        {area === 'customers' && <CustomersClient {...venueProps} />}
        {area === 'inventory' && sub === 'inventory' && <InventoryClient {...venueProps} />}
        {area === 'inventory' && sub === 'stocktake' && <StocktakeClient {...venueProps} />}
      </div>
    </div>
  )
}
