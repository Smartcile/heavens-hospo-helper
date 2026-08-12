'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { pushToast } from '@/components/ui/Toast'
import { validateOrderAgainstMenu, describePaxRange } from '@/lib/menu-rules'

interface MenuItemRef { id: string; name: string; price: number; dietaryInfo: string | null }
interface MenuLink { menuItemId: string; minQty: number | null; maxQty: number | null; menuItem: MenuItemRef }
interface Menu {
  id: string; name: string; minPax: number | null; maxPax: number | null
  isActive: boolean; items: MenuLink[]
}

interface DraftLine {
  menuItemId: string
  name: string
  qty: string
  unitPrice: string
  allergenNote: string
}

const FULFILLMENT_TYPES = ['DINE_IN', 'PICKUP', 'DELIVERY']

export function NewOrderModal({
  date, venueId, onClose, onCreated,
}: { date: string; venueId?: string; onClose: () => void; onCreated: () => void }) {
  const [menus, setMenus] = useState<Menu[]>([])
  const [allItems, setAllItems] = useState<MenuItemRef[]>([])
  const [saving, setSaving] = useState(false)

  const [menuId, setMenuId] = useState('')
  const [serviceDate, setServiceDate] = useState(date)
  const [serviceTime, setServiceTime] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [partySize, setPartySize] = useState('')
  const [fulfillmentType, setFulfillmentType] = useState('DINE_IN')
  const [notes, setNotes] = useState('')
  const [allergenNote, setAllergenNote] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([])
  const [itemSearch, setItemSearch] = useState('')

  useEffect(() => {
    const venueParam = venueId ? `?venueId=${venueId}` : ''
    Promise.all([fetch(`/api/admin/menus${venueParam}`), fetch(`/api/admin/menu-items${venueParam}`)]).then(async ([m, i]) => {
      if (m.ok) setMenus(await m.json())
      if (i.ok) setAllItems(await i.json())
    })
  }, [venueId])

  const selectedMenu = menus.find((m) => m.id === menuId) ?? null

  // When a menu is chosen, only its items can be ordered.
  const pickable: MenuItemRef[] = selectedMenu
    ? selectedMenu.items.map((l) => l.menuItem)
    : allItems

  const violations = useMemo(() => {
    if (!selectedMenu) return []
    return validateOrderAgainstMenu(
      { name: selectedMenu.name, minPax: selectedMenu.minPax, maxPax: selectedMenu.maxPax },
      selectedMenu.items.map((l) => ({
        menuItemId: l.menuItemId,
        name: l.menuItem.name,
        minQty: l.minQty,
        maxQty: l.maxQty,
      })),
      lines.map((l) => ({ menuItemId: l.menuItemId, qty: parseInt(l.qty, 10) || 0 })),
      partySize === '' ? null : parseInt(partySize, 10),
    )
  }, [selectedMenu, lines, partySize])

  function addLine(item: MenuItemRef) {
    if (lines.some((l) => l.menuItemId === item.id)) return
    setLines([
      ...lines,
      { menuItemId: item.id, name: item.name, qty: '1', unitPrice: item.price.toString(), allergenNote: '' },
    ])
    setItemSearch('')
  }

  function updateLine(id: string, patch: Partial<DraftLine>) {
    setLines(lines.map((l) => (l.menuItemId === id ? { ...l, ...patch } : l)))
  }

  const total = lines.reduce(
    (sum, l) => sum + (parseFloat(l.unitPrice) || 0) * (parseInt(l.qty, 10) || 0),
    0,
  )

  async function save() {
    if (!customerName.trim()) { pushToast('CUSTOMER NAME IS REQUIRED', 'error'); return }
    if (violations.length > 0) { pushToast('FIX THE MENU RULE BREACHES FIRST', 'error'); return }

    setSaving(true)
    const res = await fetch('/api/admin/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serviceDate,
        serviceTime: serviceTime || null,
        customerName,
        customerPhone: customerPhone || null,
        customerEmail: customerEmail || null,
        partySize: partySize === '' ? null : parseInt(partySize, 10),
        fulfillmentType,
        menuId: menuId || null,
        notes: notes || null,
        allergenNote: allergenNote || null,
        ...(venueId ? { venueId } : {}),
        items: lines.map((l) => ({
          menuItemId: l.menuItemId,
          qty: parseInt(l.qty, 10) || 1,
          unitPrice: parseFloat(l.unitPrice) || 0,
          allergenNote: l.allergenNote || null,
        })),
      }),
    })
    setSaving(false)

    if (res.ok) { pushToast('ORDER CREATED', 'success'); onCreated(); onClose() }
    else {
      const err = await res.json().catch(() => ({}))
      const detail = err.violations?.[0]?.message
      pushToast((detail ?? err.error ?? 'CREATE FAILED').toUpperCase(), 'error')
    }
  }

  const available = pickable
    .filter((i) => !lines.some((l) => l.menuItemId === i.id))
    .filter((i) => !itemSearch || i.name.toLowerCase().includes(itemSearch.toLowerCase()))
    .slice(0, 8)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-black border border-grey-mid my-8">
        <div className="px-4 py-3 border-b border-grey-mid flex items-center justify-between">
          <h2 className="font-mono text-sm uppercase tracking-widest text-white">NEW ORDER</h2>
          <button onClick={onClose} className="font-mono text-sm text-grey-light hover:text-white px-2">✕</button>
        </div>

        <div className="p-4 space-y-4">
          <p className="font-mono text-[9px] text-grey-light uppercase">
            MANUAL ORDERS STAY LOCAL — THEY ARE NEVER PUSHED TO WOOCOMMERCE, AND TAKE NO PAYMENT.
          </p>

          {/* Menu */}
          <div>
            <label className="font-mono text-xs uppercase text-grey-light block mb-1">MENU</label>
            <select
              value={menuId}
              onChange={(e) => { setMenuId(e.target.value); setLines([]) }}
              className="w-full bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white uppercase"
            >
              <option value="">— NO MENU (ANY ITEM) —</option>
              {menus.filter((m) => m.isActive).map((m) => {
                const range = describePaxRange(m)
                return (
                  <option key={m.id} value={m.id}>{m.name}{range ? ` (${range})` : ''}</option>
                )
              })}
            </select>
          </div>

          {/* Service */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Input label="DATE" type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} />
            <Input label="TIME" type="time" value={serviceTime} onChange={(e) => setServiceTime(e.target.value)} />
            <Input label="PARTY SIZE" type="number" value={partySize} onChange={(e) => setPartySize(e.target.value)} placeholder="—" />
            <div>
              <label className="font-mono text-xs uppercase text-grey-light block mb-1">TYPE</label>
              <select
                value={fulfillmentType}
                onChange={(e) => setFulfillmentType(e.target.value)}
                className="w-full bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white uppercase"
              >
                {FULFILLMENT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
          </div>

          {/* Contact */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input label="CUSTOMER NAME" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            <Input label="PHONE" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="021..." />
            <Input label="EMAIL" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="OPTIONAL" />
          </div>
          <p className="font-mono text-[9px] text-grey-light uppercase">
            MATCHED AGAINST EXISTING CUSTOMERS BY EMAIL THEN PHONE — NO DUPLICATE RECORD IS CREATED.
          </p>

          <Input label="ALLERGY REQUIREMENT" value={allergenNote} onChange={(e) => setAllergenNote(e.target.value)} placeholder="E.G. SEVERE NUT ALLERGY" />

          {/* Items */}
          <div className="border-t border-grey-mid pt-3 space-y-2">
            <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">ITEMS ({lines.length})</h3>

            {lines.length > 0 && (
              <div className="space-y-1">
                <div className="grid grid-cols-12 gap-2 font-mono text-[9px] uppercase text-grey-light">
                  <div className="col-span-5">ITEM</div>
                  <div className="col-span-2">QTY</div>
                  <div className="col-span-2">PRICE</div>
                  <div className="col-span-2">TOTAL</div>
                  <div className="col-span-1"></div>
                </div>
                {lines.map((l) => (
                  <div key={l.menuItemId} className="grid grid-cols-12 gap-2 items-center">
                    <span className="col-span-5 font-mono text-xs text-white uppercase truncate">{l.name}</span>
                    <input
                      type="number" min="1" value={l.qty}
                      onChange={(e) => updateLine(l.menuItemId, { qty: e.target.value })}
                      className="col-span-2 bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1 outline-none focus:border-white text-right"
                    />
                    <input
                      type="number" step="0.01" value={l.unitPrice}
                      onChange={(e) => updateLine(l.menuItemId, { unitPrice: e.target.value })}
                      className="col-span-2 bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1 outline-none focus:border-white text-right"
                    />
                    <span className="col-span-2 font-mono text-xs text-grey-light text-right">
                      ${((parseFloat(l.unitPrice) || 0) * (parseInt(l.qty, 10) || 0)).toFixed(2)}
                    </span>
                    <button
                      onClick={() => setLines(lines.filter((x) => x.menuItemId !== l.menuItemId))}
                      className="col-span-1 font-mono text-xs text-danger border border-danger hover:bg-danger hover:text-black"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <div className="flex justify-end font-mono text-sm text-white pt-1 border-t border-grey-mid">
                  TOTAL: ${total.toFixed(2)}
                </div>
              </div>
            )}

            <Input label="ADD ITEM" value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} placeholder="SEARCH..." />
            {itemSearch && (
              <div className="border border-grey-mid divide-y divide-grey-mid max-h-40 overflow-y-auto">
                {available.length === 0 ? (
                  <p className="font-mono text-[10px] text-grey-light p-2 uppercase">NO MATCHES</p>
                ) : (
                  available.map((i) => (
                    <button
                      key={i.id}
                      onClick={() => addLine(i)}
                      className="w-full text-left px-2 py-1.5 hover:bg-grey-mid/20 font-mono text-xs text-white uppercase flex justify-between gap-2"
                    >
                      <span className="truncate">{i.name}</span>
                      <span className="text-grey-light shrink-0">${i.price.toFixed(2)}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <Input label="NOTES" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="OPTIONAL" />

          {/* Live rule feedback */}
          {violations.length > 0 && (
            <div className="border border-danger p-3 space-y-1">
              <h3 className="font-mono text-xs uppercase text-danger tracking-wider">MENU RULES</h3>
              {violations.map((v, i) => (
                <p key={i} className="font-mono text-[10px] text-danger uppercase">{v.message}</p>
              ))}
            </div>
          )}

          <div className="border-t border-grey-mid pt-3 flex items-center gap-2">
            <Button size="sm" onClick={save} loading={saving} disabled={violations.length > 0}>
              CREATE ORDER
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>CANCEL</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
