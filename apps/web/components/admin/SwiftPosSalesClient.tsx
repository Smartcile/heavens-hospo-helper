'use client'

// SwiftPOS sales + stock drawdown, pulled from SwiftDOSnet.
//
// Configures the venue's SwiftDOSnet base URL, then runs the sales pull for a
// date range: what the POS sold (matched to products), the mapping gaps, and how
// that would draw down stock through each product's serves. Read-only — nothing
// is deducted. See MENUS.md §8.

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { DateInput } from '@/components/ui/DateInput'
import { pushToast } from '@/components/ui/Toast'
import { getActiveVenueId } from '@/lib/active-venue'

interface VenueRow { id: string; name: string; swiftPosBaseUrl: string | null }

interface SaleRow {
  inventoryCode: string
  label: string
  qty: number
  gross: number
  net: number
  itemId?: string | null
  itemName?: string | null
  serveSummary?: string | null
}

interface DrawdownRow {
  inventoryItemId: string
  name: string
  qty: number
  unit: 'G' | 'KG' | 'BASE'
  currentQty: number
  variance: number | null
}

interface Report {
  from: string
  to: string
  products: number
  mapped: number
  totalQty: number
  matchedQty: number
  matched: SaleRow[]
  unmatched: SaleRow[]
  consumption?: {
    matchedQty: number
    totalQty: number
    drawdown: DrawdownRow[]
    errors: string[]
  }
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

export function SwiftPosSalesClient({
  role,
  sessionVenueId,
  defaultVenueId,
}: {
  role: string
  sessionVenueId: string
  defaultVenueId?: string | null
}) {
  const venueId = getActiveVenueId(role, sessionVenueId, defaultVenueId)
  const [baseUrl, setBaseUrl] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [running, setRunning] = useState(false)
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/venues')
      .then((r) => (r.ok ? r.json() : []))
      .then((venues: VenueRow[]) => {
        setBaseUrl(venues.find((v) => v.id === venueId)?.swiftPosBaseUrl ?? '')
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [venueId])

  async function saveUrl() {
    if (!venueId) return
    setSaving(true)
    const r = await fetch(`/api/admin/venues/${venueId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ swiftPosBaseUrl: baseUrl }),
    })
    setSaving(false)
    pushToast(r.ok ? 'SWIFT POS URL SAVED' : 'SAVE FAILED', r.ok ? 'success' : 'error')
  }

  async function run() {
    setRunning(true)
    setError('')
    setReport(null)
    const params = new URLSearchParams({ drawdown: '1' })
    if (venueId) params.set('venueId', venueId)
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    try {
      const r = await fetch(`/api/admin/swiftpos/sales?${params.toString()}`)
      const d = await r.json()
      if (!r.ok) {
        setError(String(d.error ?? 'PULL FAILED'))
        return
      }
      setReport(d as Report)
    } catch {
      setError('COULD NOT REACH THE SERVER')
    } finally {
      setRunning(false)
    }
  }

  if (!loaded) {
    return <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
  }

  const consumption = report?.consumption

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <h1 className="font-mono text-xl font-bold uppercase tracking-widest">SWIFT POS</h1>
        <p className="font-mono text-xs text-grey-light mt-1 uppercase">
          PULL PRODUCT SALES FROM SWIFTDOSNET AND SEE WHAT THEY WOULD DRAW DOWN. READ-ONLY — NOTHING IS DEDUCTED.
        </p>
      </div>

      {/* Connection */}
      <div className="border border-grey-mid p-3 space-y-2">
        <label className="font-mono text-xs uppercase text-grey-light tracking-wider">SwiftDOSnet base URL</label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="http://localhost:5080"
            className="flex-1 min-w-[16rem]"
          />
          <Button size="sm" onClick={saveUrl} loading={saving}>SAVE URL</Button>
        </div>
        <p className="font-mono text-2xs uppercase text-grey-light leading-tight">
          THE SWIFTDOSNET WEB SERVICE (NO TRAILING SLASH). SALES COME FROM ITS
          <span className="text-white"> /API/ANALYTICS/SALES </span> ENDPOINT. A POS SALE LINE MATCHES A PRODUCT VIA ITS
          <span className="text-white"> SWIFTPOS ID </span> (SET ON EACH PRODUCT&apos;S MENU-ITEM).
        </p>
      </div>

      {/* Range + run */}
      <div className="border border-grey-mid p-3 space-y-2">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="font-mono text-xs uppercase text-grey-light block mb-1">From</label>
            <DateInput value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="font-mono text-xs uppercase text-grey-light block mb-1">To</label>
            <DateInput value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button size="sm" onClick={run} loading={running}>↻ RUN — PULL + DRAWDOWN</Button>
          <span className="font-mono text-2xs uppercase text-grey-light">BLANK DATES = TODAY (VENUE TIME)</span>
        </div>
      </div>

      {error && <p className="font-mono text-xs text-danger border border-danger p-2">{error}</p>}

      {report && (
        <>
          {/* Summary */}
          <div className="border border-grey-mid p-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="RANGE" value={`${report.from} → ${report.to}`} />
              <Stat label="PRODUCTS MAPPED" value={`${report.mapped} / ${report.products}`} />
              <Stat label="UNITS SOLD" value={fmt(report.totalQty)} />
              <Stat label="UNITS MATCHED" value={fmt(report.matchedQty)} />
            </div>
          </div>

          {/* Unmatched — the mapping gaps */}
          <Section
            title={`UNMATCHED SALES (${report.unmatched.length})`}
            hint="POS products with no product carrying that SwiftPOS ID — set it to map them."
          >
            {report.unmatched.length === 0 ? (
              <p className="font-mono text-xs text-success px-3 py-2">EVERY SOLD PRODUCT IS MAPPED.</p>
            ) : (
              <Table
                head={['CODE', 'DESCRIPTION', 'QTY']}
                rows={report.unmatched.map((s) => [s.inventoryCode, s.label || '—', fmt(s.qty)])}
              />
            )}
          </Section>

          {/* Sold + how it maps */}
          <Section title={`SOLD — MATCHED (${report.matched.length})`} hint="Each sale and the product + serves it maps to.">
            {report.matched.length === 0 ? (
              <p className="font-mono text-xs text-grey-light px-3 py-2">NOTHING MATCHED FOR THIS RANGE.</p>
            ) : (
              <Table
                head={['CODE', 'PRODUCT', 'QTY', 'DRAWS']}
                rows={report.matched.map((s) => [s.inventoryCode, s.itemName ?? '—', fmt(s.qty), s.serveSummary ?? '—'])}
              />
            )}
          </Section>

          {/* Drawdown */}
          <Section
            title={`STOCK DRAWDOWN (${consumption?.drawdown.length ?? 0})`}
            hint="What selling this range would consume, vs on-hand. Grams where the item has a density."
          >
            {!consumption || consumption.drawdown.length === 0 ? (
              <p className="font-mono text-xs text-grey-light px-3 py-2">NO DRAWDOWN — NO MATCHED PRODUCTS WITH SERVES.</p>
            ) : (
              <Table
                head={['STOCK ITEM', 'REQUIRED', 'ON HAND', 'VARIANCE']}
                rows={consumption.drawdown.map((d) => [
                  d.name,
                  `${fmt(d.qty)} ${d.unit === 'BASE' ? '' : d.unit}`.trim(),
                  d.unit === 'BASE' ? fmt(d.currentQty) : '—',
                  d.variance == null ? '—' : fmt(d.variance),
                ])}
                danger={consumption.drawdown.map((d) => d.variance != null && d.variance < 0)}
              />
            )}
          </Section>

          {consumption && consumption.errors.length > 0 && (
            <Section title={`PROBLEMS (${consumption.errors.length})`} hint="Products that could not be expanded.">
              <div className="p-3 space-y-1">
                {consumption.errors.map((e, i) => (
                  <p key={i} className="font-mono text-xs text-warning">{e}</p>
                ))}
              </div>
            </Section>
          )}
        </>
      )}
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

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="border border-grey-mid">
      <div className="px-3 py-2 border-b border-grey-mid">
        <div className="font-mono text-xs uppercase tracking-wider text-white">{title}</div>
        {hint && <div className="font-mono text-2xs uppercase text-grey-light mt-0.5">{hint}</div>}
      </div>
      {children}
    </div>
  )
}

function Table({ head, rows, danger }: { head: string[]; rows: string[][]; danger?: boolean[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse font-mono text-xs">
        <thead>
          <tr className="bg-grey-dark/40">
            {head.map((h) => (
              <th key={h} className="text-left uppercase tracking-wider text-grey-light px-3 py-1.5 border-b border-grey-mid whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={`border-b border-grey-mid last:border-b-0 ${danger?.[i] ? 'text-danger' : 'text-white'}`}>
              {r.map((c, j) => (
                <td key={j} className="px-3 py-1.5 align-top">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
