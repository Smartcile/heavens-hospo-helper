'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getActiveVenueId } from '@/lib/active-venue'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { deliveryLineVerdict, vehicleVerdict, verdictLabel, type Verdict } from '@/lib/food-safety'
import { cn } from '@/lib/utils'

interface DeliveriesClientProps {
  role: string
  sessionVenueId: string
  defaultVenueId?: string | null
}

interface CatalogItem {
  id: string
  name: string
  storageType: string
  unit: string
}

interface DeliveryItem {
  id: string
  inventoryItemId: string
  itemName: string
  storageType: string
  qty: number | null
  unit: string | null
  temp: number | null
  verdict: string
  disposition: string
  note: string | null
  alerts?: { id: string; severity: string; status: string }[]
}

interface Delivery {
  id: string
  supplierId: string | null
  supplierName: string
  deliveredAt: string
  vehicleTemp: number | null
  vehicleVerdict: string
  invoiceRef: string | null
  notes: string | null
  receivedBy: { id: string; firstName: string; lastName: string } | null
  supplier: { id: string; name: string } | null
  items: DeliveryItem[]
}

interface DeliveryData {
  deliveries: Delivery[]
  catalog: CatalogItem[]
  suppliers: { id: string; name: string }[]
}

interface LineForm {
  inventoryItemId: string
  itemName: string
  storageType: string
  unit: string
  qty: string
  temp: string
  disposition: 'ACCEPTED' | 'REJECTED'
  note: string
}

