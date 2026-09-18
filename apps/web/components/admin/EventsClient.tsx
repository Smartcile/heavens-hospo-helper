'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { EVENTS_TABS, resolveTab, hubUrl } from '@/lib/hub-tabs'
import { LineTabs } from '@/components/admin/LineTabs'
import { EventsPlanner } from '@/components/admin/EventsPlanner'
import { EventTemplatesPanel } from '@/components/admin/EventTemplatesPanel'
import { EventRequestsPanel } from '@/components/admin/EventRequestsPanel'

interface EventsClientProps {
  role: string
  sessionVenueId: string
  defaultVenueId?: string | null
}

export function EventsClient({ role, sessionVenueId, defaultVenueId }: EventsClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { tab } = resolveTab(EVENTS_TABS, searchParams.get('tab'), null)
  // Lets the templates/requests tabs hand an event to the planner.
  const [openEventId, setOpenEventId] = useState<string | null>(null)

  function go(nextTab: string) {
    router.push(hubUrl('/admin/events', nextTab), { scroll: false })
  }

  const venueProps = { role, sessionVenueId, defaultVenueId: defaultVenueId ?? undefined }

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <LineTabs tabs={EVENTS_TABS} tab={tab} onNavigate={go} />

      <div className="flex-1 p-4 md:p-6">
        {tab === 'events' && (
          <EventsPlanner
            {...venueProps}
            initialEventId={openEventId}
            onInitialOpened={() => setOpenEventId(null)}
          />
        )}
        {tab === 'templates' && (
          <EventTemplatesPanel
            {...venueProps}
            onApplied={(id) => {
              setOpenEventId(id)
              go('events')
            }}
          />
        )}
        {tab === 'requests' && (
          <EventRequestsPanel
            {...venueProps}
            onOpenEvent={(id) => {
              setOpenEventId(id)
              go('events')
            }}
          />
        )}
      </div>
    </div>
  )
}
