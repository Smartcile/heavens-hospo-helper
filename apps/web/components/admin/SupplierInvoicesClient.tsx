'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { getActiveVenueId } from '@/lib/active-venue'
import { InvoiceImportModal } from '@/components/admin/InvoiceImportModal'
import { PriceMovementsPanel } from '@/components/admin/PriceMovementsPanel'

interface InvoiceRow {
  id: string
  number: string
  invoiceDate: string | null
  status: string
  total: number
  supplier: { id: string; name: string }
  lineCount: number
}

interface InvoiceLine {
  id: string
  description: string
  supplierSku: string | null
  qty: number
  unitPrice: number
  lineTotal: number
  matchStatus: string
  purchaseOrderLineId: string | null
  deliveryItemId: string | null
}

interface InvoiceDetail extends InvoiceRow {
  subtotal: number
  gst: number
  currency: string
  fileUrl: string | null
  purchaseOrder: { id: string; number: string; status: string } | null
  deliveries: { id: string; deliveredAt: string }[]
  lines: InvoiceLine[]
}

interface SupplierOption {
  id: string
  name: string
}

interface ItemOption {
  id: string
  name: string
}

const STATUS_FILTERS = [
  'ALL',
  'DRAFT',
  'PENDING_MATCH',
  'MATCHED',
  'VARIANCE',
  'APPROVED',
  'PAID',
  'CANCELLED',
]

function statusClass(status: string): string {
  switch (status) {
    case 'MATCHED':
    case 'APPROVED':
    case 'PAID':
      return 'text-success'
    case 'VARIANCE':
      return 'text-danger'
    case 'PENDING_MATCH':
      return 'text-warning'
    default:
      return 'text-grey-light'
  }
}

