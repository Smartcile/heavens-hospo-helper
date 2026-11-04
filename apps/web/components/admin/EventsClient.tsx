'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { EVENTS_TABS, resolveTab, hubUrl } from '@/lib/hub-tabs'
import { LineTabs } from '@/components/admin/LineTabs'
import { EventsPlanner } from '@/components/admin/EventsPlanner'
import { EventTemplatesPanel } from '@/components/admin/EventTemplatesPanel'
import { EventRequestsPanel } from '@/components/admin/EventRequestsPanel'
import { BlockLibraryPanel } from '@/components/admin/BlockLibraryPanel'
import { EnquiriesPanel } from '@/components/admin/EnquiriesPanel'
import { PipelinePanel } from '@/components/admin/PipelinePanel'
import { FloorPlansClient } from '@/components/admin/FloorPlansClient'
import { RoomsPanel } from '@/components/admin/RoomsPanel'
import { RoomSetupsPanel } from '@/components/admin/RoomSetupsPanel'

interface EventsClientProps {
  role: string
  sessionVenueId: string
  defaultVenueId?: string | null
  /** Restricted-manager granted areas; null/undefined = unrestricted. */
  grantedAreas?: string[] | null
}

export function EventsClient({ role, sessionVenueId, defaultVenueId, grantedAreas }: EventsClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const canSeeRooms = !grantedAreas || grantedAreas.includes('floorplans')
  const tabs = canSeeRooms ? EVENTS_TABS : EVENTS_TABS.filter((t) => t.id !== 'rooms')
  const { tab, sub } = resolveTab(tabs, searchParams.get('tab'), searchParams.get('sub'))
  // Lets the templates/requests tabs hand an event to the planner.
  const [openEventId, setOpenEventId] = useState<string | null>(null)

  function go(nextTab: string, nextSub?: string) {
    router.push(hubUrl('/admin/events', nextTab, nextSub), { scroll: false })
  }

  const venueProps = { role, sessionVenueId, defaultVenueId: defaultVenueId ?? undefined }
  const venueId = defaultVenueId ?? sessionVenueId

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <LineTabs tabs={tabs} tab={tab} sub={sub} onNavigate={go} />

      <div className="flex-1 p-4 md:p-6">
        {tab === 'enquiries' && (
          <EnquiriesPanel
            {...venueProps}
            onConverted={(id) => {
              setOpenEventId(id)
              go('events')
            }}
          />
        )}
        {tab === 'events' && (
          <EventsPlanner
            {...venueProps}
            initialEventId={openEventId}
            onInitialOpened={() => setOpenEventId(null)}
          />
        )}
        {tab === 'pipeline' && (
          <PipelinePanel
            {...venueProps}
            onOpenEvent={(id) => {
              setOpenEventId(id)
              go('events')
            }}
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
        {tab === 'library' && <BlockLibraryPanel {...venueProps} />}
        {tab === 'rooms' && sub === 'rooms' && <RoomsPanel venueId={venueId} />}
        {tab === 'rooms' && sub === 'room-setups' && <RoomSetupsPanel venueId={venueId} />}
        {tab === 'rooms' && sub === 'table-plans' && (
          <FloorPlansClient role={role} venueId={sessionVenueId} />
        )}
      </div>
    </div>
  )
}
