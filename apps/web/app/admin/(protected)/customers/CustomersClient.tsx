'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'

interface CustomerData {
  phone: string; name: string; email: string | null
  lastBooking: string; totalBookings: number; totalPax: number
}

interface CustomerBooking {
  id: string; date: string; startTime: string; endTime: string
  partySize: number; status: string
}

export function CustomersClient() {
  const [customers, setCustomers] = useState<CustomerData[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<CustomerData | null>(null)
  const [customerBookings, setCustomerBookings] = useState<CustomerBooking[]>([])
  const [bookingsLoading, setBookingsLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/admin/customers${search ? `?search=${encodeURIComponent(search)}` : ''}`)
    if (r.ok) setCustomers(await r.json())
    setLoading(false)
  }, [search])

  useEffect(() => { load() }, [load])

  async function viewCustomer(c: CustomerData) {
    setSelected(c)
    setBookingsLoading(true)
    const r = await fetch(`/api/admin/bookings?search=${encodeURIComponent(c.phone || c.name)}`)
    if (r.ok) setCustomerBookings(await r.json())
    setBookingsLoading(false)
  }

  return (
    <div className="space-y-4 pb-12 p-4 md:p-6">
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
            <button key={c.phone || c.name} onClick={() => viewCustomer(c)}
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

      <Modal isOpen={selected != null} onClose={() => { setSelected(null); setCustomerBookings([]) }} title="CUSTOMER DETAILS" size="md">
        {selected && (
          <div className="space-y-4">
            <div className="border border-grey-mid p-3 space-y-1">
              <div className="font-mono text-sm font-bold text-white uppercase">{selected.name}</div>
              {selected.phone && <div className="font-mono text-xs text-grey-light">{selected.phone}</div>}
              {selected.email && <div className="font-mono text-xs text-grey-light">{selected.email}</div>}
              <div className="font-mono text-[10px] text-grey-light mt-1">{selected.totalBookings} BOOKINGS · {selected.totalPax} PAX TOTAL</div>
            </div>

            <div>
              <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider mb-2">BOOKINGS</h3>
              {bookingsLoading ? (
                <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
              ) : customerBookings.length === 0 ? (
                <p className="font-mono text-xs text-grey-light">NO BOOKINGS FOUND.</p>
              ) : (
                <div className="border border-grey-mid divide-y divide-grey-mid max-h-60 overflow-y-auto">
                  {customerBookings.map((b) => (
                    <div key={b.id} className="flex items-center justify-between px-3 py-2">
                      <div>
                        <span className="font-mono text-xs text-white">{String(b.date).slice(0, 10)} · {b.startTime}–{b.endTime}</span>
                        <span className="font-mono text-[10px] text-grey-light ml-2">{b.partySize} PAX</span>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => {
                        setSelected(null)
                        // Open booking edit in bookings page
                        window.open(`/admin/bookings?date=${String(b.date).slice(0, 10)}`, '_self')
                      }}>VIEW</Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
