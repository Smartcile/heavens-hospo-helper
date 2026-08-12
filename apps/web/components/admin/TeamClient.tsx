'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { TEAM_TABS, resolveTab, hubUrl } from '@/lib/hub-tabs'
import { LineTabs } from '@/components/admin/LineTabs'
import { StaffClient } from '@/components/admin/StaffClient'
import { RosterClient } from '@/components/admin/RosterClient'
import { ClocksClient } from '@/components/admin/ClocksClient'
import { PayrollClient } from '@/components/admin/PayrollClient'

interface TeamClientProps {
  role: string
  sessionVenueId: string
  defaultVenueId?: string | null
}

export function TeamClient({ role, sessionVenueId, defaultVenueId }: TeamClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { tab } = resolveTab(TEAM_TABS, searchParams.get('tab'), null)

  function go(nextTab: string) {
    router.push(hubUrl('/admin/team', nextTab), { scroll: false })
  }

  const venueProps = { role, sessionVenueId, defaultVenueId: defaultVenueId ?? undefined }

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <LineTabs tabs={TEAM_TABS} tab={tab} onNavigate={go} />

      <div className="flex-1 p-4 md:p-6">
        {tab === 'staff' && <StaffClient {...venueProps} />}
        {tab === 'roster' && <RosterClient {...venueProps} />}
        {tab === 'clocks' && <ClocksClient {...venueProps} />}
        {tab === 'payroll' && <PayrollClient {...venueProps} />}
      </div>
    </div>
  )
}
