'use client'

import {
  aggregateDishTotals,
  aggregateCategoryTotals,
  collectAllergenAlerts,
  groupByTable,
  groupByTimeSlot,
  parseAllergens,
  spansMultipleDays,
  type OrderView,
} from '@/lib/order-views'

export const OP_STATUS_STYLES: Record<string, string> = {
  NEW: 'text-grey-light border-grey-mid',
  CONFIRMED: 'text-accent border-accent',
  IN_PREP: 'text-[#FACC15] border-[#FACC15]',
  READY: 'text-success border-success',
  ARRIVED: 'text-success border-success',
  OUT_FOR_DELIVERY: 'text-accent border-accent',
  HANDED_OVER: 'text-success border-success',
  FINALISED: 'text-grey-light border-grey-mid',
  CANCELLED: 'text-danger border-danger',
}

const PAYMENT_STYLES: Record<string, string> = {
  PAID: 'text-success border-success',
  PARTIAL: 'text-[#FACC15] border-[#FACC15]',
  UNPAID: 'text-danger border-danger',
  REFUNDED: 'text-grey-light border-grey-mid',
}

function Tag({ label, className }: { label: string; className: string }) {
  return <span className={`font-mono text-[9px] uppercase border px-1 py-0.5 ${className}`}>{label}</span>
}

/** Compact order row shared by the SERVICE and FOH views. */
function OrderCard({
  order, onOpen, showDate = false,
}: { order: OrderView; onOpen: (id: string) => void; showDate?: boolean }) {
  const hasAllergy = !!order.allergenNote?.trim() || order.items.some((i) => !!i.allergenNote?.trim())

  return (
    <button
      onClick={() => onOpen(order.id)}
      className="w-full text-left border border-grey-mid p-2.5 hover:bg-grey-mid/10 space-y-1.5"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-xs text-white font-bold shrink-0">{order.ref}</span>
          <span className="font-mono text-xs text-grey-light uppercase truncate">
            {order.customerName ?? '—'}
          </span>
          {order.source !== 'WOO' && <Tag label={order.source} className="text-accent border-accent" />}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {hasAllergy && <Tag label="⚠ ALLERGY" className="text-danger border-danger" />}
          <Tag label={order.opStatus.replace(/_/g, ' ')} className={OP_STATUS_STYLES[order.opStatus] ?? ''} />
          <Tag label={order.paymentStatus} className={PAYMENT_STYLES[order.paymentStatus] ?? ''} />
        </div>
      </div>

      <div className="flex items-center gap-3 font-mono text-[10px] text-grey-light flex-wrap">
        {showDate && order.serviceDate && <span className="text-accent shrink-0">{order.serviceDate}</span>}
        {order.serviceTime && <span className="text-white">{order.serviceTime}</span>}
        <span>{order.partySize != null ? `${order.partySize} PAX` : '— PAX'}</span>
        <span>{order.fulfillmentType.replace(/_/g, ' ')}</span>
        {order.tables.length > 0 && <span className="text-success">T{order.tables.join(', ')}</span>}
        {order.bookingId && <span className="text-accent">◆ BOOKED</span>}
        {order.menuName && <span className="text-accent">{order.menuName}</span>}
        <span className="ml-auto text-white">${(order.totalAmount ?? 0).toFixed(2)}</span>
      </div>

      {order.items.length > 0 && (
        <p className="font-mono text-[10px] text-grey-light truncate">
          {order.items.map((i) => `${i.qty}× ${i.name}`).join('  ·  ')}
        </p>
      )}
    </button>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="border border-grey-mid p-8 text-center">
      <p className="font-mono text-xs text-grey-light uppercase">{message}</p>
    </div>
  )
}

// ── SERVICE ────────────────────────────────────────────────────────────

