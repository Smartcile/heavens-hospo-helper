'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { EXECUTION_TABS, resolveTab, hubUrl } from '@/lib/hub-tabs'
import { LineTabs } from '@/components/admin/LineTabs'
import { TasksClient } from '@/components/admin/TasksClient'
import { ReviewClient } from '@/components/admin/ReviewClient'
import { FollowUpsClient } from '@/components/admin/FollowUpsClient'

interface ExecutionClientProps {
  role: string
  sessionVenueId: string
  defaultVenueId?: string | null
}

export function ExecutionClient({ role, sessionVenueId, defaultVenueId }: ExecutionClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { tab } = resolveTab(EXECUTION_TABS, searchParams.get('tab'), null)

  function go(nextTab: string) {
    router.push(hubUrl('/admin/execution', nextTab), { scroll: false })
  }

  const venueProps = { role, sessionVenueId, defaultVenueId: defaultVenueId ?? undefined }

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <LineTabs tabs={EXECUTION_TABS} tab={tab} onNavigate={go} />

      <div className="flex-1 p-4 md:p-6">
        {tab === 'tasks' && <TasksClient {...venueProps} />}
        {tab === 'review' && <ReviewClient {...venueProps} />}
        {tab === 'followups' && <FollowUpsClient {...venueProps} />}
      </div>
    </div>
  )
}
