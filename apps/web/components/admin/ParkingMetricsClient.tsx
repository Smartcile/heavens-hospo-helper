'use client'

import { useCallback, useEffect, useState } from 'react'
import { formatDateDMY } from '@/lib/date-nav'
import type { ParkingMetricTotals, ParkingMetrics } from '@/lib/parking-metrics'

interface MetricsResponse {
  metrics: ParkingMetrics
  range: { from: string | null; to: string; timezone: string }
}

const RANGES = [
  { key: '24h', label: '24 HOURS' },
  { key: '7d', label: '7 DAYS' },
  { key: '30d', label: '30 DAYS' },
  { key: 'all', label: 'ALL TIME' },
]

function pct(value: number): string {
  return `${Math.round(value * 100)}%`
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="border border-grey-mid p-3">
      <p className="font-mono text-2xs uppercase tracking-wider text-grey-light">{label}</p>
      <p className={`mt-1 font-mono text-2xl font-bold ${tone ?? 'text-white'}`}>{value}</p>
    </div>
  )
}

function TotalsRow({ label, totals }: { label: string; totals: ParkingMetricTotals }) {
  return (
    <tr className="border-b border-grey-mid/60">
      <td className="py-2 pr-3 font-mono text-xs uppercase text-grey-light">{label}</td>
      <td className="py-2 pr-3 text-right font-mono text-xs text-white">{totals.attempts}</td>
      <td className="py-2 pr-3 text-right font-mono text-xs text-success">{totals.confirmed}</td>
      <td className="py-2 pr-3 text-right font-mono text-xs text-warning">{totals.already}</td>
      <td className="py-2 pr-3 text-right font-mono text-xs text-danger">{totals.failed}</td>
      <td className="py-2 text-right font-mono text-xs text-white">{pct(totals.successRate)}</td>
    </tr>
  )
}

