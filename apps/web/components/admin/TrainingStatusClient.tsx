'use client'

// Training STATUS board — who needs training follow-up today. On-shift staff
// first (managers can catch them in person), then everyone else. Green = good,
// yellow = bits to work on, red = retraining or overdue follow-ups.

import { useEffect, useMemo, useState } from 'react'
import { getActiveVenueId } from '@/lib/active-venue'
import { groupByPosition } from '@/lib/staff-groups'
import { sortTrainingRows, type TrainingLevel } from '@/lib/training-status'
import {
  filterWarnings,
  sortWarnings,
  warningSummary,
  WARNING_KIND_LABELS,
  type GuideWarning,
  type WarningKind,
  type WarningSeverity,
  type WarningSort,
} from '@/lib/guide-warnings'
import { StaffGuidesModal } from '@/components/admin/StaffGuidesModal'
import { RetrainRequestModal } from '@/components/admin/RetrainRequestModal'
import { Select } from '@/components/ui/Select'

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

interface WarningFolder { id: string; name: string; sortOrder: number }
interface WarningGuideOption { id: string; title: string; folderId: string | null }

const WARNING_SORT_OPTIONS: { value: WarningSort; label: string }[] = [
  { value: 'severity', label: 'MOST URGENT' },
  { value: 'oldest', label: 'OLDEST FIRST' },
  { value: 'person', label: 'PERSON' },
  { value: 'guide', label: 'GUIDE' },
]

