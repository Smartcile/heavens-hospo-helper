'use client'

import { useEffect, useState } from 'react'

interface Venue { id: string; name: string }

export function VenueSwitcher({
  role,
  venueId,
  defaultVenueId,
  availableVenueIds,
}: {
  role: string
  venueId: string
  defaultVenueId: string | null | undefined
  availableVenueIds: string[]
}) {
  const [venues, setVenues] = useState<Venue[]>([])
  const [active, setActive] = useState('')

  useEffect(() => {
    function load() {
      fetch('/api/admin/venues')
        .then((r) => r.json())
        .then((data: Venue[]) => {
          const filtered = availableVenueIds.length > 0
            ? data.filter((v) => availableVenueIds.includes(v.id))
            : data
          setVenues(filtered)
          const cookie = document.cookie
            .split('; ')
            .find((r) => r.startsWith('admin-active-venue='))
            ?.split('=')[1]
          const initial = cookie || defaultVenueId || ''
          setActive(initial)
          if (!cookie && defaultVenueId) {
            fetch('/api/admin/active-venue', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ venueId: defaultVenueId }),
            })
          }
        })
    }
    load()
    window.addEventListener('venue-list-changed', load)
    return () => window.removeEventListener('venue-list-changed', load)
  }, [])

  async function change(venueId: string) {
    setActive(venueId)
    await fetch('/api/admin/active-venue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueId }),
    })
    window.location.reload()
  }

  // Multi-venue: show dropdown for anyone with >1 venue (admin or shared manager)
  const showDropdown = role === 'ADMIN' || (venues.length > 1)

  if (showDropdown) {
    return (
      <div className="px-4 py-2">
        <select
          value={active}
          onChange={(e) => change(e.target.value)}
          className="w-full bg-grey-dark border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white"
        >
          {role === 'ADMIN' && <option value="">ALL VENUES</option>}
          {venues.map((v) => (
            <option key={v.id} value={v.id}>{v.name} [{v.id.slice(0, 6)}]</option>
          ))}
        </select>
      </div>
    )
  }

  const matched = venues.find((v) => v.id === venueId)
  if (!matched) return null

  return (
    <div className="px-4 py-2">
      <div className="font-mono text-xs text-grey-light uppercase tracking-wider">{matched.name} <span className="text-grey-light/40">[{matched.id.slice(0, 6)}]</span></div>
    </div>
  )
}
