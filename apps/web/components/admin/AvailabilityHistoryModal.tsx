'use client'

// Availability HISTORY (#206) — one read-only popup over the audit trail that
// already exists on availability rows: every declaration day (including
// cancelled ones) and every edit request in every status (pending, applied,
// discarded, superseded and withdrawn). There is deliberately no second write
// path here — APPLY / DISCARD stay in the approvals queue. A pending request
// offers OPEN IN QUEUE, which hands the person back to the existing modal.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { CommentThread } from '@/components/ui/CommentThread'
import { AvailabilityBar } from '@/components/availability/AvailabilityBar'
import { AVAILABILITY_COMMENT_MAX_LENGTH } from '@/lib/availability-comments'
import { describeWindows, proposalToEntry, statusMeta } from '@/lib/availability'
import {
  AVAILABILITY_HISTORY_STATUSES,
  describeHistoryRequest,
  filterHistoryDays,
  filterHistoryRequests,
  historyRequestDates,
  historyRequestStatus,
  historyStatusMeta,
  historySummary,
  sortHistoryDays,
  sortHistoryRequests,
  type AvailabilityHistoryDay,
  type AvailabilityHistoryRequest,
  type AvailabilityHistoryStatus,
} from '@/lib/availability-history'
import { formatDateDayDMY, formatDateDMY, localDayKey, shiftDay } from '@/lib/date-nav'

const RANGES = [
  { key: 'PAST_30', label: 'LAST 30 DAYS', from: -29, to: 0 },
  { key: 'PAST_90', label: 'LAST 90 DAYS', from: -89, to: 0 },
  { key: 'PAST_365', label: 'LAST 365 DAYS', from: -364, to: 0 },
  { key: 'NEXT_90', label: 'TODAY → +90 DAYS', from: 0, to: 90 },
  { key: 'SPAN_180', label: 'LAST 90 → NEXT 90', from: -89, to: 90 },
] as const
type RangeKey = (typeof RANGES)[number]['key']
/** The API's own default window — no device clock involved. */
const DEFAULT_RANGE: RangeKey = 'PAST_90'

interface HistoryData {
  venueId: string
  today: string
  from: string
  to: string
  staff: { id: string; name: string }[]
  requests: AvailabilityHistoryRequest[]
  days: AvailabilityHistoryDay[]
  truncated: boolean
}

function when(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const time = d.toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit', hour12: true })
  return `${formatDateDMY(localDayKey(d))} ${time}`
}

function Comments({ comments }: { comments: AvailabilityHistoryRequest['comments'] }) {
  return (
    <CommentThread
      comments={comments.map((c) => ({ ...c, canDelete: false }))}
      loading={false}
      error=""
      canAdd={false}
      maxLength={AVAILABILITY_COMMENT_MAX_LENGTH}
      onAdd={async () => false}
      onDelete={async () => undefined}
    />
  )
}

