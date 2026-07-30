'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { pushToast } from '@/components/ui/Toast'
import { ServiceView, KitchenView, FohView, ProductionView } from '@/components/admin/OrdersViews'
import { OrderDetailDrawer } from '@/components/admin/OrderDetailDrawer'
import { NewOrderModal } from '@/components/admin/NewOrderModal'
import { applyFilters, summarise, type OrderView, type OrderFilters } from '@/lib/order-views'

type ViewType = 'SERVICE' | 'KITCHEN' | 'FOH' | 'PRODUCTION'

const VIEWS: { key: ViewType; label: string; hint: string }[] = [
  { key: 'SERVICE', label: 'SERVICE', hint: 'BY TIME SLOT' },
  { key: 'KITCHEN', label: 'KITCHEN', hint: 'PREP TOTALS + ALLERGENS' },
  { key: 'FOH', label: 'FOH', hint: 'BY TABLE' },
  { key: 'PRODUCTION', label: 'PRODUCTION', hint: 'PICK LIST' },
]

const OP_STATUSES = [
  'NEW', 'CONFIRMED', 'IN_PREP', 'READY', 'ARRIVED',
  'OUT_FOR_DELIVERY', 'HANDED_OVER', 'FINALISED', 'CANCELLED',
]
const PAYMENT_STATUSES = ['UNPAID', 'PARTIAL', 'PAID', 'REFUNDED']

