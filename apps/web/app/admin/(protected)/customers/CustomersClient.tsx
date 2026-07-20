'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

interface CustomerData {
  phone: string
  name: string
  email: string | null
  lastBooking: string
  totalBookings: number
  totalPax: number
}

export function CustomersClient() {
  const [customers, setCustomers] = useState<CustomerData[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/admin/customers${search ? `?search=${encodeURIComponent(search)}` : ''}`)
    if (r.ok) setCustomers(await r.json())
    setLoading(false)
  }, [search])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4 pb-12 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">CUSTOMERS</h1>
        <span className="font-mono text-xs text-grey-light">{customers.length} CUSTOMER{customers.length !== 1 ? 'S' : ''}</span>
      </div>

      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="SEARCH BY PHONE OR NAME..." />

      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : customers.length === 0 ? (
        <p className="font-mono text-xs text-grey-light">{search ? 'NO CUSTOMERS MATCH' : 'NO CUSTOMERS FOUND. CUSTOMERS APPEAR AFTER THEIR FIRST BOOKING.'}</p>
      ) : (
        <div className="border border-grey-mid divide-y divide-grey-mid">
          {customers.map((c) => (
            <div key={c.phone || c.name} className="flex items-center justify-between px-4 py-3 hover:bg-grey-mid/10">
              <div className="min-w-0">
                <div className="font-mono text-sm text-white uppercase">{c.name}</div>
                <div className="font-mono text-xs text-grey-light mt-0.5">
                  {c.phone && <span>{c.phone} · </span>}
                  {c.email && <span>{c.email} · </span>}
                  <span>{c.totalBookings} BOOKING{c.totalBookings !== 1 ? 'S' : ''} · {c.totalPax} PAX</span>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="font-mono text-[10px] text-grey-light">LAST: {c.lastBooking}</div>
                <Button size="sm" variant="ghost" onClick={() => window.open(`/admin/bookings?date=${c.lastBooking}`, '_self')}>VIEW</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
