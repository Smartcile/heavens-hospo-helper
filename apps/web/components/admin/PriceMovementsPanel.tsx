'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'

interface PriceMovementRow {
  id: string
  oldPrice: number | null
  newPrice: number
  delta: number
  percent: number | null
  createdAt: string
  inventoryItem: { id: string; name: string; unit: string | null } | null
  supplier: { id: string; name: string } | null
}

export function PriceMovementsPanel({
  venueId,
  compact = false,
  refreshKey = 0,
}: {
  venueId: string
  compact?: boolean
  refreshKey?: number
}) {
  const [rows, setRows] = useState<PriceMovementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    if (!venueId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ venueId, acknowledged: 'false' })
      const res = await fetch(`/api/admin/price-movements?${params.toString()}`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRows([])
        setError(String(body.error ?? 'COULD NOT LOAD PRICE MOVEMENTS'))
        return
      }
      setRows(Array.isArray(body.movements) ? body.movements : [])
    } catch {
      setRows([])
      setError('COULD NOT REACH THE SERVER')
    } finally {
      setLoading(false)
    }
  }, [venueId])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  async function acknowledge(id: string) {
    setBusy(id)
    try {
      const res = await fetch(`/api/admin/price-movements/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueId, acknowledged: true }),
      })
      if (res.ok) {
        setRows((prev) => prev.filter((row) => row.id !== id))
      } else {
        const body = await res.json().catch(() => ({}))
        setError(String(body.error ?? 'COULD NOT ACKNOWLEDGE'))
      }
    } catch {
      setError('COULD NOT REACH THE SERVER')
    } finally {
      setBusy('')
    }
  }

  if (!venueId) return null

  return (
    <div className="border border-grey-mid">
      <div className="px-3 py-2 border-b border-grey-mid bg-grey-dark/30 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-mono text-xs uppercase tracking-wider text-white">
            PRICE MOVEMENTS {rows.length > 0 ? `(${rows.length})` : ''}
          </h3>
          {!compact && (
            <p className="font-mono text-2xs uppercase text-grey-light mt-0.5">
              RECEIVED PRICES THAT CHANGED — ACKNOWLEDGE ONCE REVIEWED.
            </p>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={() => void load()} loading={loading}>
          ↻ REFRESH
        </Button>
      </div>

      {error && (
        <p className="font-mono text-xs text-danger border-b border-danger px-3 py-2">{error}</p>
      )}

      {loading && rows.length === 0 && !error && (
        <p className="font-mono text-xs text-grey-light loading-cursor px-3 py-2">LOADING</p>
      )}

      {!loading && rows.length === 0 && !error && (
        <p className="font-mono text-xs text-grey-light px-3 py-2 uppercase">
          NO UNAPPROVED PRICE MOVEMENTS.
        </p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse font-mono text-xs">
            <thead>
              <tr className="bg-grey-dark/40">
                {['ITEM', 'SUPPLIER', 'PRICE', 'CHANGE', 'DATE', ''].map((heading) => (
                  <th
                    key={heading}
                    className="text-left uppercase tracking-wider text-grey-light px-3 py-1.5 border-b border-grey-mid whitespace-nowrap"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-grey-mid last:border-b-0 text-white">
                  <td className="px-3 py-2">{row.inventoryItem?.name ?? 'ITEM REMOVED'}</td>
                  <td className="px-3 py-2 text-grey-light">{row.supplier?.name ?? '—'}</td>
                  <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                    ${row.oldPrice == null ? '—' : row.oldPrice.toFixed(2)} → ${row.newPrice.toFixed(2)}
                  </td>
                  <td
                    className={`px-3 py-2 tabular-nums ${
                      row.delta > 0 ? 'text-danger' : 'text-success'
                    }`}
                  >
                    {row.percent == null
                      ? `${row.delta > 0 ? '+' : ''}${row.delta.toFixed(2)}`
                      : `${row.percent > 0 ? '+' : ''}${row.percent.toFixed(1)}%`}
                  </td>
                  <td className="px-3 py-2 text-grey-light whitespace-nowrap">
                    {row.createdAt?.slice(0, 10) ?? '—'}
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void acknowledge(row.id)}
                      loading={busy === row.id}
                      aria-label={`ACKNOWLEDGE ${row.inventoryItem?.name ?? row.id}`}
                    >
                      ACKNOWLEDGE
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