export function SupplierInvoicesClient({
  role,
  sessionVenueId,
  defaultVenueId,
}: {
  role: string
  sessionVenueId: string
  defaultVenueId?: string | null
}) {
  const venueId = getActiveVenueId(role, sessionVenueId, defaultVenueId)
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('ALL')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<InvoiceDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  const [items, setItems] = useState<ItemOption[]>([])
  const [importOpen, setImportOpen] = useState(false)

  const loadInvoices = useCallback(async () => {
    if (!venueId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ venueId })
      if (status !== 'ALL') params.set('status', status)
      const res = await fetch(`/api/admin/supplier-invoices?${params.toString()}`)
      const body = await res.json().catch(() => [])
      if (!res.ok) {
        setInvoices([])
        setError(String((body as { error?: string }).error ?? 'COULD NOT LOAD INVOICES'))
        return
      }
      setInvoices(Array.isArray(body) ? body : [])
    } catch {
      setInvoices([])
      setError('COULD NOT REACH THE SERVER')
    } finally {
      setLoading(false)
    }
  }, [venueId, status])

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
        setItems(body.map((item: { id: string; name: string }) => ({ id: item.id, name: item.name })))
      }
    }
  }, [venueId])

  useEffect(() => {
    void loadInvoices()
  }, [loadInvoices])

  useEffect(() => {
    void loadOptions()
  }, [loadOptions])

  const loadDetail = useCallback(
    async (id: string) => {
      if (!venueId) return
      setDetailLoading(true)
      try {
        const params = new URLSearchParams({ venueId })
        const res = await fetch(`/api/admin/supplier-invoices/${id}?${params.toString()}`)
        const body = await res.json().catch(() => ({}))
        if (res.ok) setDetail(body as InvoiceDetail)
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

  const visible = useMemo(() => {
    const needle = search.trim().toUpperCase()
    if (!needle) return invoices
    return invoices.filter((invoice) =>
      `${invoice.number} ${invoice.supplier?.name ?? ''}`.toUpperCase().includes(needle),
    )
  }, [invoices, search])

  if (!venueId) {
    return <p className="font-mono text-xs text-grey-light uppercase">SELECT A VENUE.</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-mono text-xl font-bold uppercase tracking-widest text-white">
            SUPPLIER INVOICES
          </h1>
          <p className="font-mono text-2xs uppercase text-grey-light mt-0.5">
            DETERMINISTIC PDF IMPORT — NO CLOUD LLM AT IMPORT TIME.
          </p>
        </div>
        <Button onClick={() => setImportOpen(true)}>+ IMPORT INVOICE</Button>
      </div>

      {error && <p className="font-mono text-xs text-danger border border-danger p-2">{error}</p>}

      <div className="flex flex-wrap items-end gap-3 border border-grey-mid p-3">
        <Input
          aria-label="SEARCH INVOICES"
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
        <Button size="sm" variant="ghost" onClick={() => void loadInvoices()} loading={loading}>
          ↻ REFRESH
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7">
          <div className="border border-grey-mid overflow-x-auto">
            <table className="w-full border-collapse font-mono text-xs">
              <thead>
                <tr className="bg-grey-dark/40">
                  {['NUMBER', 'SUPPLIER', 'DATE', 'STATUS', 'TOTAL'].map((h) => (
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
                {visible.map((invoice) => (
                  <tr
                    key={invoice.id}
                    onClick={() => setSelectedId(invoice.id)}
                    className={`border-b border-grey-mid last:border-b-0 cursor-pointer ${
                      selectedId === invoice.id ? 'bg-grey-dark/60' : 'hover:bg-grey-dark/30'
                    }`}
                  >
                    <td className="px-3 py-2 text-white whitespace-nowrap">{invoice.number}</td>
                    <td className="px-3 py-2 text-grey-light">{invoice.supplier?.name ?? '—'}</td>
                    <td className="px-3 py-2 text-grey-light whitespace-nowrap">
                      {invoice.invoiceDate?.slice(0, 10) ?? '—'}
                    </td>
                    <td className={`px-3 py-2 whitespace-nowrap ${statusClass(invoice.status)}`}>
                      {invoice.status}
                    </td>
                    <td className="px-3 py-2 text-white tabular-nums whitespace-nowrap">
                      ${invoice.total.toFixed(2)}
                    </td>
                  </tr>
                ))}
                {!loading && visible.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-3 font-mono text-xs text-grey-light uppercase">
                      NO INVOICES YET.
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
                SELECT AN INVOICE TO REVIEW THE MATCH.
              </p>
            )}
            {selectedId && detailLoading && (
              <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
            )}
            {selectedId && detail && !detailLoading && <InvoiceDetailView detail={detail} />}
          </div>
        </div>
      </div>

      <PriceMovementsPanel venueId={venueId} />

      <InvoiceImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        suppliers={suppliers}
        inventoryItems={items}
        role={role}
        venueId={venueId}
        onDone={() => {
          void loadInvoices()
          if (selectedId) void loadDetail(selectedId)
        }}
      />
    </div>
  )
}

function InvoiceDetailView({ detail }: { detail: InvoiceDetail }) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-mono text-sm uppercase tracking-wider text-white">
          {detail.number}
        </h2>
        <p className="font-mono text-2xs uppercase text-grey-light">
          {detail.supplier?.name} · {detail.invoiceDate?.slice(0, 10) ?? 'NO DATE'} · {detail.currency}
        </p>
        <p className={`font-mono text-xs uppercase mt-1 ${statusClass(detail.status)}`}>
          {detail.status}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 border-y border-grey-mid py-2">
        <Stat label="SUBTOTAL" value={`$${detail.subtotal.toFixed(2)}`} />
        <Stat label="GST" value={`$${detail.gst.toFixed(2)}`} />
        <Stat label="TOTAL" value={`$${detail.total.toFixed(2)}`} />
      </div>

      <div className="font-mono text-2xs uppercase text-grey-light space-y-1">
        <div>
          PURCHASE ORDER:{' '}
          <span className="text-white">{detail.purchaseOrder?.number ?? 'NOT LINKED'}</span>
        </div>
        <div>
          RECEIPTS:{' '}
          <span className="text-white">
            {detail.deliveries.length > 0
              ? detail.deliveries.map((d) => d.deliveredAt.slice(0, 10)).join(', ')
              : 'NONE'}
          </span>
        </div>
        <div>
          FILE:{' '}
          {detail.fileUrl ? (
            <a href={detail.fileUrl} target="_blank" rel="noreferrer" className="text-white underline">
              OPEN PDF ↗
            </a>
          ) : (
            <span className="text-white">NONE</span>
          )}
        </div>
      </div>

      <div className="space-y-1">
        {detail.lines.map((line) => (
          <div key={line.id} className="border-b border-grey-mid last:border-b-0 py-1.5">
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono text-xs text-white">{line.description}</span>
              <span
                className={`font-mono text-2xs uppercase whitespace-nowrap ${
                  line.matchStatus === 'MATCHED'
                    ? 'text-success'
                    : line.matchStatus === 'VARIANCE'
                      ? 'text-danger'
                      : 'text-warning'
                }`}
              >
                {line.matchStatus}
              </span>
            </div>
            <div className="font-mono text-2xs uppercase text-grey-light">
              {line.qty} × ${line.unitPrice.toFixed(2)} = ${line.lineTotal.toFixed(2)}
              {line.supplierSku ? ` · ${line.supplierSku}` : ''}
              {line.purchaseOrderLineId ? ' · PO LINE' : ''}
              {line.deliveryItemId ? ' · RECEIPT LINE' : ''}
            </div>
          </div>
        ))}
        {detail.lines.length === 0 && (
          <p className="font-mono text-xs text-grey-light uppercase">NO LINES.</p>
        )}
      </div>
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
