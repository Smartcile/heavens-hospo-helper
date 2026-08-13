'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { COMPLIANCE_TABS, resolveTab, hubUrl } from '@/lib/hub-tabs'
import { LineTabs } from '@/components/admin/LineTabs'
import { ComplianceTasksClient } from '@/components/admin/ComplianceTasksClient'
import { DeliveriesClient } from '@/components/admin/DeliveriesClient'
import { AlertsClient } from '@/components/admin/AlertsClient'
import { LoggersClient } from '@/components/admin/LoggersClient'

interface ComplianceClientProps {
  role: string
  sessionVenueId: string
  defaultVenueId?: string | null
}

// Food Health & Safety hub — the Chomp-style Task Manager, supplier delivery
// receipts, the alert feed, and (sensor phase) the loggers dashboard.
export function ComplianceClient({ role, sessionVenueId, defaultVenueId }: ComplianceClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { tab, sub } = resolveTab(COMPLIANCE_TABS, searchParams.get('tab'), searchParams.get('sub'))

  function go(nextTab: string, nextSub?: string) {
    router.push(hubUrl('/admin/compliance', nextTab, nextSub), { scroll: false })
  }

  const venueProps = { role, sessionVenueId, defaultVenueId: defaultVenueId ?? undefined }

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <LineTabs tabs={COMPLIANCE_TABS} tab={tab} sub={sub} onNavigate={go} />

      <div className="flex-1 p-4 md:p-6">
        {tab === 'tasks' && <ComplianceTasksClient {...venueProps} />}
        {tab === 'deliveries' && <DeliveriesClient {...venueProps} />}
        {tab === 'alerts' && <AlertsClient {...venueProps} />}
        {tab === 'loggers' && <LoggersClient {...venueProps} />}
      </div>
    </div>
  )
}
