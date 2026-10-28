'use client'

// Training STATUS board — who needs training follow-up today. On-shift staff
// first (managers can catch them in person), then everyone else. Green = good,
// yellow = bits to work on, red = retraining or overdue follow-ups.

import { useEffect, useState } from 'react'
import { getActiveVenueId } from '@/lib/active-venue'
import { groupByPosition } from '@/lib/staff-groups'
import { sortTrainingRows, type TrainingLevel } from '@/lib/training-status'
import { StaffGuidesModal } from '@/components/admin/StaffGuidesModal'

interface Row {
  id: string
  name: string
  positions: string[]
  positionIds: string[]
  onShift: boolean
  requiredCount: number
  completedCount: number
  missingCount: number
  staleCount: number
  missingGuides: string[]
  staleGuides: string[]
  openFollowUps: number
  level: TrainingLevel
}

interface SectionReview {
  id: string
  staffName: string
  sectionName: string
  source: 'GUIDES' | 'PATHWAY'
  status: 'PENDING' | 'CONFIRMED' | 'DISMISSED'
  evidenceLabel: string
  requestedAt: string
  note: string | null
}

interface Payload {
  venueName: string
  date: string
  staff: Row[]
  positions: { id: string; name: string; colour: string | null }[]
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
  const [pendingReviews, setPendingReviews] = useState<SectionReview[]>([])
  const [dismissedReviews, setDismissedReviews] = useState<SectionReview[]>([])
  const [showDismissed, setShowDismissed] = useState(false)
  const [busyReviewId, setBusyReviewId] = useState<string | null>(null)
  const [reviewsError, setReviewsError] = useState('')
  const [manageStaff, setManageStaff] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setReviewsError('')
      const venueQuery = venueId ? `?venueId=${encodeURIComponent(venueId)}` : ''
      const [statusRes, reviewsRes] = await Promise.all([
        fetch(`/api/admin/training/status${venueQuery}`),
        fetch(`/api/admin/section-work${venueQuery ? `${venueQuery}&status=ALL` : '?status=ALL'}`),
      ])
      if (statusRes.ok) {
        setData((await statusRes.json()) as Payload)
      }
      if (reviewsRes.ok) {
        const payload = (await reviewsRes.json()) as { reviews?: SectionReview[] }
        const reviews = payload.reviews ?? []
        setPendingReviews(reviews.filter((r) => r.status === 'PENDING'))
        setDismissedReviews(reviews.filter((r) => r.status === 'DISMISSED'))
      } else {
        setPendingReviews([])
        setDismissedReviews([])
        setReviewsError(`COULD NOT LOAD SECTION REVIEWS (${reviewsRes.status})`)
      }
      setLoading(false)
    }
    load()
  }, [venueId])

  async function actOnReview(review: SectionReview, action: 'CONFIRM' | 'DISMISS' | 'REOPEN') {
    setBusyReviewId(review.id)
    setReviewsError('')
    try {
      const r = await fetch(`/api/admin/section-work/${review.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!r.ok) {
        const payload = (await r.json().catch(() => ({}))) as { error?: string }
        setReviewsError(
          `${action} FAILED — ${r.status}${payload.error ? ` · ${payload.error.toUpperCase()}` : ''}`,
        )
        return
      }

      if (action === 'CONFIRM') {
        setPendingReviews((prev) => prev.filter((x) => x.id !== review.id))
      } else if (action === 'DISMISS') {
        setPendingReviews((prev) => prev.filter((x) => x.id !== review.id))
        setDismissedReviews((prev) => [{ ...review, status: 'DISMISSED' }, ...prev])
      } else {
        setDismissedReviews((prev) => prev.filter((x) => x.id !== review.id))
        setPendingReviews((prev) => [{ ...review, status: 'PENDING' }, ...prev])
      }
    } finally {
      setBusyReviewId(null)
    }
  }

  if (loading) {
    return <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
  }
  if (!data) {
    return <p className="font-mono text-xs text-danger">COULD NOT LOAD TRAINING STATUS.</p>
  }

  // Same derived-position grouping as availability/roster. The server already
  // sorts on-shift first; re-apply it per group so the order holds inside each
  // position bucket too.
  const groups = groupByPosition(
    data.staff,
    data.positions ?? [],
    (s) => s.positionIds,
  ).map((g) => ({ ...g, items: sortTrainingRows(g.items) }))

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
            {s.onShift && (
              <span className="font-mono text-xs uppercase border border-info/60 text-info px-1.5 py-0.5">
                ON SHIFT
              </span>
            )}
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

        {s.missingGuides.length > 0 && (
          <p className="mt-1.5 font-mono text-2xs uppercase text-warning">
            TO DO: {s.missingGuides.join(' · ')}
          </p>
        )}
        {s.staleGuides.length > 0 && (
          <p className="mt-1.5 font-mono text-2xs uppercase text-danger">
            RETRAIN: {s.staleGuides.join(' · ')}
          </p>
        )}

        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => setManageStaff({ id: s.id, name: s.name })}
            className="font-mono text-xs uppercase border border-grey-mid px-3 py-1.5 text-white hover:border-white transition-colors"
          >
            MANAGE GUIDES →
          </button>
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
        <h2 className="font-mono text-xs uppercase tracking-widest text-grey-light">
          SECTION REVIEWS ({pendingReviews.length})
        </h2>
        {reviewsError && <p className="font-mono text-xs text-danger">{reviewsError}</p>}
        {pendingReviews.length === 0 ? (
          <p className="font-mono text-xs text-grey-light">NO SECTIONS AWAITING CONFIRMATION.</p>
        ) : (
          pendingReviews.map((review) => (
            <div key={review.id} className="border border-grey-mid border-l-4 border-l-warning bg-grey-dark p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <span className="font-mono text-sm uppercase text-white">{review.staffName}</span>
                  <span className="font-mono text-xs uppercase text-grey-light"> → {review.sectionName}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-mono text-xs uppercase border border-grey-mid text-grey-light px-1.5 py-0.5">
                    {review.source}
                  </span>
                  <span className="font-mono text-xs uppercase border border-warning/60 text-warning px-1.5 py-0.5">
                    {review.evidenceLabel}
                  </span>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  disabled={busyReviewId === review.id}
                  onClick={() => actOnReview(review, 'CONFIRM')}
                  className="font-mono text-xs uppercase font-semibold tracking-wider px-3 py-1.5 border bg-white text-black border-white disabled:opacity-40"
                >
                  CONFIRM
                </button>
                <button
                  type="button"
                  disabled={busyReviewId === review.id}
                  onClick={() => actOnReview(review, 'DISMISS')}
                  className="font-mono text-xs uppercase font-semibold tracking-wider px-3 py-1.5 border border-grey-mid text-white hover:border-white disabled:opacity-40"
                >
                  DISMISS
                </button>
              </div>
            </div>
          ))
        )}

        {dismissedReviews.length > 0 && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowDismissed((v) => !v)}
              className="font-mono text-xs uppercase tracking-widest text-grey-light hover:text-white"
            >
              DISMISSED REVIEWS ({dismissedReviews.length}) {showDismissed ? 'HIDE' : 'SHOW'}
            </button>
            {showDismissed &&
              dismissedReviews.map((review) => (
                <div key={review.id} className="border border-grey-mid bg-black p-3 flex items-center justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <span className="font-mono text-xs uppercase text-grey-light">{review.staffName}</span>
                    <span className="font-mono text-xs uppercase text-grey-light"> → {review.sectionName}</span>
                    <span className="font-mono text-xs uppercase text-grey-light"> · {review.evidenceLabel}</span>
                  </div>
                  <button
                    type="button"
                    disabled={busyReviewId === review.id}
                    onClick={() => actOnReview(review, 'REOPEN')}
                    className="font-mono text-xs uppercase font-semibold tracking-wider px-3 py-1.5 border border-grey-mid text-white hover:border-white disabled:opacity-40"
                  >
                    REOPEN
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>

      {groups.length === 0 ? (
        <p className="font-mono text-xs text-grey-light">NO ACTIVE STAFF FOR THIS VENUE.</p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.key} className="space-y-2">
              <h2 className="flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-widest text-grey-light">
                <span>{g.label} ({g.items.length})</span>
                <span>· {g.items.filter((i) => i.onShift).length} ON SHIFT</span>
              </h2>
              {g.items.map(row)}
            </div>
          ))}
        </div>
      )}

      {manageStaff && (
        <StaffGuidesModal
          staffId={manageStaff.id}
          staffName={manageStaff.name}
          onClose={() => setManageStaff(null)}
        />
      )}
    </div>
  )
}
