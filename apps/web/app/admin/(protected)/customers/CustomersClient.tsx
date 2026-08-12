'use client'

import { useEffect, useState, useCallback } from 'react'
import { Input } from '@/components/ui/Input'
import { CustomerDrawer } from '@/components/admin/CustomerDrawer'
import { getActiveVenueId } from '@/lib/active-venue'

interface CustomerData {
  phone: string; name: string; email: string | null
  lastBooking: string; totalBookings: number; totalPax: number
}

export function CustomersClient({ role, sessionVenueId, defaultVenueId }: { role: string; sessionVenueId: string; defaultVenueId?: string | null }) {
  const [customers, setCustomers] = useState<CustomerData[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<CustomerData | null>(null)

  const venueId = getActiveVenueId(role, sessionVenueId, defaultVenueId)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (venueId) params.set('venueId', venueId)
    const qs = params.toString()
    const r = await fetch(`/api/admin/customers${qs ? `?${qs}` : ''}`)
    if (r.ok) setCustomers(await r.json())
    setLoading(false)
  }, [search, venueId])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4 pb-12">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">CUSTOMERS</h1>
        <span className="font-mono text-xs text-grey-light">{customers.length} CONTACT{customers.length !== 1 ? 'S' : ''}</span>
      </div>

      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="SEARCH BY PHONE OR NAME..." />

      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : customers.length === 0 ? (
        <p className="font-mono text-xs text-grey-light">{search ? 'NO CUSTOMERS MATCH' : 'NO CUSTOMERS YET. CUSTOMERS APPEAR AFTER THEIR FIRST BOOKING.'}</p>
      ) : (
        <div className="border border-grey-mid divide-y divide-grey-mid">
          {customers.map((c) => (
            <button key={c.phone || c.name} onClick={() => setSelected(c)}
              className="w-full text-left flex items-center justify-between px-4 py-3 hover:bg-grey-mid/10 transition-colors">
              <div className="min-w-0">
                <div className="font-mono text-sm text-white uppercase">{c.name}</div>
                <div className="font-mono text-xs text-grey-light mt-0.5">
                  {c.phone && <span>{c.phone}</span>}
                  {c.phone && c.email && <span> · </span>}
                  {c.email && <span>{c.email}</span>}
                </div>
              </div>
              <span className="font-mono text-[10px] uppercase text-grey-light flex-shrink-0 ml-2">VIEW →</span>
            </button>
          ))}
        </div>
      )}

      <CustomerDrawer
        isOpen={selected != null}
        onClose={() => setSelected(null)}
        name={selected?.name ?? ''}
        phone={selected?.phone}
        email={selected?.email}
        venueId={venueId}
      />
    </div>
  )
}
