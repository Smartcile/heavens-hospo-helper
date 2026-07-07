'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { pushToast } from '@/components/ui/Toast'

interface OrderItemView {
  id: string; qty: number; unitPrice: number | null; notes: string | null
  menuItem?: { id: string; name: string; price: number }
}

interface Order {
  id: string; wooOrderId: string; customerName: string | null; customerEmail: string | null
  customerPhone: string | null; partySize: number | null; fulfillmentDate: string | null
  status: string; totalAmount: number | null; notes: string | null
  calendarEventId: string | null; syncedAt: string | null; createdAt: string
  items?: OrderItemView[]
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'text-warning border-warning',
  PROCESSING: 'text-accent border-accent',
  COMPLETED: 'text-success border-success',
  CANCELLED: 'text-danger border-danger',
}

export function OrdersClient() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [reconciling, setReconciling] = useState(false)

  async function handleReconcile() {
    setReconciling(true)
    try {
      const r = await fetch('/api/admin/inventory/reconcile', { method: 'POST' })
      if (r.ok) {
        const d = await r.json()
        pushToast(`RECONCILED ${d.reconciledCount} ITEMS ACROSS ${d.ordersProcessed} ORDERS`, 'success')
        load()
      } else {
        pushToast('RECONCILIATION FAILED', 'error')
      }
    } catch {
      pushToast('RECONCILIATION FAILED', 'error')
    }
    setReconciling(false)
  }

  async function load() {
    setLoading(true)
    const r = await fetch('/api/admin/orders')
    if (r.ok) {
      const data = await r.json()
      setOrders(Array.isArray(data) ? data : [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  if (loading) {
    return <div className="flex items-center justify-center h-64"><p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p></div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">ORDERS</h1>
        <div className="flex items-center gap-3">
          <Button size="sm" variant="ghost" onClick={handleReconcile} disabled={reconciling}>
            {reconciling ? 'RUNNING...' : 'RUN EOD RECONCILIATION'}
          </Button>
          <span className="font-mono text-xs text-grey-light">{orders.length} ORDERS</span>
        </div>
      </div>

      <div className="border border-grey-mid">
        {orders.length === 0 ? (
          <div className="p-8 text-center">
            <p className="font-mono text-xs text-grey-light uppercase">NO ORDERS YET</p>
            <p className="font-mono text-[10px] text-grey-light mt-1">ORDERS SYNC FROM WOOCOMMERCE</p>
          </div>
        ) : (
          <div>
            {/* Table header */}
            <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2 border-b border-grey-mid bg-grey-dark/30 font-mono text-[10px] uppercase text-grey-light">
              <div className="col-span-2">ORDER #</div>
              <div className="col-span-2">CUSTOMER</div>
              <div className="col-span-1">PARTY</div>
              <div className="col-span-2">FULFILLMENT</div>
              <div className="col-span-2">AMOUNT</div>
              <div className="col-span-2">STATUS</div>
              <div className="col-span-1">SEATED</div>
            </div>

            {orders.map((o) => {
              const expanded = expandedId === o.id
              const statusStyle = STATUS_STYLES[o.status] ?? 'text-grey-light border-grey-mid'
              const hasEvent = !!o.calendarEventId

              return (
                <div key={o.id}>
                  <button
                    onClick={() => setExpandedId(expanded ? null : o.id)}
                    className="w-full grid grid-cols-1 md:grid-cols-12 gap-2 px-4 py-2.5 border-b border-grey-mid last:border-0 hover:bg-grey-mid/10 items-center text-left font-mono"
                  >
                    <div className="md:col-span-2 flex items-center gap-2">
                      <span className={`text-[10px] ${expanded ? 'text-white' : ''}`}>{expanded ? '▾' : '▸'}</span>
                      <span className="text-xs text-white">{o.wooOrderId}</span>
                    </div>
                    <div className="md:col-span-2">
                      <div className="text-xs text-white truncate">{o.customerName ?? '—'}</div>
                      <div className="text-[9px] text-grey-light truncate">{o.customerEmail ?? ''}</div>
                    </div>
                    <div className="md:col-span-1">
                      <span className="text-xs text-white">{o.partySize != null ? o.partySize : '—'}</span>
                    </div>
                    <div className="md:col-span-2">
                      <span className="text-xs text-white">
                        {o.fulfillmentDate ? new Date(o.fulfillmentDate).toLocaleDateString() : '—'}
                      </span>
                    </div>
                    <div className="md:col-span-2">
                      <span className="text-xs text-white">${(o.totalAmount ?? 0).toFixed(2)}</span>
                    </div>
                    <div className="md:col-span-2">
                      <span className={`text-[10px] uppercase border px-1.5 py-0.5 ${statusStyle}`}>{o.status}</span>
                    </div>
                    <div className="md:col-span-1">
                      <span className={`text-[10px] font-mono ${hasEvent ? 'text-success' : 'text-grey-light'}`}>
                        {hasEvent ? '✓' : '—'}
                      </span>
                    </div>
                  </button>

                  {/* Expanded: line items */}
                  {expanded && (
                    <div className="border-t border-grey-mid bg-grey-dark/20 px-6 py-3">
                      {o.items && o.items.length > 0 ? (
                        <div className="space-y-1">
                          <p className="font-mono text-[10px] text-grey-light uppercase mb-2">LINE ITEMS</p>
                          {o.items.map((li) => (
                            <div key={li.id} className="flex items-center gap-4 text-xs font-mono">
                              <span className="flex-1 text-white uppercase">{li.menuItem?.name ?? '—'}</span>
                              <span className="text-grey-light">×{li.qty}</span>
                              <span className="text-grey-light">${((li.unitPrice ?? 0) * li.qty).toFixed(2)}</span>
                            </div>
                          ))}
                          {hasEvent && (
                            <p className="font-mono text-[10px] text-success uppercase mt-2 border-t border-grey-mid pt-2">
                              AUTO-SEATED · LINKED TO EVENT
                            </p>
                          )}
                          {o.notes && (
                            <p className="font-mono text-[10px] text-grey-light mt-1 italic">{o.notes}</p>
                          )}
                        </div>
                      ) : (
                        <p className="font-mono text-xs text-grey-light">No line items.</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
