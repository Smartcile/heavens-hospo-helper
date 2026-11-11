'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { getActiveVenueId } from '@/lib/active-venue'
import { GST_RATE } from '@/lib/purchasing-api'
import { PriceMovementsPanel } from '@/components/admin/PriceMovementsPanel'

interface SupplierOption {
  id: string
  name: string
}

interface ItemOption {
  id: string
  name: string
  unit: string
  costPrice: number | null
}

interface OrderRow {
  id: string
  number: string
  status: string
  expectedAt: string | null
  total: number
  supplier: { id: string; name: string }
  lineCount: number
}

interface OrderLine {
  id: string
  description: string
  qty: number
  unitPrice: number
  lineTotal: number
  receivedQty: number
  inventoryItemId: string | null
}

interface OrderDetail extends OrderRow {
  subtotal: number
  gst: number
  notes: string | null
  orderedAt: string | null
  lines: OrderLine[]
  deliveries: { id: string; deliveredAt: string }[]
  invoices: { id: string; number: string; status: string }[]
}

interface DraftLine {
  key: string
  inventoryItemId: string
  description: string
  qty: string
  unitPrice: string
}

interface ReceiptDraft {
  lineId: string
  description: string
  qty: string
  unitPrice: string
}

interface InlineMovement {
  inventoryItemId: string
  oldPrice: number | null
  newPrice: number
  delta: number
  percent: number | null
}

