'use client'

import { useCallback, useEffect, useState } from 'react'
import { describePlateStatus, describeRequestStatus, requestKind } from '@/lib/staff-parking'

interface StaffRef {
  firstName: string
  lastName: string
}

interface StaffPlate {
  id: string
  staffId: string
  plate: string
  status: string
  enteredInSystem: boolean
  approvedAt: string | null
  createdAt: string
  staff?: StaffRef | null
}

interface StaffPlateRequest {
  id: string
  staffId: string
  plate: string
  previousPlate: string | null
  reason: string | null
  status: string
  reviewNote: string | null
  createdAt: string
  staff?: StaffRef | null
}

interface StaffPlatesData {
  requests: StaffPlateRequest[]
  plates: StaffPlate[]
  counts: { pending: number; toEnter: number; active: number }
  timezone: string
}

function staffName(staff: StaffRef | null | undefined): string {
  if (!staff) return 'UNKNOWN'
  return `${staff.firstName} ${staff.lastName}`.trim()
}

function formatDate(value: string | null, timezone: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-NZ', {
    timeZone: timezone,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

type PanelTab = 'approve' | 'enter' | 'all'

export function StaffPlatesPanel({ venueId }: { venueId: string }) {
  const [data, setData] = useState<StaffPlatesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<PanelTab>('approve')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/admin/parking/staff-plates?venueId=${encodeURIComponent(venueId)}`,
      )
      if (!res.ok) {
        setError('COULD NOT LOAD STAFF PLATES')
        return
      }
      setData(await res.json())
      setError('')
    } catch {
      setError('COULD NOT LOAD STAFF PLATES')
    } finally {
      setLoading(false)
    }
  }, [venueId])

  useEffect(() => {
    void load()
  }, [load])

  async function review(id: string, action: 'APPROVE' | 'REJECT') {
    setBusy(id)
    setError('')
    setMessage('')
    try {
      const res = await fetch(`/api/admin/parking/staff-plates/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note: notes[id] || undefined }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || 'COULD NOT SAVE THAT DECISION')
        return
      }
      setMessage(action === 'APPROVE' ? 'PLATE APPROVED' : 'REQUEST REJECTED')
      await load()
    } catch {
      setError('COULD NOT CONNECT — TRY AGAIN')
    } finally {
      setBusy(null)
    }
  }

  async function toggleEntered(plate: StaffPlate) {
    setBusy(plate.id)
    setError('')
    setMessage('')
    try {
      const res = await fetch(`/api/admin/parking/staff-plates/${plate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enteredInSystem: !plate.enteredInSystem }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || 'COULD NOT UPDATE THAT PLATE')
        return
      }
      await load()
    } catch {
      setError('COULD NOT CONNECT — TRY AGAIN')
    } finally {
      setBusy(null)
    }
  }

  const requests = data?.requests ?? []
  const plates = data?.plates ?? []
  const pending = requests.filter((row) => row.status === 'PENDING')
  const toEnter = plates.filter((row) => row.status === 'ACTIVE' && !row.enteredInSystem)
  const timezone = data?.timezone || 'Pacific/Auckland'

  return (
    <div className="space-y-3" id="staff-plates-panel">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="font-mono text-xs uppercase tracking-wider text-grey-light">
          STAFF NUMBER PLATES
        </h3>
        <span className="border border-warning/40 px-2 py-0.5 font-mono text-2xs uppercase text-warning">
          {data?.counts.pending ?? 0} TO APPROVE
        </span>
        <span className="border border-grey-mid px-2 py-0.5 font-mono text-2xs uppercase text-grey-light">
          {data?.counts.toEnter ?? 0} TO ENTER
        </span>
      </div>

      <div className="flex border border-grey-mid">
        {(
          [
            ['approve', `TO APPROVE (${pending.length})`],
            ['enter', `TO ENTER (${toEnter.length})`],
            ['all', 'ALL PLATES'],
          ] as [PanelTab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 border-r border-grey-mid px-2 py-2 font-mono text-2xs uppercase tracking-wider last:border-r-0 ${
              tab === id ? 'bg-white text-black' : 'text-grey-light'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : (
        <>
          {(tab === 'approve' || tab === 'all') && (
            <div className="space-y-2">
              {pending.length === 0 ? (
                <p className="font-mono text-xs text-grey-light">NOTHING WAITING FOR APPROVAL.</p>
              ) : (
                pending.map((row) => (
                  <div key={row.id} className="border border-grey-mid p-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-sm text-white">
                          {staffName(row.staff)} · {row.plate}
                        </p>
                        <p className="font-mono text-2xs uppercase text-grey-light">
                          {requestKind(row.previousPlate)}
                          {row.previousPlate ? ` FROM ${row.previousPlate}` : ''} ·{' '}
                          {formatDate(row.createdAt, timezone)}
                        </p>
                      </div>
                      <span className="shrink-0 border border-warning/40 px-2 py-0.5 font-mono text-2xs uppercase text-warning">
                        {describeRequestStatus(row.status)}
                      </span>
                    </div>
                    {row.reason && (
                      <p className="font-mono text-xs text-white">REASON: {row.reason}</p>
                    )}
                    <input
                      value={notes[row.id] ?? ''}
                      onChange={(e) =>
                        setNotes((current) => ({ ...current, [row.id]: e.target.value }))
                      }
                      placeholder="NOTE (OPTIONAL)"
                      className="w-full border border-grey-mid bg-black px-2 py-1.5 font-mono text-xs text-white outline-none focus:border-white"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => void review(row.id, 'APPROVE')}
                        disabled={busy === row.id}
                        className="border border-success py-2 font-mono text-xs font-bold uppercase text-success disabled:opacity-40"
                      >
                        APPROVE
                      </button>
                      <button
                        type="button"
                        onClick={() => void review(row.id, 'REJECT')}
                        disabled={busy === row.id}
                        className="border border-danger py-2 font-mono text-xs font-bold uppercase text-danger disabled:opacity-40"
                      >
                        REJECT
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {(tab === 'enter' || tab === 'all') && (
            <div className="border border-grey-mid">
              {toEnter.length === 0 && tab === 'enter' ? (
                <p className="px-3 py-3 font-mono text-xs text-grey-light">
                  EVERY APPROVED PLATE HAS BEEN ENTERED.
                </p>
              ) : (
                <div className="divide-y divide-grey-mid">
                  {(tab === 'enter' ? toEnter : plates).map((plate) => (
                    <label
                      key={plate.id}
                      className="flex cursor-pointer items-center gap-3 px-3 py-2"
                    >
                      <input
                        type="checkbox"
                        checked={plate.enteredInSystem}
                        onChange={() => void toggleEntered(plate)}
                        disabled={busy === plate.id || plate.status !== 'ACTIVE'}
                        className="h-5 w-5 accent-white"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-mono text-sm text-white">
                          {plate.plate} · {staffName(plate.staff)}
                        </span>
                        <span className="block font-mono text-2xs uppercase text-grey-light">
                          {describePlateStatus(plate.status)} ·{' '}
                          {plate.enteredInSystem ? 'IN THE SYSTEM' : 'NOT IN THE SYSTEM YET'}
                        </span>
                      </span>
                    </label>
                  ))}
                  {(tab === 'enter' ? toEnter : plates).length === 0 && (
                    <p className="px-3 py-3 font-mono text-xs text-grey-light">
                      NO PLATES YET.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === 'all' && (
            <div className="border border-grey-mid">
              <div className="border-b border-grey-mid px-3 py-2">
                <p className="font-mono text-2xs uppercase tracking-wider text-grey-light">
                  EVERY REQUEST
                </p>
              </div>
              <div className="divide-y divide-grey-mid">
                {requests.length === 0 && (
                  <p className="px-3 py-3 font-mono text-xs text-grey-light">NONE YET.</p>
                )}
                {requests.map((row) => (
                  <div key={row.id} className="px-3 py-2">
                    <p className="font-mono text-xs text-white">
                      {staffName(row.staff)} · {row.plate}
                      {row.previousPlate ? ` (WAS ${row.previousPlate})` : ''}
                    </p>
                    <p className="font-mono text-2xs uppercase text-grey-light">
                      {describeRequestStatus(row.status)} · {formatDate(row.createdAt, timezone)}
                      {row.reason ? ` · ${row.reason}` : ''}
                    </p>
                    {row.reviewNote && (
                      <p className="font-mono text-2xs text-grey-light">NOTE: {row.reviewNote}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {message && <p className="font-mono text-xs text-success">{message}</p>}
      {error && <p className="font-mono text-xs text-danger">{error}</p>}
    </div>
  )
}
