'use client'

// Live kitchen dockets for the pass — open sales proxied from SwiftDOSnet.
// Polls every 30 s only while the tab is visible (the feed reads live POS SQL),
// with a manual REFRESH and a line-window selector. See MENUS.md §8.

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { getActiveVenueId } from '@/lib/active-venue'
import type { DocketLine, KitchenDocket } from '@/lib/swiftpos-dockets'

interface Payload {
  venueName: string
  minutes: number
  from: string | null
  to: string
  generatedAt: string
  dockets: KitchenDocket[]
}

const WINDOWS: { minutes: number; label: string }[] = [
  { minutes: 30, label: '30 MIN' },
  { minutes: 60, label: '60 MIN' },
  { minutes: 120, label: '120 MIN' },
  { minutes: 0, label: 'ALL LINES' },
]

export function KitchenDocketsClient({
  role,
  sessionVenueId,
  defaultVenueId,
}: {
  role: string
  sessionVenueId: string
  defaultVenueId?: string | null
}) {
  const venueId = getActiveVenueId(role, sessionVenueId, defaultVenueId)
  const [minutes, setMinutes] = useState(60)
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState('')

  const load = useCallback(async (showLoading = true) => {
    if (!venueId) return
    if (showLoading) setLoading(true)
    try {
      const params = new URLSearchParams({ venueId, minutes: String(minutes) })
      const res = await fetch(`/api/admin/swiftpos/dockets?${params.toString()}`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setData(null)
        setError(String(body.error ?? 'COULD NOT LOAD KITCHEN DOCKETS'))
        return
      }
      setData(body as Payload)
      setError('')
      setUpdatedAt(clock(body.generatedAt))
    } catch {
      setError('COULD NOT REACH THE SERVER')
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [venueId, minutes])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        load(false)
      }
    }, 30_000)
    return () => clearInterval(id)
  }, [load])

  const dockets = data?.dockets ?? []
  const lineCount = dockets.reduce((sum, d) => sum + d.lines.length, 0)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-mono text-xl font-bold uppercase tracking-widest text-white">KITCHEN DOCKETS</h1>
          <p className="font-mono text-2xs uppercase text-grey-light mt-0.5">
            LIVE OPEN SALES FROM SWIFTDOSNET · AUTO-REFRESHES EVERY 30 S WHILE THIS TAB IS VISIBLE
          </p>
        </div>
        <div className="flex items-center gap-2">
          {updatedAt && <span className="font-mono text-2xs uppercase text-grey-light">UPDATED {updatedAt}</span>}
          <Button size="sm" variant="ghost" onClick={() => load()} loading={loading}>↻ REFRESH</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {WINDOWS.map((w) => (
          <Button
            key={w.minutes}
            size="sm"
            variant={minutes === w.minutes ? 'primary' : 'ghost'}
            onClick={() => setMinutes(w.minutes)}
            aria-pressed={minutes === w.minutes}
          >
            {w.label}
          </Button>
        ))}
      </div>

      {error && <p className="font-mono text-xs text-danger border border-danger p-2">{error}</p>}

      {loading && !data && <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 border border-grey-mid p-3">
            <Stat label="OPEN DOCKETS" value={String(dockets.length)} />
            <Stat label="LINES" value={String(lineCount)} />
            <Stat label="WINDOW" value={data.from ? `${data.from.slice(11)} → ${data.to.slice(11)}` : 'ALL LINES'} />
          </div>

          {dockets.length === 0 ? (
            <p className="font-mono text-xs text-grey-light border border-grey-mid p-3 uppercase">
              NO OPEN KITCHEN DOCKETS {data.from ? 'IN THIS WINDOW' : 'RIGHT NOW'}.
            </p>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {dockets.map((docket) => (
                <DocketCard key={docket.transactionId} docket={docket} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function DocketCard({ docket }: { docket: KitchenDocket }) {
  return (
    <div className="border border-grey-mid">
      <div className="px-3 py-2 border-b border-grey-mid bg-grey-dark/30">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-mono text-sm uppercase tracking-wider text-white">
            {docket.booking || docket.tableName || `TABLE ${docket.tableNumber}`}
          </span>
          <span className="font-mono text-2xs uppercase text-grey-light">
            TXN {docket.transactionId} · {docket.covers} COVERS
          </span>
        </div>
        <div className="font-mono text-2xs uppercase text-grey-light mt-0.5">
          {[docket.clerk, docket.terminal, docket.opened].filter(Boolean).join(' · ') || '—'}
        </div>
      </div>
      <div className="divide-y divide-grey-mid">
        {docket.lines.length === 0 && (
          <p className="font-mono text-xs text-grey-light px-3 py-2 uppercase">NO LINES ON THIS DOCKET.</p>
        )}
        {docket.lines.map((line, i) => (
          <LineRow key={`${line.detailId}-${i}`} line={line} />
        ))}
      </div>
    </div>
  )
}

function LineRow({ line }: { line: DocketLine }) {
  return (
    <div className={`px-3 py-1.5 flex items-start gap-2 ${line.instruction ? 'pl-7' : ''} ${line.system ? 'opacity-50' : ''}`}>
      {line.instruction ? (
        <span className="font-mono text-xs text-grey-light">↳</span>
      ) : (
        <span className="font-mono text-xs text-white tabular-nums">{fmtQty(line.quantity)}×</span>
      )}
      <div className="min-w-0 flex-1">
        <div className={`font-mono text-xs uppercase ${line.instruction ? 'text-grey-light' : 'text-white'}`}>
          {line.description || line.inventoryCode || '—'}
        </div>
        <div className="font-mono text-2xs uppercase text-grey-light">
          {[line.printGroup, line.seat ? `SEAT ${line.seat}` : '', line.inventoryCode, line.pluText]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>
    </div>
  )
}

function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

function clock(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-2xs uppercase text-grey-light mb-0.5">{label}</div>
      <div className="font-mono text-sm text-white">{value}</div>
    </div>
  )
}