export function ServiceView({
  orders, onOpen, slotMinutes = 30,
}: { orders: OrderView[]; onOpen: (id: string) => void; slotMinutes?: number }) {
  if (orders.length === 0) return <EmptyState message="NO ORDERS FOR THIS DATE" />

  const slots = groupByTimeSlot(orders, slotMinutes)
  const multiDay = spansMultipleDays(orders)

  return (
    <div className="space-y-3">
      {slots.map((slot) => (
        <div key={slot.slot} className="border border-grey-mid">
          <div className="px-3 py-1.5 bg-grey-dark/30 border-b border-grey-mid flex items-center justify-between">
            <span className="font-mono text-xs text-white uppercase tracking-wider">{slot.slot}</span>
            <span className="font-mono text-[10px] text-grey-light">
              {slot.orders.length} ORDER{slot.orders.length === 1 ? '' : 'S'} · {slot.covers} PAX
            </span>
          </div>
          <div className="p-2 space-y-2">
            {slot.orders.map((o) => (
              <OrderCard key={o.id} order={o} onOpen={onOpen} showDate={multiDay} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── KITCHEN ────────────────────────────────────────────────────────────

export function KitchenView({
  orders, categoryByMenuItem,
}: { orders: OrderView[]; categoryByMenuItem: Map<string, string[]> }) {
  if (orders.length === 0) return <EmptyState message="NOTHING TO PREP FOR THIS DATE" />

  const dishes = aggregateDishTotals(orders)
  const categories = aggregateCategoryTotals(orders, categoryByMenuItem)
  const alerts = collectAllergenAlerts(orders)
  const multiDay = spansMultipleDays(orders)

  return (
    <div className="space-y-4">
      {/* Allergy alerts lead — these are the ones that can hurt someone. */}
      {alerts.length > 0 && (
        <div className="border border-danger">
          <div className="px-3 py-1.5 border-b border-danger">
            <span className="font-mono text-xs text-danger uppercase tracking-wider">
              ⚠ ALLERGY REQUIREMENTS ({alerts.length})
            </span>
          </div>
          <div className="divide-y divide-grey-mid">
            {alerts.map((a) => (
              <div key={a.orderId} className="px-3 py-2 flex items-start gap-3 flex-wrap">
                <span className="font-mono text-xs text-white font-bold">{a.ref}</span>
                {multiDay && a.serviceDate && (
                  <span className="font-mono text-[10px] text-accent">{a.serviceDate}</span>
                )}
                {a.serviceTime && <span className="font-mono text-[10px] text-grey-light">{a.serviceTime}</span>}
                {a.tables.length > 0 && (
                  <span className="font-mono text-[10px] text-success">T{a.tables.join(', ')}</span>
                )}
                <span className="font-mono text-[10px] text-grey-light uppercase">{a.customerName ?? '—'}</span>
                <span className="font-mono text-xs text-danger uppercase w-full">{a.note}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Dish totals — the actual cook list */}
        <div className="lg:col-span-2 border border-grey-mid">
          <div className="px-3 py-1.5 bg-grey-dark/30 border-b border-grey-mid">
            <span className="font-mono text-xs text-grey-light uppercase tracking-wider">DISH TOTALS</span>
          </div>
          <div className="divide-y divide-grey-mid">
            {dishes.map((d) => (
              <div key={d.name} className="px-3 py-2 flex items-center gap-3">
                <span className="font-mono text-lg text-white w-12 shrink-0 text-right">{d.qty}</span>
                <span className="font-mono text-xs text-white uppercase flex-1 truncate">{d.name}</span>
                <div className="flex gap-1 flex-wrap justify-end">
                  {d.allergens.map((a) => (
                    <Tag key={a} label={a} className="text-[#c4a530] border-[#c4a530]" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Category rollup */}
        <div className="border border-grey-mid p-3 space-y-3">
          <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">BY CATEGORY</h3>
          {categories.length === 0 ? (
            <p className="font-mono text-[10px] text-grey-light uppercase">NO RECIPE DATA</p>
          ) : (
            categories.map((c) => (
              <div key={c.category}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-[11px] text-white uppercase">{c.category}</span>
                  <span className="font-mono text-sm text-white">{c.total}</span>
                </div>
                <div className="space-y-0.5">
                  {c.items.map((i) => (
                    <div key={i.name} className="flex items-center justify-between text-[10px] font-mono text-grey-light">
                      <span className="uppercase truncate">{i.name}</span>
                      <span className="shrink-0 ml-2">×{i.qty}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ── FOH ────────────────────────────────────────────────────────────────

export function FohView({ orders, onOpen }: { orders: OrderView[]; onOpen: (id: string) => void }) {
  if (orders.length === 0) return <EmptyState message="NO ORDERS FOR THIS DATE" />

  const groups = groupByTable(orders)
  const multiDay = spansMultipleDays(orders)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {groups.map((g) => (
        <div key={g.table} className="border border-grey-mid">
          <div className="px-3 py-1.5 bg-grey-dark/30 border-b border-grey-mid flex items-center justify-between">
            <span className="font-mono text-xs text-white uppercase tracking-wider">
              {g.table === 'UNASSIGNED' ? 'UNASSIGNED' : `TABLE ${g.table}`}
            </span>
            <span className="font-mono text-[10px] text-grey-light">
              {g.orders.length} ORDER{g.orders.length === 1 ? '' : 'S'} · {g.covers} PAX
            </span>
          </div>
          <div className="p-2 space-y-2">
            {g.orders.map((o) => (
              <OrderCard key={`${g.table}-${o.id}`} order={o} onOpen={onOpen} showDate={multiDay} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── PRODUCTION ─────────────────────────────────────────────────────────

export function ProductionView({ orders }: { orders: OrderView[] }) {
  if (orders.length === 0) return <EmptyState message="NOTHING TO PICK FOR THIS DATE" />

  const dishes = aggregateDishTotals(orders)

  return (
    <div className="border border-grey-mid">
      <div className="grid grid-cols-12 gap-2 px-3 py-2 border-b border-grey-mid bg-grey-dark/30 font-mono text-[10px] uppercase text-grey-light">
        <div className="col-span-2">PICK</div>
        <div className="col-span-6">ITEM</div>
        <div className="col-span-4">ALLERGENS</div>
      </div>
      <div className="divide-y divide-grey-mid">
        {dishes.map((d) => (
          <div key={d.name} className="grid grid-cols-12 gap-2 px-3 py-2 items-center">
            <div className="col-span-2 flex items-center gap-2">
              <span className="font-mono text-[10px] text-grey-light border border-grey-mid w-4 h-4 inline-block" />
              <span className="font-mono text-sm text-white">{d.qty}</span>
            </div>
            <div className="col-span-6 font-mono text-xs text-white uppercase truncate">{d.name}</div>
            <div className="col-span-4 flex gap-1 flex-wrap">
              {d.allergens.length === 0 ? (
                <span className="font-mono text-[9px] text-grey-light">—</span>
              ) : (
                d.allergens.map((a) => <Tag key={a} label={a} className="text-[#c4a530] border-[#c4a530]" />)
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── ALL (debug) ────────────────────────────────────────────────────────

/*
 * Every synced order, newest first — dated, undated and unbooked included.
 * The date-driven views can't show orders with no service date; this is the
 * surface for checking what actually came through (usually the field-mapping
 * troubleshooting loop).
 */
export function AllOrdersView({ orders, onOpen }: { orders: OrderView[]; onOpen: (id: string) => void }) {
  if (orders.length === 0) return <EmptyState message="NO SYNCED ORDERS YET — PULL ORDERS ON /ADMIN/SYNC" />

  return (
    <div className="border border-grey-mid divide-y divide-grey-mid">
      {orders.map((o) => {
        const hasAllergy = !!o.allergenNote?.trim() || o.items.some((i) => !!i.allergenNote?.trim())
        return (
          <button
            key={o.id}
            onClick={() => onOpen(o.id)}
            className="w-full text-left px-3 py-2 hover:bg-grey-mid/10 space-y-1"
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                {o.serviceDate ? (
                  <span className="font-mono text-[10px] text-grey-light shrink-0">{o.serviceDate}</span>
                ) : (
                  <Tag label="NO DATE" className="text-[#FACC15] border-[#FACC15]" />
                )}
                {o.serviceTime && (
                  <span className="font-mono text-[10px] text-white shrink-0">{o.serviceTime}</span>
                )}
                <span className="font-mono text-xs text-white font-bold shrink-0">{o.ref}</span>
                <span className="font-mono text-xs text-grey-light uppercase truncate">
                  {o.customerName ?? '—'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {hasAllergy && <Tag label="⚠ ALLERGY" className="text-danger border-danger" />}
                <Tag label={o.opStatus.replace(/_/g, ' ')} className={OP_STATUS_STYLES[o.opStatus] ?? ''} />
                <Tag label={o.paymentStatus} className={PAYMENT_STYLES[o.paymentStatus] ?? ''} />
              </div>
            </div>
            <div className="flex items-center gap-3 font-mono text-[10px] text-grey-light flex-wrap">
              <span>{o.partySize != null ? `${o.partySize} PAX` : '— PAX'}</span>
              {o.bookingId ? (
                <span className="text-accent">◆ BOOKED</span>
              ) : (
                <span className="text-[#FACC15]">NO BOOKING</span>
              )}
              {o.source !== 'WOO' && <span>{o.source}</span>}
              {o.tables.length > 0 && <span className="text-success">T{o.tables.join(', ')}</span>}
              {o.syncedAt && (
                <span className="text-grey-light">
                  SYNCED {o.syncedAt.slice(0, 19).replace('T', ' ')} UTC
                </span>
              )}
              <span className="ml-auto text-white">${(o.totalAmount ?? 0).toFixed(2)}</span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

export { parseAllergens }