const WARNING_BORDER: Record<WarningSeverity, string> = {
  CRITICAL: 'border-l-danger bg-danger/10',
  WARNING: 'border-l-warning',
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
  const [warnings, setWarnings] = useState<GuideWarning[]>([])
  const [warningFolders, setWarningFolders] = useState<WarningFolder[]>([])
  const [warningStaff, setWarningStaff] = useState<{ id: string; name: string }[]>([])
  const [warningGuides, setWarningGuides] = useState<WarningGuideOption[]>([])
  const [canAssign, setCanAssign] = useState(false)
  const [warningsError, setWarningsError] = useState('')
  const [busyWarningId, setBusyWarningId] = useState<string | null>(null)
  const [kindFilter, setKindFilter] = useState<WarningKind | 'ALL'>('ALL')
  const [severityFilter, setSeverityFilter] = useState<WarningSeverity | 'ALL'>('ALL')
  const [folderFilter, setFolderFilter] = useState<string>('ALL')
  const [personFilter, setPersonFilter] = useState<string>('ALL')
  const [warningSort, setWarningSort] = useState<WarningSort>('severity')
  const [retrainModal, setRetrainModal] = useState<{ staffId?: string; guideIds?: string[] } | null>(null)

  async function loadWarnings() {
    const venueQuery = venueId ? `?venueId=${encodeURIComponent(venueId)}` : ''
    const res = await fetch(`/api/admin/guide-warnings${venueQuery}`)
    if (!res.ok) {
      setWarnings([])
      setWarningsError(`COULD NOT LOAD WARNINGS (${res.status})`)
      return
    }
    const payload = (await res.json()) as {
      warnings?: GuideWarning[]
      folders?: WarningFolder[]
      staff?: { id: string; name: string }[]
      guides?: WarningGuideOption[]
      canAssign?: boolean
    }
    setWarnings(payload.warnings ?? [])
    setWarningFolders(payload.folders ?? [])
    setWarningStaff(payload.staff ?? [])
    setWarningGuides(payload.guides ?? [])
    setCanAssign(!!payload.canAssign)
    setWarningsError('')
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      setReviewsError('')
      const venueQuery = venueId ? `?venueId=${encodeURIComponent(venueId)}` : ''
      const [statusRes, reviewsRes] = await Promise.all([
        fetch(`/api/admin/training/status${venueQuery}`),
        fetch(`/api/admin/section-work${venueQuery ? `${venueQuery}&status=ALL` : '?status=ALL'}`),
        loadWarnings(),
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
  }, [venueId]) // eslint-disable-line react-hooks/exhaustive-deps

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

  async function markRetrained(warning: GuideWarning) {
    if (!warning.guideId) return
    setBusyWarningId(warning.id)
    setWarningsError('')
    try {
      const r = await fetch('/api/admin/guides/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guideId: warning.guideId, staffId: warning.staffId }),
      })
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { error?: string }
        setWarningsError((d.error ?? 'COULD NOT MARK RETRAINED').toUpperCase())
        return
      }
      if (warning.requestId) {
        await fetch(`/api/admin/guide-retrain/${warning.requestId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'RESOLVE' }),
        })
      }
      await loadWarnings()
    } finally {
      setBusyWarningId(null)
    }
  }

  async function dismissWarning(warning: GuideWarning) {
    if (!warning.requestId) return
    setBusyWarningId(warning.id)
    setWarningsError('')
    try {
      const r = await fetch(`/api/admin/guide-retrain/${warning.requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'DISMISS' }),
      })
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { error?: string }
        setWarningsError((d.error ?? 'COULD NOT DISMISS').toUpperCase())
        return
      }
      await loadWarnings()
    } finally {
      setBusyWarningId(null)
    }
  }

  const visibleWarnings = useMemo(
    () =>
      sortWarnings(
        filterWarnings(warnings, {
          kind: kindFilter,
          severity: severityFilter,
          folderId: folderFilter,
          staffId: personFilter === 'ALL' ? undefined : personFilter,
        }),
        warningSort,
      ),
    [warnings, kindFilter, severityFilter, folderFilter, personFilter, warningSort],
  )
  const warningCounts = warningSummary(visibleWarnings)

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
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-mono text-xs uppercase tracking-widest text-grey-light">
            WARNINGS ({warnings.length})
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-2xs uppercase text-danger">
              {warningCounts.critical} URGENT
            </span>
            {canAssign && (
              <button
                type="button"
                onClick={() => setRetrainModal({})}
                className="font-mono text-xs uppercase border border-warning/60 px-2.5 py-1 text-warning hover:border-warning transition-colors"
              >
                MARK FOR RETRAINING
              </button>
            )}
          </div>
        </div>

        {warningsError && <p className="font-mono text-xs text-danger">{warningsError}</p>}

        {warnings.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
            <Select
              label="KIND"
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as WarningKind | 'ALL')}
              options={[
                { value: 'ALL', label: 'ALL KINDS' },
                ...Object.entries(WARNING_KIND_LABELS).map(([value, label]) => ({ value, label })),
              ]}
            />
            <Select
              label="SEVERITY"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as WarningSeverity | 'ALL')}
              options={[
                { value: 'ALL', label: 'ALL' },
                { value: 'CRITICAL', label: 'URGENT' },
                { value: 'WARNING', label: 'ATTENTION' },
              ]}
            />
            <Select
              label="FOLDER"
              value={folderFilter}
              onChange={(e) => setFolderFilter(e.target.value)}
              options={[
                { value: 'ALL', label: 'ALL FOLDERS' },
                { value: 'UNFILED', label: 'UNFILED' },
                ...warningFolders.map((f) => ({ value: f.id, label: f.name })),
              ]}
            />
            <Select
              label="PERSON"
              value={personFilter}
              onChange={(e) => setPersonFilter(e.target.value)}
              options={[
                { value: 'ALL', label: 'EVERYONE' },
                ...warningStaff.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
            <Select
              label="SORT"
              value={warningSort}
              onChange={(e) => setWarningSort(e.target.value as WarningSort)}
              options={WARNING_SORT_OPTIONS}
            />
          </div>
        )}

        {visibleWarnings.length === 0 ? (
          <p className="font-mono text-xs text-grey-light">
            {warnings.length === 0 ? 'NO TRAINING NEEDS ATTENTION.' : 'NO WARNINGS MATCH THESE FILTERS.'}
          </p>
        ) : (
          visibleWarnings.map((w) => (
            <div
              key={w.id}
              className={`border border-grey-mid border-l-4 ${WARNING_BORDER[w.severity]} p-3 space-y-2`}
            >
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className="font-mono text-sm uppercase text-white">
                    {w.staffName}
                    {w.guideTitle && <span className="text-grey-light"> · {w.guideTitle}</span>}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`font-mono text-xs uppercase border px-1.5 py-0.5 ${
                        w.severity === 'CRITICAL'
                          ? 'border-danger/60 text-danger'
                          : 'border-warning/60 text-warning'
                      }`}
                    >
                      {WARNING_KIND_LABELS[w.kind]}
                    </span>
                    {w.folderName && (
                      <span className="font-mono text-2xs uppercase text-grey-light">{w.folderName}</span>
                    )}
                    {w.since && (
                      <span className="font-mono text-2xs uppercase text-grey-light">
                        SINCE {w.since.slice(0, 10)}
                      </span>
                    )}
                    {w.due && (
                      <span className="font-mono text-2xs uppercase text-warning">
                        DUE {w.due.slice(0, 10)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {w.guideId && (
                    <button
                      type="button"
                      onClick={() => setManageStaff({ id: w.staffId, name: w.staffName })}
                      className="font-mono text-xs uppercase border border-grey-mid px-2.5 py-1 text-white hover:border-white transition-colors"
                    >
                      OPEN GUIDE
                    </button>
                  )}
                  {w.guideId && (
                    <button
                      type="button"
                      disabled={busyWarningId === w.id}
                      onClick={() => markRetrained(w)}
                      className="font-mono text-xs uppercase border border-success/60 px-2.5 py-1 text-success hover:border-success disabled:opacity-40"
                    >
                      MARK RETRAINED
                    </button>
                  )}
                  {canAssign && (
                    <button
                      type="button"
                      onClick={() =>
                        setRetrainModal({ staffId: w.staffId, guideIds: w.guideId ? [w.guideId] : [] })
                      }
                      className="font-mono text-xs uppercase border border-warning/60 px-2.5 py-1 text-warning hover:border-warning transition-colors"
                    >
                      MARK FOR RETRAINING
                    </button>
                  )}
                  {w.requestId && (
                    <button
                      type="button"
                      disabled={busyWarningId === w.id}
                      onClick={() => dismissWarning(w)}
                      className="font-mono text-xs uppercase border border-grey-mid px-2.5 py-1 text-grey-light hover:text-white disabled:opacity-40"
                    >
                      DISMISS
                    </button>
                  )}
                </div>
              </div>
              <p
                className={`font-mono text-xs ${
                  w.severity === 'CRITICAL' ? 'text-danger' : 'text-warning'
                }`}
              >
                {w.reasonText}
              </p>
            </div>
          ))
        )}
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

      {retrainModal && (
        <RetrainRequestModal
          endpoint="/api/admin/guide-retrain"
          staffOptions={warningStaff}
          guideOptions={warningGuides}
          folders={warningFolders}
          initialStaffId={retrainModal.staffId}
          initialGuideIds={retrainModal.guideIds}
          onClose={() => setRetrainModal(null)}
          onCreated={loadWarnings}
        />
      )}
    </div>
  )
}
