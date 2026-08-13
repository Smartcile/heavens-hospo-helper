'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { deliveryLineVerdict, vehicleVerdict, verdictLabel, type Verdict } from '@/lib/food-safety'
import { cn } from '@/lib/utils'

interface CatalogItem {
  id: string
  name: string
  storageType: string
  unit: string
}

interface WorkerDeliveryItem {
  id: string
  itemName: string
  storageType: string
  qty: number | null
  unit: string | null
  temp: number | null
  verdict: string
  disposition: string
}

interface WorkerDelivery {
  id: string
  supplierName: string
  deliveredAt: string
  vehicleTemp: number | null
  vehicleVerdict: string
  receivedBy: { id: string; firstName: string; lastName: string } | null
  items: WorkerDeliveryItem[]
}

interface WorkerDeliveryData {
  deliveries: WorkerDelivery[]
  catalog: CatalogItem[]
  suppliers: { id: string; name: string }[]
  firstName: string
}

interface LineForm {
  inventoryItemId: string
  itemName: string
  storageType: string
  unit: string
  qty: string
  temp: string
  disposition: 'ACCEPTED' | 'REJECTED'
}

const EMPTY_LINE: LineForm = {
  inventoryItemId: '',
  itemName: '',
  storageType: 'AMBIENT',
  unit: '',
  qty: '',
  temp: '',
  disposition: 'ACCEPTED',
}

