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

interface FohOrder {
  id: string; wooOrderId: string; customerName: string | null; partySize: number | null
  status: string; totalAmount: number | null; calendarEventId: string | null
  tables: { number: string; capacity: number }[]
  items: { id: string; menuItemName: string; dietaryInfo: string | null; recipeId: string | null; kitchenStatus: string; qty: number; unitPrice: number | null }[]
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'text-warning border-warning',
  PROCESSING: 'text-accent border-accent',
  COMPLETED: 'text-success border-success',
  CANCELLED: 'text-danger border-danger',
}

const ORDER_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED']

export function OrdersClient() {
  const [tab, setTab] = useState<'orders' | 'foh'>('orders')

  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [reconciling, setReconciling] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const [fohDate, setFohDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [fohOrders, setFohOrders] = useState<FohOrder[]>([])
  const [fohLoading, setFohLoading] = useState(false)
  const [fohCategoryTotals, setFohCategoryTotals] = useState<Record<string, { total: number; items: { name: string; qty: number }[] }>>({})
  const [fohExpandedId, setFohExpandedId] = useState<string | null>(null)

  async function handleStatusChange(orderId: string, status: string) {
    setUpdatingId(orderId)
    try {
      const r = await fetch(`/api/admin/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (r.ok) {
        setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)))
        pushToast(`STATUS UPDATED — PUSHED TO WOOCOMMERCE`, 'success')
      } else {
        pushToast('STATUS UPDATE FAILED', 'error')
      }
    } catch {
      pushToast('STATUS UPDATE FAILED', 'error')
    }
    setUpdatingId(null)
  }

  async function handleReconcile() {
    setReconciling(true)
    try {
      const r = await fetch('/api/admin/inventory/reconcile', { method: 'POST' })
      if (r.ok) {
        const d = await r.json()
        pushToast(`RECONCILED ${d.reconciledCount} ITEMS ACROSS ${d.ordersProcessed} ORDERS`, 'success')
        loadOrders()
      } else {
        pushToast('RECONCILIATION FAILED', 'error')
      }
    } catch {
      pushToast('RECONCILIATION FAILED', 'error')
    }
    setReconciling(false)
  }

  async function loadOrders() {
    setLoading(true)
    const r = await fetch('/api/admin/orders')
    if (r.ok) {
      const data = await r.json()
      setOrders(Array.isArray(data) ? data : [])
    }
    setLoading(false)
  }

  async function loadFoh() {
    setFohLoading(true)
    const r = await fetch(`/api/admin/orders/foh?date=${fohDate}`)
    if (r.ok) {
      const data = await r.json()
      setFohOrders(Array.isArray(data.orders) ? data.orders : [])
      setFohCategoryTotals(data.categoryTotals ?? {})
    }
    setFohLoading(false)
  }

  useEffect(() => { loadOrders() }, [])

  useEffect(() => {
    if (tab === 'foh') loadFoh()
  }, [fohDate, tab]) // eslint-disable-line react-hooks/exhaustive-deps

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

      <div className="flex items-center gap-0 border border-grey-mid">
        <button
          onClick={() => setTab('orders')}
          className={`font-mono text-xs uppercase px-4 py-2 tracking-wider ${tab === 'orders' ? 'bg-white text-black' : 'text-grey-light hover:text-white'}`}
        >
          ORDERS
        </button>
        <button
          onClick={() => setTab('foh')}
          className={`font-mono text-xs uppercase px-4 py-2 tracking-wider ${tab === 'foh' ? 'bg-white text-black' : 'text-grey-light hover:text-white'}`}
        >
          FOH VIEW
        </button>
      </div>

      {tab === 'orders' ? (
        <OrdersTable
          orders={orders}
          expandedId={expandedId}
          setExpandedId={setExpandedId}
          updatingId={updatingId}
          handleStatusChange={handleStatusChange}
        />
      ) : (
        <FohView
          fohDate={fohDate}
          setFohDate={setFohDate}
          fohOrders={fohOrders}
          fohLoading={fohLoading}
          fohCategoryTotals={fohCategoryTotals}
          fohExpandedId={fohExpandedId}
          setFohExpandedId={setFohExpandedId}
        />
      )}
    </div>
  )
}

function OrdersTable({ orders, expandedId, setExpandedId, updatingId, handleStatusChange }: {
  orders: Order[]
  expandedId: string | null
  setExpandedId: (id: string | null) => void
  updatingId: string | null
  handleStatusChange: (orderId: string, status: string) => Promise<void>
}) {
  if (orders.length === 0) {
    return (
      <div className="border border-grey-mid p-8 text-center">
        <p className="font-mono text-xs text-grey-light uppercase">NO ORDERS YET</p>
        <p className="font-mono text-[10px] text-grey-light mt-1">ORDERS SYNC FROM WOOCOMMERCE</p>
      </div>
    )
  }

  return (
    <div className="border border-grey-mid">
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

            {expanded && (
              <div className="border-t border-grey-mid bg-grey-dark/20 px-6 py-3">
                <div className="flex items-center gap-3 mb-3">
                  <span className="font-mono text-[10px] text-grey-light uppercase">STATUS</span>
                  <select
                    value={o.status}
                    disabled={updatingId === o.id}
                    onChange={(e) => handleStatusChange(o.id, e.target.value)}
                    className="bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1 outline-none focus:border-white disabled:opacity-40 uppercase"
                  >
                    {ORDER_STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <span className="font-mono text-[9px] text-grey-light uppercase">
                    {updatingId === o.id ? 'PUSHING TO WOOCOMMERCE...' : 'CHANGES PUSH TO WOOCOMMERCE'}
                  </span>
                </div>
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
  )
}

function FohView({ fohDate, setFohDate, fohOrders, fohLoading, fohCategoryTotals, fohExpandedId, setFohExpandedId }: {
  fohDate: string
  setFohDate: (d: string) => void
  fohOrders: FohOrder[]
  fohLoading: boolean
  fohCategoryTotals: Record<string, { total: number; items: { name: string; qty: number }[] }>
  fohExpandedId: string | null
  setFohExpandedId: (id: string | null) => void
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <div className="lg:col-span-9 space-y-4">
        <div className="flex items-center gap-3 border border-grey-mid p-3">
          <span className="font-mono text-xs uppercase text-grey-light tracking-wider">DATE</span>
          <input
            type="date"
            value={fohDate}
            onChange={(e) => setFohDate(e.target.value)}
            className="bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white"
            style={{ colorScheme: 'dark' }}
          />
          <span className="font-mono text-xs text-grey-light ml-auto">{fohOrders.length} BOOKINGS</span>
        </div>

        {fohLoading ? (
          <div className="flex items-center justify-center h-32">
            <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
          </div>
        ) : fohOrders.length === 0 ? (
          <div className="border border-grey-mid p-8 text-center">
            <p className="font-mono text-xs text-grey-light uppercase">NO BOOKINGS FOR THIS DATE</p>
          </div>
        ) : (
          <div className="space-y-3">
            {fohOrders.map((o) => {
              const expanded = fohExpandedId === o.id
              return (
                <div key={o.id} className="border border-grey-mid">
                  <button
                    onClick={() => setFohExpandedId(expanded ? null : o.id)}
                    className="w-full px-4 py-3 text-left hover:bg-grey-mid/10 font-mono"
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <span className={`text-[10px] ${expanded ? 'text-white' : ''}`}>{expanded ? '▾' : '▸'}</span>
                        <span className="text-white font-bold uppercase text-sm">#{o.wooOrderId}</span>
                        <span className="text-grey-light text-xs uppercase">{o.customerName || '—'}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-grey-light text-xs">PARTY: <span className="text-white">{o.partySize ?? '—'}</span></span>
                        {o.tables.length > 0 && (
                          <span className="text-grey-light text-xs">
                            TABLES: <span className="text-success">{o.tables.map((t) => t.number).join(', ')}</span>
                          </span>
                        )}
                        <span className={`text-[10px] uppercase border px-1.5 py-0.5 ${STATUS_STYLES[o.status] ?? ''}`}>{o.status}</span>
                      </div>
                    </div>
                  </button>

                  {expanded && (
                    <div className="border-t border-grey-mid bg-grey-dark/20 px-6 py-3 space-y-2">
                      <div className="flex flex-wrap gap-4 font-mono text-[10px] text-grey-light uppercase">
                        <span>ORDER: {o.wooOrderId}</span>
                        <span>PARTY SIZE: {o.partySize ?? '—'}</span>
                        <span>AMOUNT: ${(o.totalAmount ?? 0).toFixed(2)}</span>
                        {o.tables.length > 0 && (
                          <span className="text-success">
                            TABLES: {o.tables.map((t) => `${t.number}(${t.capacity}P)`).join(', ')}
                          </span>
                        )}
                      </div>
                      {o.items.length > 0 ? (
                        <div className="space-y-1">
                          <p className="font-mono text-[10px] text-grey-light uppercase">LINE ITEMS</p>
                          {o.items.map((li) => (
                            <div key={li.id} className="flex items-center gap-3 text-xs font-mono">
                              <span className="flex-1 text-white uppercase">{li.menuItemName}</span>
                              {li.dietaryInfo && (
                                <span className="text-[#c4a530] border border-[#c4a530] px-1 text-[9px] uppercase">{li.dietaryInfo}</span>
                              )}
                              <span className="text-grey-light">×{li.qty}</span>
                              <span className="text-grey-light">${((li.unitPrice ?? 0) * li.qty).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="font-mono text-xs text-grey-light">NO LINE ITEMS</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="lg:col-span-3">
        <div className="border border-grey-mid p-4 space-y-3">
          <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">TOTALS BY CATEGORY</h3>
          {Object.keys(fohCategoryTotals).length === 0 ? (
            <p className="font-mono text-[10px] text-grey-light uppercase">NO DATA FOR THIS DATE</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(fohCategoryTotals).map(([cat, data]) => (
                <div key={cat}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-[11px] text-white uppercase">{cat}</span>
                    <span className="font-mono text-sm text-white">{data.total}</span>
                  </div>
                  <div className="space-y-0.5">
                    {data.items.map((item) => (
                      <div key={item.name} className="flex items-center justify-between text-[10px] font-mono text-grey-light">
                        <span className="uppercase">{item.name}</span>
                        <span>×{item.qty}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