interface SavedView {
  id: string
  name: string
  viewType: string
  config: { filters?: OrderFilters; slotMinutes?: number }
}

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function OrdersClient() {
  const [date, setDate] = useState(today)
  const [view, setView] = useState<ViewType>('SERVICE')
  const [orders, setOrders] = useState<OrderView[]>([])
  const [categoryPairs, setCategoryPairs] = useState<[string, string[]][]>([])
  const [undatedCount, setUndatedCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const [filters, setFilters] = useState<OrderFilters>({})
  const [savedViews, setSavedViews] = useState<SavedView[]>([])
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null)

  const [openOrderId, setOpenOrderId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [showFilters, setShowFilters] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/orders?date=${date}`)
    if (res.ok) {
      const d = await res.json()
      setOrders(d.orders ?? [])
      setCategoryPairs(d.categoryByMenuItem ?? [])
      setUndatedCount(d.undatedCount ?? 0)
    } else {
      pushToast('FAILED TO LOAD ORDERS', 'error')
    }
    setLoading(false)
  }, [date])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    fetch('/api/admin/order-views').then(async (r) => {
      if (r.ok) setSavedViews(await r.json())
    })
  }, [])

  const categoryByMenuItem = useMemo(() => new Map(categoryPairs), [categoryPairs])
  const visible = useMemo(() => applyFilters(orders, filters), [orders, filters])
  const stats = useMemo(() => summarise(visible), [visible])

  const activeFilterCount =
    (filters.opStatus?.length ? 1 : 0) +
    (filters.paymentStatus?.length ? 1 : 0) +
    (filters.allergensOnly ? 1 : 0) +
    (filters.search ? 1 : 0)

  function toggleIn(list: string[] | undefined, value: string): string[] {
    const set = new Set(list ?? [])
    if (set.has(value)) set.delete(value)
    else set.add(value)
    return [...set]
  }

  function applySaved(v: SavedView) {
    setActiveSavedId(v.id)
    setView(v.viewType as ViewType)
    setFilters(v.config?.filters ?? {})
  }

  async function saveCurrentView() {
    const name = prompt('NAME THIS VIEW')?.toUpperCase().trim()
    if (!name) return

    const res = await fetch('/api/admin/order-views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, viewType: view, config: { filters } }),
    })
    if (res.ok) {
      const created = await res.json()
      setSavedViews([...savedViews, created])
      setActiveSavedId(created.id)
      pushToast('VIEW SAVED', 'success')
    } else pushToast('COULD NOT SAVE VIEW', 'error')
  }

  async function deleteSaved(id: string) {
    if (!confirm('DELETE THIS SAVED VIEW?')) return
    const res = await fetch(`/api/admin/order-views/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setSavedViews(savedViews.filter((v) => v.id !== id))
      if (activeSavedId === id) setActiveSavedId(null)
      pushToast('VIEW DELETED', 'success')
    } else pushToast('DELETE FAILED', 'error')
  }

  const openOrder = orders.find((o) => o.id === openOrderId) ?? null

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">ORDERS</h1>
        <Button size="sm" onClick={() => setShowNew(true)}>+ NEW ORDER</Button>
      </div>

      {/* Date bar */}
      <div className="border border-grey-mid p-3 flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setDate(shiftDate(date, -1))}
          className="font-mono text-xs text-grey-light hover:text-white border border-grey-mid px-2 py-1.5"
        >
          ←
        </button>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white"
          style={{ colorScheme: 'dark' }}
        />
        <button
          onClick={() => setDate(shiftDate(date, 1))}
          className="font-mono text-xs text-grey-light hover:text-white border border-grey-mid px-2 py-1.5"
        >
          →
        </button>
        <button
          onClick={() => setDate(today())}
          className="font-mono text-xs uppercase text-grey-light hover:text-white border border-grey-mid px-2 py-1.5"
        >
          TODAY
        </button>

        <div className="flex items-center gap-4 ml-auto font-mono text-xs">
          <span className="text-grey-light">ORDERS <span className="text-white">{stats.orders}</span></span>
          <span className="text-grey-light">COVERS <span className="text-white">{stats.covers}</span></span>
          <span className="text-grey-light">REVENUE <span className="text-white">${stats.revenue.toFixed(2)}</span></span>
          {stats.unpaid > 0 && (
            <span className="text-grey-light">
              UNPAID <span className="text-danger">{stats.unpaid} (${stats.outstanding.toFixed(2)})</span>
            </span>
          )}
        </div>
      </div>

      {undatedCount > 0 && (
        <div className="border border-[#FACC15] p-2.5">
          <p className="font-mono text-[10px] text-[#FACC15] uppercase">
            {undatedCount} ORDER{undatedCount === 1 ? '' : 'S'} HAVE NO SERVICE DATE AND CANNOT BE SHOWN ON A DAY.
            CHECK THE ORDER FIELD MAPPING IN SETTINGS → WOOCOMMERCE.
          </p>
        </div>
      )}

      {/* View switcher */}
      <div className="flex items-center gap-0 border border-grey-mid flex-wrap">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => { setView(v.key); setActiveSavedId(null) }}
            title={v.hint}
            className={`font-mono text-xs uppercase px-4 py-2 tracking-wider ${
              view === v.key ? 'bg-white text-black' : 'text-grey-light hover:text-white'
            }`}
          >
            {v.label}
          </button>
        ))}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`font-mono text-xs uppercase px-3 py-2 tracking-wider ml-auto ${
            activeFilterCount > 0 ? 'text-[#60A5FA]' : 'text-grey-light hover:text-white'
          }`}
        >
          FILTERS{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </button>
      </div>

      {/* Saved views */}
      {savedViews.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[10px] uppercase text-grey-light">SAVED</span>
          {savedViews.map((v) => (
            <span key={v.id} className="inline-flex items-center">
              <button
                onClick={() => applySaved(v)}
                className={`font-mono text-[10px] uppercase border px-2 py-1 ${
                  activeSavedId === v.id ? 'border-white text-white' : 'border-grey-mid text-grey-light hover:text-white'
                }`}
              >
                {v.name}
              </button>
              <button
                onClick={() => deleteSaved(v.id)}
                className="font-mono text-[10px] text-grey-light hover:text-danger border border-l-0 border-grey-mid px-1 py-1"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Filters */}
      {showFilters && (
        <div className="border border-grey-mid p-3 space-y-3">
          <input
            value={filters.search ?? ''}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            placeholder="SEARCH REF, CUSTOMER, PHONE OR DISH..."
            className="w-full bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white placeholder:text-grey-light"
          />

          <div>
            <p className="font-mono text-[10px] uppercase text-grey-light mb-1">PROGRESS</p>
            <div className="flex flex-wrap gap-1">
              {OP_STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setFilters({ ...filters, opStatus: toggleIn(filters.opStatus, s) })}
                  className={`font-mono text-[9px] uppercase border px-1.5 py-1 ${
                    filters.opStatus?.includes(s)
                      ? 'border-[#60A5FA] text-[#60A5FA]'
                      : 'border-grey-mid text-grey-light hover:text-white'
                  }`}
                >
                  {s.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="font-mono text-[10px] uppercase text-grey-light mb-1">PAYMENT</p>
            <div className="flex flex-wrap gap-1">
              {PAYMENT_STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setFilters({ ...filters, paymentStatus: toggleIn(filters.paymentStatus, s) })}
                  className={`font-mono text-[9px] uppercase border px-1.5 py-1 ${
                    filters.paymentStatus?.includes(s)
                      ? 'border-[#60A5FA] text-[#60A5FA]'
                      : 'border-grey-mid text-grey-light hover:text-white'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setFilters({ ...filters, allergensOnly: !filters.allergensOnly })}
              className={`font-mono text-[10px] uppercase border px-2 py-1 ${
                filters.allergensOnly ? 'border-danger text-danger' : 'border-grey-mid text-grey-light hover:text-white'
              }`}
            >
              ⚠ ALLERGY ORDERS ONLY
            </button>
            <Button size="sm" variant="ghost" onClick={() => { setFilters({}); setActiveSavedId(null) }}>
              CLEAR
            </Button>
            <Button size="sm" variant="ghost" onClick={saveCurrentView}>SAVE AS VIEW</Button>
          </div>
        </div>
      )}

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
        </div>
      ) : view === 'SERVICE' ? (
        <ServiceView orders={visible} onOpen={setOpenOrderId} />
      ) : view === 'KITCHEN' ? (
        <KitchenView orders={visible} categoryByMenuItem={categoryByMenuItem} />
      ) : view === 'FOH' ? (
        <FohView orders={visible} onOpen={setOpenOrderId} />
      ) : (
        <ProductionView orders={visible} />
      )}

      {openOrder && (
        <OrderDetailDrawer
          order={openOrder}
          onClose={() => setOpenOrderId(null)}
          onChanged={load}
        />
      )}

      {showNew && (
        <NewOrderModal date={date} onClose={() => setShowNew(false)} onCreated={load} />
      )}
    </div>
  )
}