function fmtTime(d: string) {
  return new Date(d).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function WorkerDeliveriesClient() {
  const [data, setData] = useState<WorkerDeliveryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [supplierId, setSupplierId] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [vehicleTemp, setVehicleTemp] = useState('')
  const [invoiceRef, setInvoiceRef] = useState('')
  const [lines, setLines] = useState<LineForm[]>([])
  const [itemSearch, setItemSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const r = await fetch('/api/worker/deliveries')
    if (r.ok) setData(await r.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

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

  const submit = async () => {
    const cleanLines = lines.filter((l) => l.inventoryItemId)
    if (cleanLines.length === 0) {
      setError('ADD AT LEAST ONE PRODUCT')
      return
    }
    setSaving(true)
    setError('')
    const r = await fetch('/api/worker/deliveries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplierId: supplierId || null,
        supplierName: supplierId ? undefined : (supplierName.trim() || null),
        vehicleTemp: vehicleTemp !== '' ? Number(vehicleTemp) : null,
        invoiceRef: invoiceRef.trim() || null,
        items: cleanLines.map((l) => ({
          inventoryItemId: l.inventoryItemId,
          itemName: l.itemName,
          storageType: l.storageType,
          qty: l.qty !== '' ? Number(l.qty) : null,
          unit: l.unit || null,
          temp: l.temp !== '' ? Number(l.temp) : null,
          disposition: l.disposition,
        })),
      }),
    })
    setSaving(false)
    if (!r.ok) {
      const j = await r.json().catch(() => null)
      setError(j?.error ?? 'SAVE FAILED')
      return
    }
    setOpen(false)
    setLines([])
    setSupplierId('')
    setSupplierName('')
    setVehicleTemp('')
    setInvoiceRef('')
    load()
  }

  const itemMatches = useMemo(() => {
    const q = itemSearch.trim().toUpperCase()
    if (!q) return []
    return (data?.catalog ?? []).filter((c) => c.name.toUpperCase().includes(q)).slice(0, 6)
  }, [itemSearch, data])

  const liveLineVerdict = (l: LineForm) => deliveryLineVerdict(l.temp !== '' ? Number(l.temp) : null, l.storageType)
  const vehicleVerdictValue = vehicleVerdict(vehicleTemp !== '' ? Number(vehicleTemp) : null, lines.map((l) => l.storageType))

  return (
    <div className="min-h-screen bg-black">
      <div className="px-4 pt-6 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-mono text-xl font-bold uppercase tracking-widest">DELIVERIES</h1>
            <p className="font-mono text-xs text-grey-light mt-0.5">RECEIVE STOCK · CHECK TEMPS</p>
          </div>
          <Button size="sm" onClick={() => { setOpen(true); setError(''); setLines([EMPTY_LINE]); setItemSearch('') }}>
            + RECEIVE
          </Button>
        </div>
      </div>

      <div className="px-4 py-4 space-y-3">
        {loading && <p className="font-mono text-xs text-grey-light text-center py-8">LOADING…</p>}
        {!loading && (data?.deliveries.length ?? 0) === 0 && (
          <div className="border border-grey-mid p-8 text-center font-mono text-xs text-grey-light">
            NO DELIVERIES YET — TAP + RECEIVE
          </div>
        )}
        {data?.deliveries.map((d) => {
          const failed = d.items.filter((i) => i.verdict === 'FAIL')
          return (
            <div key={d.id} className="border border-grey-mid">
              <div className="px-3 py-2 bg-grey-dark/30 border-b border-grey-mid flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-xs text-white uppercase truncate">{d.supplierName}</div>
                  <div className="font-mono text-[10px] text-grey-light">{fmtTime(d.deliveredAt)}</div>
                </div>
                {failed.length > 0 ? (
                  <span className="font-mono text-[10px] text-danger border border-danger/50 px-1.5 py-0.5 shrink-0">
                    {failed.length} FAILED
                  </span>
                ) : (
                  <span className="font-mono text-[10px] text-success shrink-0">ALL PASS</span>
                )}
              </div>
              <div className="divide-y divide-grey-mid">
                {d.items.map((i) => (
                  <div key={i.id} className="px-3 py-2 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-xs text-white truncate">{i.itemName}</div>
                      <div className="font-mono text-[10px] text-grey-light">
                        {i.qty != null ? `${i.qty} ${i.unit ?? ''} · ` : ''}{i.temp != null ? `${i.temp}°C` : 'NO TEMP'}
                      </div>
                    </div>
                    <span className={cn('font-mono text-[10px] border px-1.5 py-0.5 shrink-0', i.verdict === 'PASS' ? 'text-success border-success/50' : i.verdict === 'FAIL' ? 'text-danger border-danger/50' : 'text-grey-light border-grey-mid')}>
                      {verdictLabel(i.verdict as Verdict)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Receive modal */}
      {open && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center justify-between px-4 py-4 border-b border-grey-mid">
            <button onClick={() => setOpen(false)} className="font-mono text-xs uppercase text-grey-light hover:text-white">
              ← BACK
            </button>
            <span className="font-mono text-xs text-grey-light">RECEIVE DELIVERY</span>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            <Select
              label="SUPPLIER"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              options={[{ value: '', label: 'OTHER / UNLISTED' }, ...(data?.suppliers ?? []).map((s) => ({ value: s.id, label: s.name }))]}
            />
            {!supplierId && (
              <Input label="SUPPLIER NAME" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="E.G. BIDFOOD" />
            )}
            <div className="grid grid-cols-2 gap-3">
              <Input label="VEHICLE TEMP (°C)" type="number" inputMode="decimal" value={vehicleTemp} onChange={(e) => setVehicleTemp(e.target.value)} />
              <div className="flex flex-col gap-1">
                <span className="font-mono text-xs uppercase text-grey-light tracking-wider">VEHICLE</span>
                <span className={cn('font-mono text-xs border px-2 py-1.5 mt-0.5', vehicleVerdictValue === 'PASS' ? 'text-success border-success/50' : vehicleVerdictValue === 'FAIL' ? 'text-danger border-danger/50' : 'text-grey-light border-grey-mid')}>
                  {verdictLabel(vehicleVerdictValue)}
                </span>
              </div>
            </div>
            <Input label="INVOICE REF" value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} />

            <div>
              <label className="font-mono text-xs uppercase text-grey-light tracking-wider">ADD PRODUCT</label>
              <div className="relative mt-1">
                <Input placeholder="SEARCH PRODUCTS…" value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} />
                {itemSearch.trim() !== '' && (
                  <div className="absolute top-full left-0 right-0 z-10 bg-grey-dark border border-grey-mid max-h-48 overflow-y-auto">
                    {itemMatches.length === 0 && <div className="px-3 py-2 font-mono text-[10px] text-grey-light">NO MATCHES</div>}
                    {itemMatches.map((c) => (
                      <button key={c.id} onClick={() => addLine(c)} className="w-full text-left px-3 py-2 font-mono text-[10px] text-white hover:bg-grey-mid flex items-center gap-2">
                        {c.name}
                        <span className="text-grey-light ml-auto">{c.storageType} · {c.unit}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              {lines.length === 0 && <p className="font-mono text-xs text-grey-light">NO PRODUCTS YET</p>}
              {lines.map((l, idx) => (
                <div key={idx} className="border border-grey-mid p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-white truncate flex-1">{l.itemName}</span>
                    <span className={cn('font-mono text-[10px] border px-1.5 py-0.5 shrink-0', liveLineVerdict(l) === 'PASS' ? 'text-success border-success/50' : liveLineVerdict(l) === 'FAIL' ? 'text-danger border-danger/50' : 'text-grey-light border-grey-mid')}>
                      {verdictLabel(liveLineVerdict(l))}
                    </span>
                    <button onClick={() => removeLine(idx)} className="font-mono text-xs text-danger shrink-0">✕</button>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <Input type="number" inputMode="decimal" placeholder="QTY" value={l.qty} onChange={(e) => updateLine(idx, { qty: e.target.value })} />
                    <Input type="number" inputMode="decimal" placeholder="TEMP °C" value={l.temp} onChange={(e) => updateLine(idx, { temp: e.target.value })} />
                    <Select
                      value={l.storageType}
                      onChange={(e) => updateLine(idx, { storageType: e.target.value })}
                      options={[
                        { value: 'AMBIENT', label: 'AMBIENT' },
                        { value: 'CHILLED', label: 'CHILLED' },
                        { value: 'FROZEN', label: 'FROZEN' },
                      ]}
                    />
                    <Select
                      value={l.disposition}
                      onChange={(e) => updateLine(idx, { disposition: e.target.value as 'ACCEPTED' | 'REJECTED' })}
                      options={[
                        { value: 'ACCEPTED', label: 'ACCEPT' },
                        { value: 'REJECTED', label: 'REJECT' },
                      ]}
                    />
                  </div>
                </div>
              ))}
            </div>

            {error && <p className="font-mono text-xs text-danger">{error}</p>}
          </div>

          <div className="px-4 pb-8 pt-4 border-t border-grey-mid">
            <button
              onClick={submit}
              disabled={saving}
              className="w-full h-14 bg-success text-black font-mono font-bold text-sm uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'SAVING_' : 'RECORD DELIVERY'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