const STATUS_FILTERS = ['ALL', 'DRAFT', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED']

function statusClass(status: string): string {
  switch (status) {
    case 'RECEIVED':
      return 'text-success'
    case 'PARTIALLY_RECEIVED':
      return 'text-warning'
    case 'CANCELLED':
      return 'text-danger'
    default:
      return 'text-grey-light'
  }
}

function money(value: number): string {
  return `$${(Number(value) || 0).toFixed(2)}`
}

function newDraftLine(): DraftLine {
  return { key: crypto.randomUUID(), inventoryItemId: '', description: '', qty: '1', unitPrice: '' }
}

export function PurchaseOrdersClient({
  role,
  sessionVenueId,
  defaultVenueId,
}: {
  role: string
  sessionVenueId: string
  defaultVenueId?: string | null
}) {
  const venueId = getActiveVenueId(role, sessionVenueId, defaultVenueId)
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('ALL')
  const [search, setSearch] = useState('')
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  const [items, setItems] = useState<ItemOption[]>([])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<OrderDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [draftSupplierId, setDraftSupplierId] = useState('')
  const [draftNumber, setDraftNumber] = useState('')
  const [draftExpected, setDraftExpected] = useState('')
  const [draftNotes, setDraftNotes] = useState('')
  const [draftLines, setDraftLines] = useState<DraftLine[]>([newDraftLine()])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const [receiveOpen, setReceiveOpen] = useState(false)
  const [receiptLines, setReceiptLines] = useState<ReceiptDraft[]>([])
  const [vehicleTemp, setVehicleTemp] = useState('')
  const [receiving, setReceiving] = useState(false)
  const [receiveError, setReceiveError] = useState('')
  const [movements, setMovements] = useState<InlineMovement[]>([])
  const [priceRefreshKey, setPriceRefreshKey] = useState(0)

  const loadOrders = useCallback(async () => {
    if (!venueId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ venueId })
      if (status !== 'ALL') params.set('status', status)
      if (search.trim()) params.set('search', search.trim())
      const res = await fetch(`/api/admin/purchase-orders?${params.toString()}`)
      const body = await res.json().catch(() => [])
      if (!res.ok) {
        setOrders([])
        setError(String((body as { error?: string }).error ?? 'COULD NOT LOAD PURCHASE ORDERS'))
        return
      }
      setOrders(Array.isArray(body) ? body : [])
    } catch {
      setOrders([])
      setError('COULD NOT REACH THE SERVER')
    } finally {
      setLoading(false)
    }
  }, [venueId, status, search])

  const loadOptions = useCallback(async () => {
    if (!venueId) return
    const params = new URLSearchParams({ venueId })
    const [supplierRes, inventoryRes] = await Promise.all([
      fetch(`/api/admin/suppliers?${params.toString()}`),
      fetch(`/api/admin/inventory?${params.toString()}`),
    ])
    if (supplierRes.ok) {
      const body = await supplierRes.json().catch(() => [])
      if (Array.isArray(body)) setSuppliers(body)
    }
    if (inventoryRes.ok) {
      const body = await inventoryRes.json().catch(() => [])
      if (Array.isArray(body)) {
        setItems(
          body.map((item: { id: string; name: string; unit?: string; costPrice?: number | null }) => ({
            id: item.id,
            name: item.name,
            unit: item.unit ?? 'EA',
            costPrice: item.costPrice ?? null,
          })),
        )
      }
    }
  }, [venueId])

  useEffect(() => {
    void loadOrders()
  }, [loadOrders])

  useEffect(() => {
    void loadOptions()
  }, [loadOptions])

  const loadDetail = useCallback(
    async (id: string) => {
      if (!venueId) return
      setDetailLoading(true)
      try {
        const params = new URLSearchParams({ venueId })
        const res = await fetch(`/api/admin/purchase-orders/${id}?${params.toString()}`)
        const body = await res.json().catch(() => ({}))
        if (res.ok) setDetail(body as OrderDetail)
        else setDetail(null)
      } catch {
        setDetail(null)
      } finally {
        setDetailLoading(false)
      }
    },
    [venueId],
  )

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId)
    else setDetail(null)
  }, [selectedId, loadDetail])

  const visible = useMemo(() => orders, [orders])

  const draftTotals = useMemo(() => {
    const subtotal = draftLines.reduce(
      (sum, line) => sum + (Number(line.qty) || 0) * (Number(line.unitPrice) || 0),
      0,
    )
    return { subtotal, gst: subtotal * GST_RATE, total: subtotal * (1 + GST_RATE) }
  }, [draftLines])

  function openCreate() {
    setDraftSupplierId('')
    setDraftNumber('')
    setDraftExpected('')
    setDraftNotes('')
    setDraftLines([newDraftLine()])
    setSaveError('')
    setCreateOpen(true)
  }

  function patchDraftLine(key: string, patch: Partial<DraftLine>) {
    setDraftLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  function pickItem(key: string, itemId: string) {
    const item = items.find((candidate) => candidate.id === itemId)
    const current = draftLines.find((line) => line.key === key)
    patchDraftLine(key, {
      inventoryItemId: itemId,
      description: item ? item.name : current?.description ?? '',
      unitPrice:
        item && item.costPrice != null && !current?.unitPrice
          ? String(item.costPrice)
          : current?.unitPrice ?? '',
    })
  }

  async function saveOrder() {
    if (!draftSupplierId) {
      setSaveError('CHOOSE A SUPPLIER')
      return
    }
    if (!draftNumber.trim()) {
      setSaveError('A PURCHASE ORDER NUMBER IS REQUIRED')
      return
    }
    const lines = draftLines
      .filter((line) => line.description.trim())
      .map((line) => ({
        inventoryItemId: line.inventoryItemId || null,
        description: line.description.trim(),
        qty: Number(line.qty) || 0,
        unitPrice: Number(line.unitPrice) || 0,
      }))
    if (lines.length === 0) {
      setSaveError('ADD AT LEAST ONE LINE')
      return
    }
    setSaving(true)
    setSaveError('')
    try {
      const res = await fetch('/api/admin/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venueId,
          supplierId: draftSupplierId,
          number: draftNumber.trim(),
          expectedAt: draftExpected || null,
          notes: draftNotes || null,
          lines,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSaveError(String(body.error ?? 'COULD NOT SAVE THE PURCHASE ORDER'))
        return
      }
      setCreateOpen(false)
      await loadOrders()
      if (body?.id) setSelectedId(body.id)
    } catch {
      setSaveError('COULD NOT REACH THE SERVER')
    } finally {
      setSaving(false)
    }
  }

  async function sendOrder() {
    if (!detail) return
    try {
      const res = await fetch(`/api/admin/purchase-orders/${detail.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueId }),
      })
      if (res.ok) {
        await loadDetail(detail.id)
        await loadOrders()
      } else {
        const body = await res.json().catch(() => ({}))
        setError(String(body.error ?? 'COULD NOT SEND THE PURCHASE ORDER'))
      }
    } catch {
      setError('COULD NOT REACH THE SERVER')
    }
  }

  async function deleteOrder() {
    if (!detail) return
    try {
      const params = new URLSearchParams({ venueId })
      const res = await fetch(`/api/admin/purchase-orders/${detail.id}?${params.toString()}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setSelectedId(null)
        await loadOrders()
      } else {
        const body = await res.json().catch(() => ({}))
        setError(String(body.error ?? 'COULD NOT DELETE THE PURCHASE ORDER'))
      }
    } catch {
      setError('COULD NOT REACH THE SERVER')
    }
  }

  function openReceive() {
    if (!detail) return
    setReceiptLines(
      detail.lines.map((line) => ({
        lineId: line.id,
        description: line.description,
        qty: String(Math.max(0, line.qty - line.receivedQty)),
        unitPrice: String(line.unitPrice),
      })),
    )
    setVehicleTemp('')
    setReceiveError('')
    setMovements([])
    setReceiveOpen(true)
  }

  async function submitReceipt() {
    if (!detail) return
    const lines = receiptLines
      .map((line) => ({
        lineId: line.lineId,
        qty: Number(line.qty) || 0,
        unitPrice: Number(line.unitPrice) || 0,
      }))
      .filter((line) => line.qty > 0)
    if (lines.length === 0) {
      setReceiveError('ENTER A RECEIVED QUANTITY')
      return
    }
    setReceiving(true)
    setReceiveError('')
    try {
      const res = await fetch(`/api/admin/purchase-orders/${detail.id}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venueId,
          vehicleTemp: vehicleTemp.trim() === '' ? null : Number(vehicleTemp),
          lines,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setReceiveError(String(body.error ?? 'COULD NOT POST THE RECEIPT'))
        return
      }
      setReceiveOpen(false)
      if (Array.isArray(body.priceMovements)) setMovements(body.priceMovements)
      setPriceRefreshKey((key) => key + 1)
      await loadDetail(detail.id)
      await loadOrders()
    } catch {
      setReceiveError('COULD NOT REACH THE SERVER')
    } finally {
      setReceiving(false)
    }
  }

  if (!venueId) {
    return <p className="font-mono text-xs text-grey-light uppercase">SELECT A VENUE.</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-mono text-xl font-bold uppercase tracking-widest text-white">
            PURCHASE ORDERS
          </h1>
          <p className="font-mono text-2xs uppercase text-grey-light mt-0.5">
            CREATE → SEND → RECEIVE. RECEIPTS UPDATE COSTS AND RAISE PRICE MOVEMENTS.
          </p>
        </div>
        <Button onClick={openCreate}>+ NEW PO</Button>
      </div>

      {error && <p className="font-mono text-xs text-danger border border-danger p-2">{error}</p>}

      <div className="flex flex-wrap items-end gap-3 border border-grey-mid p-3">
        <Input
          aria-label="SEARCH PURCHASE ORDERS"
          placeholder="SEARCH NUMBER / SUPPLIER"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[14rem]"
        />
        <div className="min-w-[12rem]">
          <Select
            aria-label="FILTER BY STATUS"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={STATUS_FILTERS.map((s) => ({ value: s, label: s }))}
          />
        </div>
        <Button size="sm" variant="ghost" onClick={() => void loadOrders()} loading={loading}>
          ↻ REFRESH
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7">
          <div className="border border-grey-mid overflow-x-auto">
            <table className="w-full border-collapse font-mono text-xs">
              <thead>
                <tr className="bg-grey-dark/40">
                  {['NUMBER', 'SUPPLIER', 'STATUS', 'EXPECTED', 'TOTAL'].map((h) => (
                    <th
                      key={h}
                      className="text-left uppercase tracking-wider text-grey-light px-3 py-1.5 border-b border-grey-mid whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((order) => (
                  <tr
                    key={order.id}
                    onClick={() => setSelectedId(order.id)}
                    className={`border-b border-grey-mid last:border-b-0 cursor-pointer ${
                      selectedId === order.id ? 'bg-grey-dark/60' : 'hover:bg-grey-dark/30'
                    }`}
                  >
                    <td className="px-3 py-2 text-white whitespace-nowrap">{order.number}</td>
                    <td className="px-3 py-2 text-grey-light">{order.supplier?.name ?? '—'}</td>
                    <td className={`px-3 py-2 whitespace-nowrap ${statusClass(order.status)}`}>
                      {order.status}
                    </td>
                    <td className="px-3 py-2 text-grey-light whitespace-nowrap">
                      {order.expectedAt?.slice(0, 10) ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-white tabular-nums whitespace-nowrap">
                      {money(order.total)}
                    </td>
                  </tr>
                ))}
                {!loading && visible.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-3 font-mono text-xs text-grey-light uppercase">
                      NO PURCHASE ORDERS YET.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="border border-grey-mid p-3 space-y-3">
            {!selectedId && (
              <p className="font-mono text-xs text-grey-light uppercase">
                SELECT A PURCHASE ORDER TO REVIEW OR RECEIVE IT.
              </p>
            )}
            {selectedId && detailLoading && (
              <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
            )}
            {selectedId && detail && !detailLoading && (
              <div className="space-y-3">
                <div>
                  <h2 className="font-mono text-sm uppercase tracking-wider text-white">
                    {detail.number}
                  </h2>
                  <p className="font-mono text-2xs uppercase text-grey-light">
                    {detail.supplier?.name} · {detail.expectedAt?.slice(0, 10) ?? 'NO EXPECTED DATE'}
                  </p>
                  <p className={`font-mono text-xs uppercase mt-1 ${statusClass(detail.status)}`}>
                    {detail.status}
                  </p>
                </div>

                <div className="space-y-1">
                  {detail.lines.map((line) => (
                    <div key={line.id} className="border-b border-grey-mid last:border-b-0 py-1.5">
                      <div className="font-mono text-xs text-white">{line.description}</div>
                      <div className="font-mono text-2xs uppercase text-grey-light">
                        {line.receivedQty} / {line.qty} RECEIVED ·{' '}
                        {money(line.unitPrice)} EA · {money(line.lineTotal)}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-2 border-y border-grey-mid py-2">
                  <Stat label="SUBTOTAL" value={money(detail.subtotal)} />
                  <Stat label="GST" value={money(detail.gst)} />
                  <Stat label="TOTAL" value={money(detail.total)} />
                </div>

                {detail.invoices.length > 0 && (
                  <div className="font-mono text-2xs uppercase text-grey-light">
                    INVOICES:{' '}
                    <span className="text-white">
                      {detail.invoices.map((invoice) => `${invoice.number} (${invoice.status})`).join(', ')}
                    </span>
                  </div>
                )}

                <div className="border-t border-grey-mid pt-3 flex flex-wrap items-center gap-2">
                  {detail.status === 'DRAFT' && (
                    <Button size="sm" variant="primary" onClick={() => void sendOrder()}>
                      SEND
                    </Button>
                  )}
                  {(detail.status === 'SENT' || detail.status === 'PARTIALLY_RECEIVED') && (
                    <Button size="sm" variant="primary" onClick={openReceive}>
                      RECEIVE
                    </Button>
                  )}
                  <Button size="sm" variant="danger" onClick={() => void deleteOrder()}>
                    DELETE
                  </Button>
                </div>

                {movements.length > 0 && (
                  <div className="border border-warning p-2 space-y-0.5">
                    <p className="font-mono text-2xs uppercase text-warning">
                      PRICE MOVEMENTS FROM THIS RECEIPT
                    </p>
                    {movements.map((movement) => (
                      <p key={movement.inventoryItemId} className="font-mono text-2xs uppercase text-white">
                        {items.find((item) => item.id === movement.inventoryItemId)?.name ?? 'ITEM'}:{' '}
                        {movement.oldPrice == null ? '—' : money(movement.oldPrice)} →{' '}
                        {money(movement.newPrice)}
                        {movement.percent == null
                          ? ''
                          : ` (${movement.percent > 0 ? '+' : ''}${movement.percent.toFixed(1)}%)`}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <PriceMovementsPanel venueId={venueId} refreshKey={priceRefreshKey} />

      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="NEW PURCHASE ORDER"
        size="xl"
        dirty={Boolean(draftSupplierId || draftNumber || draftLines.some((l) => l.description || l.unitPrice))}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="SUPPLIER"
              aria-label="PO SUPPLIER"
              value={draftSupplierId}
              onChange={(e) => setDraftSupplierId(e.target.value)}
              options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
              placeholder="CHOOSE SUPPLIER"
            />
            <Input
              label="NUMBER"
              aria-label="PO NUMBER"
              value={draftNumber}
              onChange={(e) => setDraftNumber(e.target.value)}
              placeholder="PO-0001"
            />
            <Input
              label="EXPECTED"
              aria-label="PO EXPECTED"
              type="date"
              value={draftExpected}
              onChange={(e) => setDraftExpected(e.target.value)}
            />
            <Input
              label="NOTES"
              aria-label="PO NOTES"
              value={draftNotes}
              onChange={(e) => setDraftNotes(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">LINES</h3>
              <Button size="sm" variant="ghost" onClick={() => setDraftLines((prev) => [...prev, newDraftLine()])}>
                + ADD LINE
              </Button>
            </div>

            {draftLines.map((line, index) => (
              <div key={line.key} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-12 md:col-span-4">
                  <Select
                    label={index === 0 ? 'ITEM' : undefined}
                    aria-label={`PO ITEM ${index + 1}`}
                    value={line.inventoryItemId}
                    onChange={(e) => pickItem(line.key, e.target.value)}
                    options={[
                      { value: '', label: 'NO ITEM (FREE TEXT)' },
                      ...items.map((item) => ({ value: item.id, label: `${item.name} · ${item.unit}` })),
                    ]}
                  />
                </div>
                <div className="col-span-12 md:col-span-3">
                  <Input
                    label={index === 0 ? 'DESCRIPTION' : undefined}
                    aria-label={`PO DESCRIPTION ${index + 1}`}
                    value={line.description}
                    onChange={(e) => patchDraftLine(line.key, { description: e.target.value })}
                    placeholder="DESCRIPTION"
                  />
                </div>
                <div className="col-span-4 md:col-span-2">
                  <Input
                    label={index === 0 ? 'QTY' : undefined}
                    aria-label={`PO QTY ${index + 1}`}
                    value={line.qty}
                    onChange={(e) => patchDraftLine(line.key, { qty: e.target.value })}
                    className="text-right"
                  />
                </div>
                <div className="col-span-4 md:col-span-2">
                  <Input
                    label={index === 0 ? 'UNIT PRICE' : undefined}
                    aria-label={`PO PRICE ${index + 1}`}
                    value={line.unitPrice}
                    onChange={(e) => patchDraftLine(line.key, { unitPrice: e.target.value })}
                    className="text-right"
                  />
                </div>
                <div className="col-span-4 md:col-span-1">
                  <Button
                    size="sm"
                    variant="danger"
                    aria-label={`REMOVE LINE ${index + 1}`}
                    onClick={() =>
                      setDraftLines((prev) =>
                        prev.length > 1 ? prev.filter((l) => l.key !== line.key) : [newDraftLine()],
                      )
                    }
                  >
                    ✕
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2 border-t border-grey-mid pt-3">
            <Stat label="SUBTOTAL" value={money(draftTotals.subtotal)} />
            <Stat label="GST 15%" value={money(draftTotals.gst)} />
            <Stat label="TOTAL" value={money(draftTotals.total)} />
          </div>

          {saveError && (
            <p className="font-mono text-xs text-danger border border-danger p-2">{saveError}</p>
          )}

          <div className="border-t border-grey-mid pt-3 flex items-center gap-2">
            <Button onClick={() => void saveOrder()} loading={saving}>
              SAVE PO
            </Button>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              CANCEL
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        title="RECEIVE PURCHASE ORDER"
        size="lg"
        dirty={Boolean(vehicleTemp)}
      >
        <div className="space-y-4">
          {detail && (
            <p className="font-mono text-2xs uppercase text-grey-light">
              {detail.number} · {detail.supplier?.name}
            </p>
          )}

          <div className="space-y-2">
            {receiptLines.map((line, index) => (
              <div key={line.lineId} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-6 font-mono text-xs text-white truncate">
                  {line.description}
                </div>
                <div className="col-span-3">
                  <Input
                    label={index === 0 ? 'QTY' : undefined}
                    aria-label={`RECEIVE QTY ${index + 1}`}
                    value={line.qty}
                    onChange={(e) =>
                      setReceiptLines((prev) =>
                        prev.map((l) => (l.lineId === line.lineId ? { ...l, qty: e.target.value } : l)),
                      )
                    }
                    className="text-right"
                  />
                </div>
                <div className="col-span-3">
                  <Input
                    label={index === 0 ? 'UNIT PRICE' : undefined}
                    aria-label={`RECEIVE PRICE ${index + 1}`}
                    value={line.unitPrice}
                    onChange={(e) =>
                      setReceiptLines((prev) =>
                        prev.map((l) =>
                          l.lineId === line.lineId ? { ...l, unitPrice: e.target.value } : l,
                        ),
                      )
                    }
                    className="text-right"
                  />
                </div>
              </div>
            ))}
          </div>

          <Input
            label="VEHICLE TEMP (°C, OPTIONAL)"
            aria-label="VEHICLE TEMP"
            value={vehicleTemp}
            onChange={(e) => setVehicleTemp(e.target.value)}
            className="text-right"
          />

          {receiveError && (
            <p className="font-mono text-xs text-danger border border-danger p-2">{receiveError}</p>
          )}

          <div className="border-t border-grey-mid pt-3 flex items-center gap-2">
            <Button onClick={() => void submitReceipt()} loading={receiving}>
              POST RECEIPT
            </Button>
            <Button variant="ghost" onClick={() => setReceiveOpen(false)}>
              CANCEL
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-2xs uppercase text-grey-light mb-0.5">{label}</div>
      <div className="font-mono text-sm text-white">{value}</div>
    </div>
  )
}
