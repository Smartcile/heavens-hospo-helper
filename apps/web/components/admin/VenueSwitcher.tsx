'use client'

import { useEffect, useState } from 'react'

interface Venue { id: string; name: string }

export function VenueSwitcher({ role, venueId, defaultVenueId }: { role: string; venueId: string; defaultVenueId: string | null }) {
  const [venues, setVenues] = useState<Venue[]>([])
  const [active, setActive] = useState('')

  useEffect(() => {
    fetch('/api/admin/venues')
      .then((r) => r.json())
      .then((data: Venue[]) => {
        setVenues(data)
        // Read current cookie value for the initial selection
        const cookie = document.cookie
          .split('; ')
          .find((r) => r.startsWith('admin-active-venue='))
          ?.split('=')[1]
        const initial = cookie || defaultVenueId || ''
        setActive(initial)
        // If no cookie yet but there's a default, set it
        if (!cookie && defaultVenueId) {
          fetch('/api/admin/active-venue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ venueId: defaultVenueId }),
          })
        }
      })
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

  const isAdmin = role === 'ADMIN'

  if (isAdmin) {
    return (
      <div className="px-4 py-2">
        <select
          value={active}
          onChange={(e) => change(e.target.value)}
          className="w-full bg-grey-dark border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white"
        >
          <option value="">ALL VENUES</option>
          {venues.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
      </div>
    )
  }

  const matched = venues.find((v) => v.id === venueId)
  if (!matched) return null

  return (
    <div className="px-4 py-2">
      <div className="font-mono text-xs text-grey-light uppercase tracking-wider">{matched.name}</div>
    </div>
  )
}
