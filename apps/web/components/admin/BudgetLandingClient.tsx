'use client'

import { useEffect, useState } from 'react'
import { BudgetMonthSelector } from '@/components/admin/BudgetMonthSelector'

interface Venue { id: string; name: string }

export function BudgetLandingClient({ role, sessionVenueId }: { role: string; sessionVenueId: string }) {
  const now = new Date()
  const [venues, setVenues] = useState<Venue[]>([])
  const [selectedVenueId, setSelectedVenueId] = useState(role === 'MANAGER' ? sessionVenueId : '')

  useEffect(() => {
    if (role === 'ADMIN') {
      fetch('/api/admin/venues')
        .then((r) => r.json())
        .then((v: Venue[]) => {
          setVenues(v)
          if (!selectedVenueId && v.length > 0) setSelectedVenueId(v[0].id)
        })
    }
  }, [role])

  return (
    <div className="p-6">
      <BudgetMonthSelector
        year={now.getFullYear()}
        month={now.getMonth() + 1}
        variant="grid"
        role={role}
        venues={venues}
        selectedVenueId={selectedVenueId}
        onVenueChange={(vid) => setSelectedVenueId(vid)}
      />
    </div>
  )
}
