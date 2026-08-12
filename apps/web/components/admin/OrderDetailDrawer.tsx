'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { pushToast } from '@/components/ui/Toast'
import { CustomerDrawer } from '@/components/admin/CustomerDrawer'
import { OP_STATUS_STYLES } from '@/components/admin/OrdersViews'
import type { OrderView } from '@/lib/order-views'

const OP_STATUSES = [
  'NEW', 'CONFIRMED', 'IN_PREP', 'READY', 'ARRIVED',
  'OUT_FOR_DELIVERY', 'HANDED_OVER', 'FINALISED', 'CANCELLED',
]
const PAYMENT_STATUSES = ['UNPAID', 'PARTIAL', 'PAID', 'REFUNDED']
const FULFILLMENT_TYPES = ['DINE_IN', 'PICKUP', 'DELIVERY']
const WOO_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED']

export function OrderDetailDrawer({
  order, onClose, onChanged,
}: {
  order: OrderView
  onClose: () => void
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [editingBooking, setEditingBooking] = useState(false)
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [editParty, setEditParty] = useState('')
  const [showCustomer, setShowCustomer] = useState(false)

  async function patch(body: Record<string, unknown>, successMsg: string) {
    setBusy(true)
    const res = await fetch(`/api/admin/orders/${order.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setBusy(false)
    if (res.ok) { pushToast(successMsg, 'success'); onChanged() }
    else {
      const err = await res.json().catch(() => ({}))
      pushToast((err.error ?? 'UPDATE FAILED').toUpperCase(), 'error')
    }
  }

  /** Create the table reservation for a dine-in order that has none yet. */
  async function createBooking() {
    setBusy(true)
    const res = await fetch(`/api/admin/orders/${order.id}/booking`, { method: 'POST' })
    setBusy(false)
    if (res.ok) { pushToast('BOOKING CREATED', 'success'); onChanged() }
    else {
      const err = await res.json().catch(() => ({}))
      pushToast((err.error ?? 'BOOKING FAILED').toUpperCase(), 'error')
    }
  }

  /** Save the linked booking's time/party edits in place. */
  async function saveBookingEdit() {
    if (!order.booking) return
    setBusy(true)
    const res = await fetch(`/api/admin/bookings/${order.booking.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startTime: editStart, endTime: editEnd, partySize: parseInt(editParty) || 1 }),
    })
    setBusy(false)
    if (res.ok) { pushToast('BOOKING UPDATED', 'success'); setEditingBooking(false); onChanged() }
    else {
      const err = await res.json().catch(() => ({}))
      pushToast((err.error ?? 'SAVE FAILED').toUpperCase(), 'error')
    }
  }

  async function remove() {
    if (!confirm(`DELETE ORDER ${order.ref}?`)) return
    setBusy(true)
    const res = await fetch(`/api/admin/orders/${order.id}`, { method: 'DELETE' })
    setBusy(false)
    if (res.ok) { pushToast('ORDER DELETED', 'success'); onClose(); onChanged() }
    else pushToast('DELETE FAILED', 'error')
  }

  const isWoo = order.source === 'WOO'

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="md"
      title={
        <span className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-sm text-white font-bold">{order.ref}</span>
          <span className="font-mono text-[9px] uppercase border border-accent text-accent px-1">
            {order.source}
          </span>
        </span>
      }
    >
      <div className="space-y-4">
        {/* Allergy first — the safety-critical information */}
        {(order.allergenNote || order.items.some((i) => i.allergenNote)) && (
            <div className="border border-danger p-3 space-y-1">
              <h3 className="font-mono text-xs uppercase text-danger tracking-wider">⚠ ALLERGY REQUIREMENTS</h3>
              {order.allergenNote && (
                <p className="font-mono text-xs text-danger uppercase">{order.allergenNote}</p>
              )}
              {order.items.filter((i) => i.allergenNote).map((i) => (
                <p key={i.id} className="font-mono text-xs text-danger uppercase">
                  {i.name}: {i.allergenNote}
                </p>
              ))}
            </div>
          )}

          {/* Contact */}
          <div className="border border-grey-mid p-3 space-y-2">
            <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">CUSTOMER</h3>
            <div className="grid grid-cols-3 gap-2 font-mono text-xs">
              <span className="text-grey-light uppercase">NAME</span>
              <span className="col-span-2 text-white uppercase">{order.customerName ?? '—'}</span>
              <span className="text-grey-light uppercase">PHONE</span>
              <span className="col-span-2 text-white">
                {order.customerPhone
                  ? <a href={`tel:${order.customerPhone}`} className="hover:underline">{order.customerPhone}</a>
                  : '—'}
              </span>
              <span className="text-grey-light uppercase">EMAIL</span>
              <span className="col-span-2 text-white truncate">
                {order.customerEmail
                  ? <a href={`mailto:${order.customerEmail}`} className="hover:underline">{order.customerEmail}</a>
                  : '—'}
              </span>
            </div>
            {order.customerName && (
              <Button size="sm" variant="ghost" onClick={() => setShowCustomer(true)}>VIEW CUSTOMER</Button>
            )}
          </div>

          {/* Service — the fields adapt to fulfillment type: dine-in carries
              the table booking (create/edit in place), pickup and delivery
              carry only their time (no pax, no reservation). */}
          <div className="border border-grey-mid p-3 space-y-2">
            <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">SERVICE</h3>
            <div className="grid grid-cols-3 gap-2 font-mono text-xs items-center">
              <span className="text-grey-light uppercase">TYPE</span>
              <select
                value={order.fulfillmentType}
                disabled={busy}
                onChange={(e) => patch({ fulfillmentType: e.target.value }, 'TYPE UPDATED')}
                className="col-span-2 bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1 outline-none focus:border-white disabled:opacity-40 uppercase"
              >
                {FULFILLMENT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
              <span className="text-grey-light uppercase">DATE</span>
              <input
                type="date"
                value={order.serviceDate ?? ''}
                disabled={busy}
                onChange={(e) => patch({ serviceDate: e.target.value }, 'DATE UPDATED')}
                className="col-span-2 bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1 outline-none focus:border-white disabled:opacity-40"
              />
              <span className="text-grey-light uppercase">
                {order.fulfillmentType === 'DINE_IN' ? 'TIME' : order.fulfillmentType === 'PICKUP' ? 'PICKUP TIME' : 'DELIVERY TIME'}
              </span>
              <input
                type="time"
                value={order.serviceTime ?? ''}
                disabled={busy}
                onChange={(e) => patch({ serviceTime: e.target.value }, 'TIME UPDATED')}
                className="col-span-2 bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1 outline-none focus:border-white disabled:opacity-40"
              />
              {order.fulfillmentType === 'DINE_IN' && (<>
                <span className="text-grey-light uppercase">PARTY</span>
                <input
                  type="number"
                  min="1"
                  value={order.partySize ?? ''}
                  disabled={busy}
                  onChange={(e) => patch({ partySize: e.target.value === '' ? null : e.target.value }, 'PARTY SIZE UPDATED')}
                  className="col-span-2 bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1 outline-none focus:border-white disabled:opacity-40 text-right"
                />
                <span className="text-grey-light uppercase">TABLES</span>
                <span className="col-span-2 text-success">
                  {order.tables.length > 0 ? order.tables.join(', ') : '—'}
                </span>
              </>)}
              {order.menuName && (
                <>
                  <span className="text-grey-light uppercase">MENU</span>
                  <span className="col-span-2 text-accent uppercase">{order.menuName}</span>
                </>
              )}
            </div>

            {order.fulfillmentType === 'DINE_IN' && (
              <div className="border border-grey-mid p-2 space-y-2">
                <h4 className="font-mono text-[10px] uppercase text-grey-light tracking-wider">BOOKING</h4>
                {order.booking ? (
                  <>
                    <div className="grid grid-cols-3 gap-2 font-mono text-[11px] items-center">
                      <span className="text-grey-light uppercase">TIME</span>
                      <span className="col-span-2 text-white">{order.booking.startTime}–{order.booking.endTime}</span>
                      <span className="text-grey-light uppercase">PAX</span>
                      <span className="col-span-2 text-white">{order.booking.partySize}</span>
                      <span className="text-grey-light uppercase">TABLES</span>
                      <span className="col-span-2 text-success">
                        {order.booking.tables.length > 0 ? order.booking.tables.join(', ') : '—'}
                      </span>
                    </div>
                    {editingBooking ? (
                      <>
                        <div className="grid grid-cols-3 gap-2 font-mono text-[11px] items-center">
                          <span className="text-grey-light uppercase">START</span>
                          <input
                            type="time"
                            value={editStart}
                            disabled={busy}
                            onChange={(e) => setEditStart(e.target.value)}
                            className="col-span-2 bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1 outline-none focus:border-white disabled:opacity-40"
                          />
                          <span className="text-grey-light uppercase">END</span>
                          <input
                            type="time"
                            value={editEnd}
                            disabled={busy}
                            onChange={(e) => setEditEnd(e.target.value)}
                            className="col-span-2 bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1 outline-none focus:border-white disabled:opacity-40"
                          />
                          <span className="text-grey-light uppercase">PAX</span>
                          <input
                            type="number"
                            min="1"
                            value={editParty}
                            disabled={busy}
                            onChange={(e) => setEditParty(e.target.value)}
                            className="col-span-2 bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1 outline-none focus:border-white disabled:opacity-40 text-right"
                          />
                        </div>
                        <div className="flex gap-2 pt-1">
                          <Button size="sm" onClick={saveBookingEdit} loading={busy}>SAVE BOOKING</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingBooking(false)}>CANCEL</Button>
                        </div>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (order.booking) {
                            setEditStart(order.booking.startTime)
                            setEditEnd(order.booking.endTime)
                            setEditParty(String(order.booking.partySize))
                          }
                          setEditingBooking(true)
                        }}
                      >
                        EDIT BOOKING
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <p className="font-mono text-[9px] text-grey-light uppercase">
                      NO BOOKING YET — THIS ORDER HAS A SERVICE TIME BUT NO TABLE RESERVATION
                    </p>
                    <Button size="sm" onClick={createBooking} loading={busy}>CREATE BOOKING</Button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Progress */}
          <div className="border border-grey-mid p-3 space-y-2">
            <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">PROGRESS</h3>
            <div className="flex flex-wrap gap-1">
              {OP_STATUSES.map((s) => (
                <button
                  key={s}
                  disabled={busy}
                  onClick={() => patch({ opStatus: s }, `MARKED ${s.replace(/_/g, ' ')}`)}
                  className={`font-mono text-[9px] uppercase border px-1.5 py-1 disabled:opacity-40 ${
                    order.opStatus === s
                      ? OP_STATUS_STYLES[s] ?? 'text-white border-white'
                      : 'text-grey-light border-grey-mid hover:border-white hover:text-white'
                  }`}
                >
                  {s.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Payment — read-only truth lives in WooCommerce */}
          <div className="border border-grey-mid p-3 space-y-2">
            <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">PAYMENT</h3>
            <p className="font-mono text-[9px] text-grey-light">
              PAYMENTS ARE TAKEN IN WOOCOMMERCE. THIS RECORDS WHAT WAS REPORTED.
            </p>
            <div className="grid grid-cols-3 gap-2 font-mono text-xs items-center">
              <span className="text-grey-light uppercase">STATUS</span>
              <select
                value={order.paymentStatus}
                disabled={busy}
                onChange={(e) => patch({ paymentStatus: e.target.value }, 'PAYMENT UPDATED')}
                className="col-span-2 bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1 outline-none focus:border-white disabled:opacity-40 uppercase"
              >
                {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <span className="text-grey-light uppercase">METHOD</span>
              <span className="col-span-2 text-white uppercase">{order.paymentMethod ?? '—'}</span>
              <span className="text-grey-light uppercase">TOTAL</span>
              <span className="col-span-2 text-white">${(order.totalAmount ?? 0).toFixed(2)}</span>
            </div>
          </div>

          {/* Items */}
          <div className="border border-grey-mid">
            <div className="px-3 py-1.5 border-b border-grey-mid">
              <span className="font-mono text-xs uppercase text-grey-light tracking-wider">
                ITEMS ({order.items.length})
              </span>
            </div>
            {order.items.length === 0 ? (
              <p className="font-mono text-xs text-grey-light p-3 uppercase">NO LINE ITEMS</p>
            ) : (
              <div className="divide-y divide-grey-mid">
                {order.items.map((i) => (
                  <div key={i.id} className="px-3 py-2 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-white w-8 shrink-0">×{i.qty}</span>
                      <span className="font-mono text-xs text-white uppercase flex-1 truncate">{i.name}</span>
                      <span className="font-mono text-xs text-grey-light shrink-0">
                        ${((i.unitPrice ?? 0) * i.qty).toFixed(2)}
                      </span>
                    </div>
                    {i.dietaryInfo && (
                      <div className="flex gap-1 flex-wrap pl-10">
                        {i.dietaryInfo.split(',').map((a) => a.trim()).filter(Boolean).map((a) => (
                          <span key={a} className="font-mono text-[9px] uppercase border border-[#c4a530] text-[#c4a530] px-1">
                            {a}
                          </span>
                        ))}
                      </div>
                    )}
                    {i.customerNote && (
                      <p className="font-mono text-[10px] text-grey-light pl-10 italic">{i.customerNote}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {order.notes && (
            <div className="border border-grey-mid p-3">
              <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider mb-1">NOTES</h3>
              <p className="font-mono text-xs text-white">{order.notes}</p>
            </div>
          )}

          {/* WooCommerce status — only meaningful for Woo orders */}
          {isWoo && (
            <div className="border border-grey-mid p-3 space-y-2">
              <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">WOOCOMMERCE STATUS</h3>
              <select
                value={order.status}
                disabled={busy}
                onChange={(e) => patch({ status: e.target.value }, 'STATUS PUSHED TO WOOCOMMERCE')}
                className="w-full bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white disabled:opacity-40 uppercase"
              >
                {WOO_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <p className="font-mono text-[9px] text-grey-light uppercase">CHANGES PUSH BACK TO WOOCOMMERCE</p>
            </div>
          )}

          <div className="border-t border-grey-mid pt-3">
            <Button size="sm" variant="danger" onClick={remove} disabled={busy}>DELETE ORDER</Button>
          </div>
      </div>
      <CustomerDrawer
        isOpen={showCustomer}
        onClose={() => setShowCustomer(false)}
        name={order.customerName ?? ''}
        phone={order.customerPhone}
        email={order.customerEmail}
      />
    </Modal>
  )
}