export function AvailabilityHistoryModal({
  isOpen,
  onClose,
  venueId,
  initialStaffId = null,
  onOpenQueue,
}: {
  isOpen: boolean
  onClose: () => void
  venueId: string
  /** Open with this person's history selected (from the person approvals modal). */
  initialStaffId?: string | null
  /** A PENDING request asks the queue to open that person; the parent switches modals. */
  onOpenQueue?: (staffId: string) => void
}) {
  const [data, setData] = useState<HistoryData | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'REQUESTS' | 'DAYS'>('REQUESTS')
  const [staffFilter, setStaffFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState<AvailabilityHistoryStatus | 'ALL'>('ALL')
  const [rangeKey, setRangeKey] = useState<RangeKey>(DEFAULT_RANGE)
  /** Venue-local today from the server — never the device's day. */
  const [today, setToday] = useState<string | null>(null)
  const [includeDeleted, setIncludeDeleted] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const loadedRef = useRef(false)

  useEffect(() => {
    if (!isOpen) return
    setStaffFilter(initialStaffId ?? 'ALL')
    setStatusFilter('ALL')
    setExpanded(new Set())
  }, [isOpen, initialStaffId])

  // Filters are sent to the route as well as applied client-side, so a narrow
  // view cannot be under-reported by the request/comment caps. The client
  // filter keeps the list responsive while a filter-driven refetch lands.
  const query = useMemo(() => {
    const range = RANGES.find((r) => r.key === rangeKey) ?? RANGES[1]
    const params = new URLSearchParams({
      venueId,
      includeDeleted: includeDeleted ? '1' : '0',
    })
    if (rangeKey !== DEFAULT_RANGE) {
      // A forward-reaching range needs the server's today; wait for it rather
      // than computing the window from the device clock.
      if (!today) return null
      params.set('from', shiftDay(today, range.from))
      params.set('to', shiftDay(today, range.to))
    }
    if (staffFilter !== 'ALL') params.set('staffId', staffFilter)
    if (statusFilter !== 'ALL') params.set('status', statusFilter)
    return `/api/admin/availability/history?${params.toString()}`
  }, [venueId, rangeKey, today, includeDeleted, staffFilter, statusFilter])

  useEffect(() => {
    if (!isOpen || !query) return
    let cancelled = false
    if (loadedRef.current) setRefreshing(true)
    else setLoading(true)
    setError('')
    fetch(query)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}))
        if (cancelled) return
        if (!r.ok) {
          setError((body.error ?? 'COULD NOT LOAD HISTORY').toUpperCase())
          setData(null)
          loadedRef.current = false
          return
        }
        setData(body as HistoryData)
        if (body.today) setToday(body.today)
        loadedRef.current = true
      })
      .catch(() => {
        if (cancelled) return
        setError('COULD NOT LOAD HISTORY')
        loadedRef.current = false
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
        setRefreshing(false)
      })
    return () => { cancelled = true }
  }, [isOpen, query])

  const requests = useMemo(
    () => (data ? sortHistoryRequests(filterHistoryRequests(data.requests ?? [], {
      staffId: staffFilter === 'ALL' ? null : staffFilter,
      status: statusFilter,
      includeWithdrawn: includeDeleted,
    })) : []),
    [data, staffFilter, statusFilter, includeDeleted],
  )

  const days = useMemo(
    () => (data ? sortHistoryDays(filterHistoryDays(data.days ?? [], {
      staffId: staffFilter === 'ALL' ? null : staffFilter,
      includeCancelled: includeDeleted,
    })) : []),
    [data, staffFilter, includeDeleted],
  )

  const summary = useMemo(
    () => historySummary(data?.requests ?? [], data?.days ?? []),
    [data],
  )

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function dayFor(staffId: string, date: string): AvailabilityHistoryDay | null {
    return data?.days.find((d) => d.staffId === staffId && d.date === date) ?? null
  }

  function renderRequest(req: AvailabilityHistoryRequest) {
    const open = expanded.has(req.id)
    const status = historyRequestStatus(req)
    const meta = historyStatusMeta(status)
    const targetDates = historyRequestDates(req)
    const current = dayFor(req.staffId, req.date)
    const proposed = proposalToEntry({
      date: req.date,
      staffId: req.staffId,
      payload: { action: req.action, availability: req.payload?.availability },
      seriesId: req.seriesId,
      status: 'PENDING',
    })
    return (
      <div key={req.id} className="border border-grey-mid">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => toggle(req.id)}
          className="w-full px-3 py-2 text-left hover:bg-grey-dark/40 transition-colors"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs uppercase text-white">{req.staffName}</span>
              <span className={`font-mono text-2xs uppercase px-1.5 py-0.5 border ${meta.badge}`}>{meta.label}</span>
              <span className="font-mono text-2xs uppercase text-grey-light">{formatDateDayDMY(req.date)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-2xs uppercase text-accent">{describeHistoryRequest(req)}</span>
              <span className="font-mono text-2xs uppercase text-grey-light">
                {targetDates.length} DAY{targetDates.length === 1 ? '' : 'S'}
              </span>
              <span className="font-mono text-2xs uppercase text-grey-light">{open ? '▲' : '▼'}</span>
            </div>
          </div>
          <p className="font-mono text-2xs uppercase text-grey-light mt-1">
            FILED {when(req.createdAt)}
            {req.reviewedByLabel ? ` · ${req.reviewedByLabel}${req.reviewedAt ? ` ${when(req.reviewedAt)}` : ''}` : ''}
          </p>
        </button>

        {open && (
          <div className="border-t border-grey-mid p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-1">
              <span className="font-mono text-2xs uppercase tracking-wider text-grey-light">TARGET DAYS:</span>
              {targetDates.map((d) => (
                <span key={d} className="inline-flex items-center border border-grey-mid px-1.5 py-0.5 font-mono text-2xs uppercase text-white">
                  {formatDateDayDMY(d)}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <div className="border border-grey-mid p-2 space-y-1">
                <div className="font-mono text-2xs uppercase tracking-wider text-grey-light">CURRENT DAY</div>
                {current ? (
                  <>
                    <AvailabilityBar windows={current.windows} isAllDay={current.isAllDay} type={current.type} labelled showType />
                    <p className="font-mono text-2xs uppercase text-grey-light">{describeWindows(current.windows, current.isAllDay, current.type)}</p>
                    {current.cancelled && <p className="font-mono text-2xs uppercase text-danger">DECLARATION CANCELLED</p>}
                  </>
                ) : (
                  <p className="font-mono text-2xs uppercase text-grey-light">NO DAY RECORD IN THIS RANGE.</p>
                )}
              </div>
              <div className="border border-grey-mid p-2 space-y-1">
                <div className="font-mono text-2xs uppercase tracking-wider text-accent">PROPOSED</div>
                {req.action === 'CLEAR' ? (
                  <p className="font-mono text-xs uppercase text-danger">{describeHistoryRequest(req)}</p>
                ) : proposed ? (
                  <>
                    <AvailabilityBar windows={proposed.windows} isAllDay={proposed.isAllDay} type={proposed.type} labelled showType />
                    <p className="font-mono text-2xs uppercase text-grey-light">{describeWindows(proposed.windows, proposed.isAllDay, proposed.type)}</p>
                  </>
                ) : (
                  <p className="font-mono text-2xs uppercase text-grey-light">—</p>
                )}
              </div>
            </div>

            <dl className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              <div>
                <dt className="font-mono text-2xs uppercase text-grey-light">REVIEWED BY</dt>
                <dd className="font-mono text-2xs uppercase text-white">
                  {req.reviewedByLabel ?? (status === 'PENDING' ? 'NOT YET REVIEWED' : '—')}
                  {req.reviewedAt ? ` · ${when(req.reviewedAt)}` : ''}
                </dd>
              </div>
              <div>
                <dt className="font-mono text-2xs uppercase text-grey-light">FILED</dt>
                <dd className="font-mono text-2xs uppercase text-white">{when(req.createdAt)}</dd>
              </div>
            </dl>

            {req.reviewNote && (
              <p className="font-mono text-2xs uppercase text-grey-light border-l border-grey-mid pl-2">NOTE: {req.reviewNote}</p>
            )}
            {req.reason && (
              <p className="font-mono text-2xs uppercase text-grey-light border-l border-grey-mid pl-2">REASON: {req.reason}</p>
            )}

            <Comments comments={req.comments} />

            {status === 'PENDING' && onOpenQueue && (
              <button
                type="button"
                onClick={() => onOpenQueue(req.staffId)}
                className="h-9 px-3 border border-accent text-accent font-mono text-xs uppercase hover:bg-accent hover:text-black transition-colors"
              >
                OPEN IN QUEUE
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  function renderDay(day: AvailabilityHistoryDay) {
    const key = day.id ?? `${day.staffId}:${day.date}`
    const open = expanded.has(key)
    const meta = statusMeta(day.status)
    const actor = day.reviewedByName
    return (
      <div key={key} className="border border-grey-mid">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => toggle(key)}
          className={`w-full px-3 py-2 text-left hover:bg-grey-dark/40 transition-colors ${day.cancelled ? 'opacity-80' : ''}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs uppercase text-white">{day.staffName}</span>
              <span className="font-mono text-2xs uppercase text-grey-light">{formatDateDayDMY(day.date)}</span>
              <span className={`font-mono text-2xs uppercase px-1.5 py-0.5 border ${meta.badge}`}>{meta.label}</span>
              {day.cancelled && (
                <span className="font-mono text-2xs uppercase px-1.5 py-0.5 border border-grey-mid text-accent">CANCELLED</span>
              )}
              {day.lockedAt && (
                <span className="font-mono text-2xs uppercase px-1.5 py-0.5 border border-danger text-danger">LOCKED</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-2xs uppercase text-grey-light">{describeWindows(day.windows, day.isAllDay, day.type)}</span>
              <span className="font-mono text-2xs uppercase text-grey-light">{open ? '▲' : '▼'}</span>
            </div>
          </div>
          {(day.notes || day.timeOff) && (
            <p className="font-mono text-2xs uppercase text-grey-light mt-1 truncate">
              {day.timeOff ? 'TIME OFF · ' : ''}{day.notes ?? ''}
            </p>
          )}
        </button>

        {open && (
          <div className="border-t border-grey-mid p-3 space-y-3">
            <AvailabilityBar windows={day.windows} isAllDay={day.isAllDay} type={day.type} labelled showType />
            <dl className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              <div>
                <dt className="font-mono text-2xs uppercase text-grey-light">REVIEWED BY</dt>
                <dd className="font-mono text-2xs uppercase text-white">
                  {actor ?? '—'}{day.reviewedAt ? ` · ${when(day.reviewedAt)}` : ''}
                </dd>
              </div>
              <div>
                <dt className="font-mono text-2xs uppercase text-grey-light">LOCK</dt>
                <dd className="font-mono text-2xs uppercase text-white">
                  {day.lockedAt ? `${day.lockedByName ?? 'REMOVED STAFF'}${day.lockedAt ? ` · ${when(day.lockedAt)}` : ''}` : 'NOT LOCKED'}
                </dd>
              </div>
            </dl>
            {day.lockedReason && (
              <p className="font-mono text-2xs uppercase text-grey-light border-l border-grey-mid pl-2">LOCK REASON: {day.lockedReason}</p>
            )}
            {day.reviewNote && (
              <p className="font-mono text-2xs uppercase text-grey-light border-l border-grey-mid pl-2">REVIEW NOTE: {day.reviewNote}</p>
            )}
            {day.reason && (
              <p className="font-mono text-2xs uppercase text-grey-light border-l border-grey-mid pl-2">WORKER REASON: {day.reason}</p>
            )}
            <Comments comments={day.comments} />
          </div>
        )}
      </div>
    )
  }

  const rows = tab === 'REQUESTS' ? requests : days

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="AVAILABILITY HISTORY" size="xl">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('REQUESTS')}
            className={`font-mono text-xs uppercase px-3 py-1.5 border transition-colors ${
              tab === 'REQUESTS' ? 'bg-white text-black border-white' : 'text-grey-light border-grey-mid hover:border-white hover:text-white'
            }`}
          >
            REQUESTS ({summary.requests})
          </button>
          <button
            type="button"
            onClick={() => setTab('DAYS')}
            className={`font-mono text-xs uppercase px-3 py-1.5 border transition-colors ${
              tab === 'DAYS' ? 'bg-white text-black border-white' : 'text-grey-light border-grey-mid hover:border-white hover:text-white'
            }`}
          >
            DAYS ({summary.days})
          </button>
          <span className="font-mono text-2xs uppercase text-grey-light">
            READ ONLY — THIS IS THE RECORD, NOT AN ACTION SCREEN.
          </span>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-2xs uppercase text-grey-light">STAFF</span>
            <select
              value={staffFilter}
              onChange={(e) => setStaffFilter(e.target.value)}
              aria-label="Filter history by staff"
              className="bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white"
            >
              <option value="ALL">ALL STAFF</option>
              {(data?.staff ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>

          {tab === 'REQUESTS' && (
            <label className="flex flex-col gap-1">
              <span className="font-mono text-2xs uppercase text-grey-light">STATUS</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as AvailabilityHistoryStatus | 'ALL')}
                aria-label="Filter history by status"
                className="bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white"
              >
                <option value="ALL">ALL STATUSES</option>
                {AVAILABILITY_HISTORY_STATUSES.map((s) => (
                  <option key={s} value={s}>{historyStatusMeta(s).label}</option>
                ))}
              </select>
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className="font-mono text-2xs uppercase text-grey-light">RANGE</span>
            <select
              value={rangeKey}
              disabled={!today}
              title={today ? 'CHANGE THE WINDOW' : 'LOADING THE VENUE DATE'}
              onChange={(e) => setRangeKey(e.target.value as RangeKey)}
              aria-label="Filter history by date range"
              className="bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white disabled:opacity-40"
            >
              {RANGES.map((r) => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 border border-grey-mid px-2 py-1.5">
            <input
              type="checkbox"
              checked={includeDeleted}
              onChange={(e) => setIncludeDeleted(e.target.checked)}
              className="accent-white"
            />
            <span className="font-mono text-2xs uppercase text-grey-light">SHOW WITHDRAWN / REMOVED / CANCELLED</span>
          </label>
        </div>

        {data && (
          <p className="font-mono text-2xs uppercase text-grey-light">
            WINDOW {formatDateDMY(data.from)} → {formatDateDMY(data.to)} · VENUE-LOCAL TODAY {formatDateDMY(data.today)}
          </p>
        )}

        {error && (
          <p className="border border-danger/50 bg-danger/10 px-3 py-2 font-mono text-xs text-danger">{error}</p>
        )}

        {refreshing && !loading && (
          <p className="font-mono text-2xs uppercase text-grey-light loading-cursor">REFRESHING…</p>
        )}

        {loading ? (
          <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
        ) : rows.length === 0 ? (
          <p className="font-mono text-xs uppercase text-grey-light">NO HISTORY FOR THIS RANGE.</p>
        ) : (
          <div className="space-y-2">
            {tab === 'REQUESTS'
              ? requests.map((req) => renderRequest(req))
              : days.map((day) => renderDay(day))}
          </div>
        )}

        {data?.truncated && (
          <p className="font-mono text-2xs uppercase text-warning border border-warning/50 bg-warning/10 px-2 py-1.5">
            THIS RANGE HOLDS MORE HISTORY THAN ONE VIEW — NARROW THE RANGE TO SEE THE REST.
          </p>
        )}

        <p className="font-mono text-2xs uppercase text-grey-light">
          HISTORY SHOWS EVERY DECLARATION AND EDIT REQUEST, INCLUDING WITHDRAWN AND CANCELLED ROWS. EARLIER
          DAY VALUES OVERWRITTEN IN PLACE ARE NOT RECOVERABLE — THE CURRENT DAY AND THE REQUEST ARE THE RECORD.
        </p>
      </div>
    </Modal>
  )
}