const EMPTY_LINE: LineForm = {
  inventoryItemId: '',
  itemName: '',
  storageType: 'AMBIENT',
  unit: '',
  qty: '',
  temp: '',
  disposition: 'ACCEPTED',
  note: '',
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString([], { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function DeliveriesClient({ role, sessionVenueId, defaultVenueId }: DeliveriesClientProps) {
  const venueId = getActiveVenueId(role, sessionVenueId, defaultVenueId)
  const [data, setData] = useState<DeliveryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [dateFilter, setDateFilter] = useState('')
  const [editing, setEditing] = useState<null | 'new' | Delivery>(null)
  const [supplierId, setSupplierId] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [vehicleTemp, setVehicleTemp] = useState('')
  const [invoiceRef, setInvoiceRef] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<LineForm[]>([])
  const [itemSearch, setItemSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!venueId) return
    setLoading(true)
    const params = new URLSearchParams({ venueId })
    if (dateFilter) params.set('date', dateFilter)
    const r = await fetch(`/api/admin/deliveries?${params}`)
    if (r.ok) setData(await r.json())
    setLoading(false)
  }, [venueId, dateFilter])

  useEffect(() => { load() }, [load])

  const openNew = () => {
    setEditing('new')
    setSupplierId('')
    setSupplierName('')
    setVehicleTemp('')
    setInvoiceRef('')
    setNotes('')
    setLines([EMPTY_LINE])
    setItemSearch('')
    setError('')
  }

  const openEdit = (d: Delivery) => {
    setEditing(d)
    setSupplierId(d.supplierId ?? '')
    setSupplierName(d.supplier?.name ?? d.supplierName)
    setVehicleTemp(d.vehicleTemp != null ? String(d.vehicleTemp) : '')
    setInvoiceRef(d.invoiceRef ?? '')
    setNotes(d.notes ?? '')
    setLines(d.items.map((i) => ({
      inventoryItemId: i.inventoryItemId,
      itemName: i.itemName,
      storageType: i.storageType,
      unit: i.unit ?? '',
      qty: i.qty != null ? String(i.qty) : '',
      temp: i.temp != null ? String(i.temp) : '',
      disposition: i.disposition as 'ACCEPTED' | 'REJECTED',
      note: i.note ?? '',
    })))
    setItemSearch('')
    setError('')
  }

  const addLine = (item: CatalogItem) => {
    setLines((ls) => [...ls, { ...EMPTY_LINE, inventoryItemId: item.id, itemName: item.name, storageType: item.storageType, unit: item.unit }])
    setItemSearch('')
  }

  const updateLine = (idx: number, patch: Partial<LineForm>) => {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }

  const removeLine = (idx: number) => {
    setLines((ls) => ls.filter((_, i) => i !== idx))
  }

  const handleSave = async () => {
    if (!venueId || !editing) return
    setSaving(true)
    setError('')
    const cleanLines = lines.filter((l) => l.inventoryItemId)
    if (cleanLines.length === 0) {
      setError('ADD AT LEAST ONE LINE ITEM')
      setSaving(false)
      return
    }
    const payload = {
      supplierId: supplierId || null,
      supplierName: supplierId ? undefined : (supplierName.trim() || null),
      vehicleTemp: vehicleTemp !== '' ? Number(vehicleTemp) : null,
      invoiceRef: invoiceRef.trim() || null,
      notes: notes.trim() || null,
      items: cleanLines.map((l) => ({
        inventoryItemId: l.inventoryItemId,
        itemName: l.itemName,
        storageType: l.storageType,
        qty: l.qty !== '' ? Number(l.qty) : null,
        unit: l.unit || null,
        temp: l.temp !== '' ? Number(l.temp) : null,
        disposition: l.disposition,
        note: l.note.trim() || null,
      })),
    }
    try {
      const url = editing === 'new' ? '/api/admin/deliveries' : `/api/admin/deliveries/${editing.id}`
      const r = await fetch(url, {
        method: editing === 'new' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => null)
        setError(j?.error ?? 'SAVE FAILED')
        return
      }
      setEditing(null)
      load()
    } finally {
      setSaving(false)
    }
  }

  const removeDelivery = async (d: Delivery) => {
    if (!window.confirm(`DELETE DELIVERY FROM ${d.supplierName}?`)) return
    await fetch(`/api/admin/deliveries/${d.id}`, { method: 'DELETE' })
    load()
  }

  const itemMatches = useMemo(() => {
    const q = itemSearch.trim().toUpperCase()
    if (!q) return []
    return (data?.catalog ?? []).filter((c) => c.name.toUpperCase().includes(q)).slice(0, 8)
  }, [itemSearch, data])

  const vehicleVerdictValue = useMemo(
    () => vehicleVerdict(vehicleTemp !== '' ? Number(vehicleTemp) : null, lines.map((l) => l.storageType)),
    [vehicleTemp, lines],
  )

  const liveLineVerdict = (l: LineForm) => deliveryLineVerdict(l.temp !== '' ? Number(l.temp) : null, l.storageType)

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-mono text-xl font-bold uppercase tracking-widest">DELIVERIES</h1>
          <p className="font-mono text-xs text-grey-light mt-0.5">SUPPLIER RECEIPTS — TEMPERATURE CHECKS</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="bg-grey-dark border border-grey-mid text-white font-mono text-xs px-3 py-1.5 outline-none focus:border-white"
          />
          {dateFilter && (
            <Button size="sm" variant="ghost" onClick={() => setDateFilter('')}>ALL DATES</Button>
          )}
          <Button size="sm" onClick={openNew}>+ NEW DELIVERY</Button>
        </div>
      </div>

      {loading && <p className="font-mono text-xs text-grey-light py-8 text-center">LOADING…</p>}
      {!loading && !data && <p className="font-mono text-xs text-danger py-8 text-center">SELECT A VENUE IN THE SIDEBAR</p>}

      <div className="space-y-4">
        {data?.deliveries.length === 0 && (
          <div className="border border-grey-mid p-8 text-center font-mono text-xs text-grey-light">NO DELIVERIES RECORDED</div>
        )}
        {data?.deliveries.map((d) => {
          const failed = d.items.filter((i) => i.verdict === 'FAIL')
          return (
            <div key={d.id} className="border border-grey-mid">
              <div className="flex items-center justify-between flex-wrap gap-2 px-3 py-2 bg-grey-dark/30 border-b border-grey-mid">
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="font-mono text-xs uppercase tracking-wider text-white">{d.supplierName}</h3>
                  <span className="font-mono text-[10px] text-grey-light">{fmtDate(d.deliveredAt)}</span>
                  {d.invoiceRef && <span className="font-mono text-[10px] text-grey-light">INV {d.invoiceRef}</span>}
                  {d.receivedBy && (
                    <span className="font-mono text-[10px] text-grey-light">RECEIVED BY {d.receivedBy.firstName} {d.receivedBy.lastName}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {d.vehicleTemp != null && (
                    <span className={cn('font-mono text-[10px] border px-1.5 py-0.5', d.vehicleVerdict === 'PASS' ? 'text-success border-success/50' : d.vehicleVerdict === 'FAIL' ? 'text-danger border-danger/50' : 'text-grey-light border-grey-mid')}>
                      VEHICLE {d.vehicleTemp}°C · {verdictLabel(d.vehicleVerdict as Verdict)}
                    </span>
                  )}
                  {failed.length > 0 && (
                    <a href="/admin/compliance?tab=alerts" className="font-mono text-[10px] text-danger border border-danger/50 px-1.5 py-0.5">
                      {failed.length} FAILED LINE{failed.length > 1 ? 'S' : ''}
                    </a>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => openEdit(d)}>EDIT</Button>
                  <Button size="sm" variant="danger" onClick={() => removeDelivery(d)}>DEL</Button>
                </div>
              </div>
              <table className="w-full table-fixed">
                <thead>
                  <tr className="border-b border-grey-mid font-mono text-[10px] uppercase text-grey-light tracking-wider">
                    <th className="text-left px-3 py-2 w-[34%]">ITEM</th>
                    <th className="text-left px-3 py-2 w-[12%]">QTY</th>
                    <th className="text-left px-3 py-2 w-[14%]">TEMP</th>
                    <th className="text-left px-3 py-2 w-[12%]">VERDICT</th>
                    <th className="text-left px-3 py-2 w-[16%]">DISPOSITION</th>
                    <th className="text-left px-3 py-2">NOTE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-grey-mid">
                  {d.items.map((i) => (
                    <tr key={i.id}>
                      <td className="px-3 py-2 font-mono text-xs text-white truncate">
                        {i.itemName}
                        <span className="ml-2 text-[10px] text-grey-light">{i.storageType}</span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-grey-light">{i.qty != null ? `${i.qty} ${i.unit ?? ''}` : '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs text-white">{i.temp != null ? `${i.temp}°C` : '—'}</td>
                      <td className="px-3 py-2">
                        <span className={cn('font-mono text-[10px] border px-1.5 py-0.5', i.verdict === 'PASS' ? 'text-success border-success/50' : i.verdict === 'FAIL' ? 'text-danger border-danger/50' : 'text-grey-light border-grey-mid')}>
                          {verdictLabel(i.verdict as Verdict)}
                        </span>
                      </td>
                      <td className={cn('px-3 py-2 font-mono text-[10px] uppercase', i.disposition === 'REJECTED' ? 'text-danger' : 'text-grey-light')}>
                        {i.disposition}
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px] text-grey-light truncate">{i.note ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {d.notes && (
                <div className="px-3 py-2 border-t border-grey-mid font-mono text-[10px] text-grey-light">NOTES: {d.notes}</div>
              )}
            </div>
          )
        })}
      </div>

      {/* New / edit delivery modal */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="border border-grey-mid bg-grey-dark w-full max-w-3xl max-h-[90vh] overflow-y-auto p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-mono text-lg font-bold uppercase tracking-widest">
              {editing === 'new' ? 'RECEIVE DELIVERY' : `EDIT — ${editing.supplierName}`}
            </h2>

            <div className="grid grid-cols-2 gap-3">
              <Select
                label="SUPPLIER"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                options={[{ value: '', label: 'OTHER / UNLISTED' }, ...(data?.suppliers ?? []).map((s) => ({ value: s.id, label: s.name }))]}
              />
              {!supplierId && (
                <Input label="SUPPLIER NAME" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="E.G. BIDFOOD" />
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Input label="VEHICLE TEMP (°C)" aria-label="VEHICLE TEMP (°C)" type="number" value={vehicleTemp} onChange={(e) => setVehicleTemp(e.target.value)} />
              <div className="flex flex-col gap-1">
                <span className="font-mono text-xs uppercase text-grey-light tracking-wider">VEHICLE VERDICT</span>
                <span className={cn('font-mono text-xs border px-2 py-1.5', vehicleVerdictValue === 'PASS' ? 'text-success border-success/50' : vehicleVerdictValue === 'FAIL' ? 'text-danger border-danger/50' : 'text-grey-light border-grey-mid')}>
                  {verdictLabel(vehicleVerdictValue)}
                </span>
              </div>
              <Input label="INVOICE REF" value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} />
            </div>
            <Input label="NOTES" value={notes} onChange={(e) => setNotes(e.target.value)} />

            {/* Product search */}
            <div>
              <label className="font-mono text-xs uppercase text-grey-light tracking-wider">ADD PRODUCT</label>
              <div className="relative mt-1">
                <Input placeholder="SEARCH INVENTORY…" value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} />
                {itemSearch.trim() !== '' && (
                  <div className="absolute top-full left-0 right-0 z-10 bg-grey-dark border border-grey-mid max-h-48 overflow-y-auto">
                    {itemMatches.length === 0 && <div className="px-3 py-2 font-mono text-[10px] text-grey-light">NO MATCHES</div>}
                    {itemMatches.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => addLine(c)}
                        className="w-full text-left px-3 py-2 font-mono text-[10px] text-white hover:bg-grey-mid flex items-center gap-2"
                      >
                        {c.name}
                        <span className="text-grey-light ml-auto">{c.storageType} · {c.unit}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Line items */}
            <div className="space-y-2">
              {lines.length === 0 && <p className="font-mono text-xs text-grey-light">NO LINES YET — SEARCH ABOVE</p>}
              {lines.map((l, idx) => (
                <div key={idx} className="border border-grey-mid p-2 grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-3 font-mono text-xs text-white truncate pt-1">{l.itemName}</div>
                  <div className="col-span-1">
                    <Select
                      value={l.storageType}
                      onChange={(e) => updateLine(idx, { storageType: e.target.value })}
                      options={[
                        { value: 'AMBIENT', label: 'AMB' },
                        { value: 'CHILLED', label: 'CHIL' },
                        { value: 'FROZEN', label: 'FROZ' },
                      ]}
                    />
                  </div>
                  <div className="col-span-2">
                    <Input label="QTY" type="number" value={l.qty} onChange={(e) => updateLine(idx, { qty: e.target.value })} />
                  </div>
                  <div className="col-span-2">
                    <Input label="TEMP °C" aria-label="TEMP °C" type="number" value={l.temp} onChange={(e) => updateLine(idx, { temp: e.target.value })} />
                  </div>
                  <div className="col-span-2">
                    <span className="font-mono text-xs uppercase text-grey-light tracking-wider">VERDICT</span>
                    <span className={cn('block font-mono text-xs border px-2 py-1.5 mt-1', liveLineVerdict(l) === 'FAIL' ? 'text-danger border-danger/50' : liveLineVerdict(l) === 'PASS' ? 'text-success border-success/50' : 'text-grey-light border-grey-mid')}>
                      {verdictLabel(liveLineVerdict(l))}
                    </span>
                  </div>
                  <div className="col-span-1">
                    <Select
                      label="OK"
                      value={l.disposition}
                      onChange={(e) => updateLine(idx, { disposition: e.target.value as 'ACCEPTED' | 'REJECTED' })}
                      options={[
                        { value: 'ACCEPTED', label: 'OK' },
                        { value: 'REJECTED', label: 'NO' },
                      ]}
                    />
                  </div>
                  <div className="col-span-1 flex items-end justify-end">
                    <Button size="sm" variant="danger" onClick={() => removeLine(idx)}>✕</Button>
                  </div>
                </div>
              ))}
            </div>

            {error && <p className="font-mono text-xs text-danger">{error}</p>}

            <div className="border-t border-grey-mid pt-3 flex items-center gap-2 justify-end">
              <Button variant="ghost" onClick={() => setEditing(null)}>CANCEL</Button>
              <Button onClick={handleSave} loading={saving}>
                {editing === 'new' ? 'RECORD DELIVERY' : 'SAVE CHANGES'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
