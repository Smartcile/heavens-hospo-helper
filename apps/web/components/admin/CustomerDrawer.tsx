'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Drawer'

interface CustomerData {
  phone: string; name: string; email: string | null
  lastBooking: string; totalBookings: number; totalPax: number
}

interface CustomerBooking {
  id: string; date: string; startTime: string; endTime: string
  partySize: number; status: string
}

interface CustomerDrawerProps {
  isOpen: boolean
  onClose: () => void
  name: string
  phone?: string | null
  email?: string | null
  venueId?: string
}

/** Slide-out customer profile used from Bookings/Orders/Customers — shows the
 *  contact card and booking history without navigating away from the list. */
export function CustomerDrawer({ isOpen, onClose, name, phone, email, venueId }: CustomerDrawerProps) {
  const [customer, setCustomer] = useState<CustomerData | null>(null)
  const [bookings, setBookings] = useState<CustomerBooking[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    setCustomer(null)
    setBookings([])
    const params = new URLSearchParams({ search: (phone || name || '').trim() })
    if (venueId) params.set('venueId', venueId)
    Promise.all([
      fetch(`/api/admin/customers?${params.toString()}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/admin/bookings?${params.toString()}`).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([customers, bookingRows]) => {
        setCustomer(Array.isArray(customers) && customers.length > 0 ? customers[0] : null)
        setBookings(Array.isArray(bookingRows) ? bookingRows : [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [isOpen, name, phone, venueId])

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="CUSTOMER DETAILS" width="md">
      <div className="space-y-4">
        {loading ? (
          <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
        ) : (
          <>
            <div className="border border-grey-mid p-3 space-y-1">
              <div className="font-mono text-sm font-bold text-white uppercase">{customer?.name ?? name}</div>
              {(customer?.phone ?? phone) && <div className="font-mono text-xs text-grey-light">{customer?.phone ?? phone}</div>}
              {(customer?.email ?? email) && <div className="font-mono text-xs text-grey-light">{customer?.email ?? email}</div>}
              {customer && (
                <div className="font-mono text-[10px] text-grey-light mt-1">
                  {customer.totalBookings} BOOKINGS · {customer.totalPax} PAX TOTAL
                </div>
              )}
            </div>

            <div>
              <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider mb-2">BOOKINGS</h3>
              {bookings.length === 0 ? (
                <p className="font-mono text-xs text-grey-light">NO BOOKINGS FOUND.</p>
              ) : (
                <div className="border border-grey-mid divide-y divide-grey-mid max-h-60 overflow-y-auto">
                  {bookings.map((b) => (
                    <div key={b.id} className="flex items-center justify-between px-3 py-2">
                      <div>
                        <span className="font-mono text-xs text-white">{String(b.date).slice(0, 10)} · {b.startTime}–{b.endTime}</span>
                        <span className="font-mono text-[10px] text-grey-light ml-2">{b.partySize} PAX</span>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => {
                        onClose()
                        window.open('/admin/ops?tab=bookings', '_self')
                      }}>VIEW</Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Drawer>
  )
}