export function ParkingMetricsClient() {
  const [range, setRange] = useState('30d')
  const [data, setData] = useState<MetricsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/parking/metrics?range=${range}`, {
        cache: 'no-store',
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || 'COULD NOT LOAD PARKING METRICS')
        return
      }
      setData(body as MetricsResponse)
    } catch {
      setError('COULD NOT CONNECT — TRY AGAIN')
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => {
    void load()
  }, [load])

  const metrics = data?.metrics

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-xl font-bold uppercase tracking-widest text-white">
            PARKING METRICS
          </h1>
          <p className="mt-1 font-mono text-xs text-grey-light">
            CUSTOMER KIOSK, 4 HOUR CLAIMS AND STAFF PLATES.
          </p>
        </div>
        <a
          href="/admin/settings?tab=ftp"
          className="border border-grey-mid px-3 py-2 font-mono text-xs uppercase tracking-wider text-white hover:border-white"
        >
          FTP SETTINGS →
        </a>
      </div>

      <div className="flex flex-wrap gap-2">
        {RANGES.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setRange(item.key)}
            className={`border px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider ${
              range === item.key
                ? 'border-white bg-white text-black'
                : 'border-grey-mid text-grey-light'
            }`}
          >
            {item.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void load()}
          className="border border-grey-mid px-3 py-2 font-mono text-xs uppercase tracking-wider text-white"
        >
          ↻ REFRESH
        </button>
      </div>

      {loading && !data ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : error ? (
        <p className="border border-danger/50 bg-danger/10 p-3 font-mono text-xs uppercase text-danger">
          {error}
        </p>
      ) : metrics ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Plate entries" value={metrics.plateEntries} />
            <Stat label="Success" value={metrics.totals.confirmed} tone="text-success" />
            <Stat label="Already registered" value={metrics.totals.already} tone="text-warning" />
            <Stat label="Failed" value={metrics.totals.failed} tone="text-danger" />
            <Stat label="Success rate" value={pct(metrics.totals.successRate)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="border border-grey-mid p-4">
              <h2 className="font-mono text-sm uppercase tracking-widest text-white">
                90 MINUTE — SCAN2PAY
              </h2>
              <table className="mt-2 w-full">
                <thead>
                  <tr className="border-b border-grey-mid text-left">
                    {['SOURCE', 'TRIES', 'OK', 'ALREADY', 'FAILED', 'RATE'].map((head) => (
                      <th
                        key={head}
                        className="pb-1 pr-3 font-mono text-2xs uppercase tracking-wider text-grey-light"
                      >
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <TotalsRow label="KIOSK" totals={metrics.scan2pay90.kiosk} />
                  <TotalsRow label="WORKER" totals={metrics.scan2pay90.worker} />
                  <TotalsRow label="TOTAL" totals={metrics.scan2pay90.total} />
                </tbody>
              </table>
            </section>

            <section className="border border-grey-mid p-4">
              <h2 className="font-mono text-sm uppercase tracking-widest text-white">
                4 HOUR — VPERMIT
              </h2>
              <table className="mt-2 w-full">
                <thead>
                  <tr className="border-b border-grey-mid text-left">
                    {['TYPE', 'TRIES', 'OK', 'ALREADY', 'FAILED', 'RATE'].map((head) => (
                      <th
                        key={head}
                        className="pb-1 pr-3 font-mono text-2xs uppercase tracking-wider text-grey-light"
                      >
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {metrics.vpermit4h.byType.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-2 font-mono text-xs uppercase text-grey-light">
                        NO CLAIMS IN THIS RANGE.
                      </td>
                    </tr>
                  ) : (
                    metrics.vpermit4h.byType.map((row) => (
                      <TotalsRow key={row.typeId} label={row.typeName} totals={row.totals} />
                    ))
                  )}
                  <TotalsRow label="TOTAL" totals={metrics.vpermit4h.totals} />
                </tbody>
              </table>
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <section className="border border-grey-mid p-4">
              <h2 className="font-mono text-sm uppercase tracking-widest text-white">
                STAFF CARPARK
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Stat label="Active plates" value={metrics.staff.activePlates} />
                <Stat label="Entered" value={metrics.staff.entered} tone="text-success" />
                <Stat label="Awaiting entry" value={metrics.staff.awaitingEntry} tone="text-warning" />
                <Stat label="Pending requests" value={metrics.staff.pending} tone="text-warning" />
              </div>
            </section>

            <section className="border border-grey-mid p-4">
              <h2 className="font-mono text-sm uppercase tracking-widest text-white">MEMBERS</h2>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Stat label="Active members" value={metrics.members.members} />
                <Stat label="Saved plates" value={metrics.members.plates} />
              </div>
              <p className="mt-3 font-mono text-2xs uppercase text-grey-light">
                SAVED PLATES ARE NOT INCLUDED IN THE PLATE-ENTRY TOTAL.
              </p>
            </section>

            <section className="border border-grey-mid p-4">
              <h2 className="font-mono text-sm uppercase tracking-widest text-white">HEALTH</h2>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Stat label="Checks OK" value={metrics.health.ok} tone="text-success" />
                <Stat label="Checks failed" value={metrics.health.failed} tone="text-danger" />
              </div>
              <p className="mt-3 font-mono text-2xs uppercase text-grey-light">
                {metrics.health.lastCheckAt
                  ? `LAST CHECK ${new Date(metrics.health.lastCheckAt).toISOString().slice(0, 16).replace('T', ' ')} UTC — ${metrics.health.lastCheckOk ? 'OK' : 'FAILED'}`
                  : 'NO HEALTH CHECK HAS RUN YET.'}
              </p>
            </section>
          </div>

          <section className="border border-grey-mid p-4">
            <h2 className="font-mono text-sm uppercase tracking-widest text-white">
              FAILURE REASONS
            </h2>
            {metrics.vpermit4h.topFailures.length === 0 ? (
              <p className="mt-2 font-mono text-xs uppercase text-grey-light">
                NO FAILURES IN THIS RANGE.
              </p>
            ) : (
              <div className="mt-2 divide-y divide-grey-mid/60">
                {metrics.vpermit4h.topFailures.map((row) => (
                  <div key={row.message} className="flex items-center justify-between gap-3 py-2">
                    <span className="font-mono text-xs uppercase text-grey-light">{row.message}</span>
                    <span className="font-mono text-xs text-danger">{row.count}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="border border-grey-mid p-4">
            <h2 className="font-mono text-sm uppercase tracking-widest text-white">BY DAY</h2>
            {metrics.byDay.length === 0 ? (
              <p className="mt-2 font-mono text-xs uppercase text-grey-light">
                NO PARKING ACTIVITY IN THIS RANGE.
              </p>
            ) : (
              <table className="mt-2 w-full">
                <thead>
                  <tr className="border-b border-grey-mid text-left">
                    {['DATE', 'OK', 'ALREADY', 'FAILED'].map((head) => (
                      <th
                        key={head}
                        className="pb-1 pr-3 font-mono text-2xs uppercase tracking-wider text-grey-light"
                      >
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {metrics.byDay.map((row) => (
                    <tr key={row.date} className="border-b border-grey-mid/60">
                      <td className="py-2 pr-3 font-mono text-xs text-white">
                        {formatDateDMY(row.date)}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs text-success">{row.confirmed}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-warning">{row.already}</td>
                      <td className="py-2 font-mono text-xs text-danger">{row.failed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <p className="font-mono text-2xs uppercase text-grey-light">
            RANGE {range.toUpperCase()} · TIMEZONE {data?.range.timezone ?? '—'} · 90 MINUTE
            KIOSK ATTEMPTS STORE NO PLATE OR PLATE HASH.
          </p>
        </>
      ) : null}
    </div>
  )
}
