'use client'

// Training STATUS board — who needs training follow-up today. On-shift staff
// first (managers can catch them in person), then everyone else. Green = good,
// yellow = bits to work on, red = retraining or overdue follow-ups.

import { useEffect, useState } from 'react'
import { getActiveVenueId } from '@/lib/active-venue'
import type { TrainingLevel } from '@/lib/training-status'

interface Row {
  id: string
  name: string
  positions: string[]
  onShift: boolean
  requiredCount: number
  completedCount: number
  missingCount: number
  staleCount: number
  openFollowUps: number
  level: TrainingLevel
}

interface Payload {
  venueName: string
  date: string
  staff: Row[]
  summary: { green: number; yellow: number; red: number }
}

const LEVEL_ACCENT: Record<TrainingLevel, string> = {
  GREEN: 'border-l-success',
  YELLOW: 'border-l-warning',
  RED: 'border-l-danger',
}

const LEVEL_CHIP: Record<TrainingLevel, string> = {
  GREEN: 'border-success text-success',
  YELLOW: 'border-warning text-warning',
  RED: 'border-danger text-danger',
}

export function TrainingStatusClient({
  role,
  sessionVenueId,
  defaultVenueId,
}: {
  role: string
  sessionVenueId: string
  defaultVenueId?: string
}) {
  const [venueId] = useState(() => getActiveVenueId(role, sessionVenueId, defaultVenueId))
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const r = await fetch(`/api/admin/training/status${venueId ? `?venueId=${encodeURIComponent(venueId)}` : ''}`)
      if (r.ok) setData(await r.json())
      setLoading(false)
    }
    load()
  }, [venueId])

  if (loading) {
    return <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
  }
  if (!data) {
    return <p className="font-mono text-xs text-danger">COULD NOT LOAD TRAINING STATUS.</p>
  }

  const onShift = data.staff.filter((s) => s.onShift)
  const offShift = data.staff.filter((s) => !s.onShift)

  const row = (s: Row) => {
    const pct = s.requiredCount > 0 ? Math.round((s.completedCount / s.requiredCount) * 100) : 100
    return (
      <div key={s.id} className={`border border-grey-mid border-l-4 ${LEVEL_ACCENT[s.level]} bg-grey-dark p-3`}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="font-mono text-sm uppercase text-white">{s.name}</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {s.positions.map((p) => (
              <span key={p} className="font-mono text-xs uppercase border border-grey-mid text-grey-light px-1.5 py-0.5">
                {p}
              </span>
            ))}
            <span className={`font-mono text-xs uppercase border px-1.5 py-0.5 ${LEVEL_CHIP[s.level]}`}>
              {s.level === 'GREEN' ? '✓ ALL GOOD' : s.level === 'YELLOW' ? 'NEEDS ATTENTION' : 'ACTION NEEDED'}
            </span>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-black border border-grey-mid">
            <div
              className={`h-full ${s.level === 'GREEN' ? 'bg-success' : s.level === 'YELLOW' ? 'bg-warning' : 'bg-danger'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="font-mono text-xs text-grey-light shrink-0">
            {s.completedCount}/{s.requiredCount} TRAINED
          </span>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {s.missingCount > 0 && (
            <span className="font-mono text-xs uppercase border border-warning/60 text-warning px-1.5 py-0.5">
              {s.missingCount} TO DO
            </span>
          )}
          {s.staleCount > 0 && (
            <span className="font-mono text-xs uppercase border border-danger/60 text-danger px-1.5 py-0.5">
              {s.staleCount} RETRAIN
            </span>
          )}
          {s.openFollowUps > 0 && (
            <span className="font-mono text-xs uppercase border border-danger/60 text-danger px-1.5 py-0.5">
              {s.openFollowUps} FOLLOW-UP{s.openFollowUps !== 1 ? 'S' : ''}
            </span>
          )}
          {s.missingCount === 0 && s.staleCount === 0 && s.openFollowUps === 0 && (
            <span className="font-mono text-xs uppercase text-grey-light">NO OUTSTANDING TRAINING</span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">TRAINING STATUS</h1>
        <span className="font-mono text-xs uppercase text-grey-light">{data.venueName} · {data.date}</span>
      </div>

      <div className="flex gap-2 flex-wrap">
        <span className="font-mono text-xs uppercase border border-success px-2 py-1 text-success">{data.summary.green} ON TRACK</span>
        <span className="font-mono text-xs uppercase border border-warning px-2 py-1 text-warning">{data.summary.yellow} NEEDS ATTENTION</span>
        <span className="font-mono text-xs uppercase border border-danger px-2 py-1 text-danger">{data.summary.red} ACTION NEEDED</span>
      </div>

      <div className="space-y-2">
        <h2 className="font-mono text-xs uppercase tracking-widest text-grey-light">ON SHIFT TODAY ({onShift.length})</h2>
        {onShift.length === 0 ? (
          <p className="font-mono text-xs text-grey-light">NOBODY PUBLISHED ON SHIFT TODAY.</p>
        ) : (
          onShift.map(row)
        )}
      </div>

      <div className="space-y-2">
        <h2 className="font-mono text-xs uppercase tracking-widest text-grey-light">NOT ON SHIFT ({offShift.length})</h2>
        {offShift.length === 0 ? (
          <p className="font-mono text-xs text-grey-light">EVERYONE IS ON SHIFT TODAY.</p>
        ) : (
          offShift.map(row)
        )}
      </div>
    </div>
  )
}
