'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { TRAINING_TABS, resolveTab, hubUrl } from '@/lib/hub-tabs'
import { LineTabs } from '@/components/admin/LineTabs'
import { GuidesClient } from '@/components/admin/GuidesClient'
import { PathwaysClient } from '@/components/admin/PathwaysClient'

interface TrainingClientProps {
  role: string
  sessionVenueId: string
  defaultVenueId?: string | null
}

export function TrainingClient({ role, sessionVenueId, defaultVenueId }: TrainingClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { tab } = resolveTab(TRAINING_TABS, searchParams.get('tab'), null)

  function go(nextTab: string) {
    router.push(hubUrl('/admin/training', nextTab), { scroll: false })
  }

  const venueProps = { role, sessionVenueId, defaultVenueId: defaultVenueId ?? undefined }

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <LineTabs tabs={TRAINING_TABS} tab={tab} onNavigate={go} />

      <div className="flex-1 p-4 md:p-6">
        {tab === 'playbook' && <GuidesClient {...venueProps} />}
        {tab === 'pathways' && <PathwaysClient {...venueProps} />}
      </div>
    </div>
  )
}
