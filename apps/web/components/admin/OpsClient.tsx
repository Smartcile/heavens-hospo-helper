'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { OPS_TABS, resolveTab, hubUrl } from '@/lib/hub-tabs'
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
  const { tab, sub } = resolveTab(OPS_TABS, searchParams.get('tab'), searchParams.get('sub'))

  function go(nextTab: string, nextSub?: string) {
    router.push(hubUrl('/admin/ops', nextTab, nextSub), { scroll: false })
  }

  const venueProps = { role, sessionVenueId, defaultVenueId: defaultVenueId ?? undefined }

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <LineTabs tabs={OPS_TABS} tab={tab} sub={sub} onNavigate={go} />

      {/* Active tab */}
      <div className="flex-1 p-4 md:p-6">
        {tab === 'menu' && sub === 'recipes' && <RecipesClient {...venueProps} />}
        {tab === 'menu' && sub === 'menus' && <MenusClient {...venueProps} />}
        {tab === 'menu' && sub === 'services' && <ServicesClient {...venueProps} />}
        {tab === 'bookings' && <BookingClient {...venueProps} />}
        {tab === 'orders' && <OrdersClient {...venueProps} />}
        {tab === 'customers' && <CustomersClient {...venueProps} />}
        {tab === 'inventory' && sub === 'inventory' && <InventoryClient {...venueProps} />}
        {tab === 'inventory' && sub === 'stocktake' && <StocktakeClient {...venueProps} />}
      </div>
    </div>
  )
}
