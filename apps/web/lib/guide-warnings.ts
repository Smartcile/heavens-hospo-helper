// Training warnings — the single pure brain behind the "needs attention" list
// on the admin training board, the staff sign-off modal and the worker guide
// list. Prisma-free so it can be imported by client components and unit-tested
// without a database.
//
// A warning is one of:
//   MISSING             a required tracked guide has no completion
//   STALE               the completion predates the guide's last change
//   SIGN_OFF_PENDING    a sign-off guide has no completion (staff cannot self-complete)
//   RETRAIN_REQUESTED   someone explicitly marked this person for retraining
//   OVERDUE             an explicit retrain request older than the due window
//   FOLLOW_UP           an open UNTRAINED / MISSED / INCORRECT follow-up
//
// An explicit retrain request always wins over the inferred stale/missing
// warning for the same guide, so a manager never sees the same thing twice.

export type WarningKind =
  | 'MISSING'
  | 'STALE'
  | 'SIGN_OFF_PENDING'
  | 'RETRAIN_REQUESTED'
  | 'OVERDUE'
  | 'FOLLOW_UP'

export type WarningSeverity = 'WARNING' | 'CRITICAL'
export type WarningSort = 'severity' | 'oldest' | 'person' | 'guide'

export const WARNING_KIND_LABELS: Record<WarningKind, string> = {
  MISSING: 'NOT DONE',
  STALE: 'RETRAIN',
  SIGN_OFF_PENDING: 'SIGN-OFF',
  RETRAIN_REQUESTED: 'RETRAIN REQUESTED',
  OVERDUE: 'OVERDUE RETRAIN',
  FOLLOW_UP: 'FOLLOW-UP',
}

export interface WarningFolder {
  id: string
  name: string
  sortOrder?: number
}

export interface WarningGuide {
  id: string
  title: string
  folderId: string | null
  requiresSignOff: boolean
  /** ISO timestamp of the guide's last change. */
  updatedAt: string
}

export interface WarningCompletion {
  completedAt: string
  selfCompleted: boolean
  signedOffById: string | null
}

export interface WarningRetrainRequest {
  id: string
  guideId: string
  reason: string | null
  requestedAt: string
  requestedByName?: string | null
}

export type WarningFollowUpKind = 'MISSED' | 'UNTRAINED' | 'INCORRECT'

export interface WarningFollowUp {
  id: string
  kind: WarningFollowUpKind
  guideId: string | null
  dueDate: string | null
  detail: string | null
}

export interface WarningStaffInput {
  id: string
  name: string
  /** Guides that apply to this person (already resolved server-side). */
  requiredGuideIds: string[]
  completions: Record<string, WarningCompletion>
  retrainRequests: WarningRetrainRequest[]
  followUps: WarningFollowUp[]
}

export interface WarningBuildInput {
  staff: WarningStaffInput[]
  guides: Record<string, WarningGuide>
  folders: Record<string, WarningFolder>
  /** Injectable for tests. */
  now?: Date
  /** A retrain request older than this many days is OVERDUE. */
  overdueAfterDays?: number
}

export interface GuideWarning {
  id: string
  kind: WarningKind
  severity: WarningSeverity
  staffId: string
  staffName: string
  guideId: string | null
  guideTitle: string | null
  folderId: string | null
  folderName: string | null
  reasonText: string
  since: string | null
  due: string | null
  /** The explicit retrain request behind this row, when there is one. */
  requestId: string | null
  followUpId: string | null
}

const DAY_MS = 24 * 60 * 60 * 1000
const MONTHS = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
]

/** Deterministic `12 NOV 2026` — locale-independent so tests are stable. */
export function formatWarningDate(value: string | Date | null | undefined): string | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export interface WarningReasonContext {
  guideTitle?: string | null
  changedAt?: string | null
  completedAt?: string | null
  requestedAt?: string | null
  due?: string | null
  reason?: string | null
  followUpKind?: WarningFollowUpKind | null
  followUpDetail?: string | null
}

/** Plain-English "why" shown on every warning row. */
export function warningReasonText(kind: WarningKind, ctx: WarningReasonContext = {}): string {
  const changed = formatWarningDate(ctx.changedAt)
  const completed = formatWarningDate(ctx.completedAt)
  const requested = formatWarningDate(ctx.requestedAt)
  const due = formatWarningDate(ctx.due)
  const reason = ctx.reason?.trim()
  const reasonSuffix = reason ? ` — ${reason}` : ''

  switch (kind) {
    case 'MISSING':
      return 'Required guide has not been completed yet.'
    case 'SIGN_OFF_PENDING':
      return 'Waiting for a manager to sign it off — staff cannot complete this guide themselves.'
    case 'STALE':
      return completed
        ? `Guide changed on ${changed ?? 'an unknown date'} — training was completed on ${completed}.`
        : `Guide changed on ${changed ?? 'an unknown date'} after the previous training.`
    case 'RETRAIN_REQUESTED':
      return `Marked for retraining on ${requested ?? 'an unknown date'}${reasonSuffix}.`
    case 'OVERDUE':
      return `Retraining requested on ${requested ?? 'an unknown date'} and not done yet (due ${due ?? 'now'})${reasonSuffix}.`
    case 'FOLLOW_UP':
      switch (ctx.followUpKind) {
        case 'UNTRAINED':
          return 'Training is required before this task can be done.'
        case 'MISSED':
          return 'A task was missed and needs a manager review.'
        case 'INCORRECT':
          return 'A task was done incorrectly and needs a manager review.'
        default:
          return ctx.followUpDetail?.trim() || 'An open follow-up needs a manager review.'
      }
    default:
      return 'Training needs attention.'
  }
}

function folderOf(guide: WarningGuide | undefined, folders: Record<string, WarningFolder>) {
  const folderId = guide?.folderId ?? null
  return {
    folderId,
    folderName: folderId ? folders[folderId]?.name ?? null : null,
  }
}

export function buildWarnings(input: WarningBuildInput): GuideWarning[] {
  const now = input.now ?? new Date()
  const overdueDays = input.overdueAfterDays ?? 14
  const out: GuideWarning[] = []

  for (const person of input.staff) {
    const requestedGuideIds = new Set(person.retrainRequests.map((r) => r.guideId))

    // Explicit requests first — they win over inferred stale/missing warnings.
    for (const request of person.retrainRequests) {
      const guide = input.guides[request.guideId]
      const requestedAt = new Date(request.requestedAt)
      const due = new Date(requestedAt.getTime() + overdueDays * DAY_MS)
      const overdue = !Number.isNaN(due.getTime()) && due.getTime() < now.getTime()
      const kind: WarningKind = overdue ? 'OVERDUE' : 'RETRAIN_REQUESTED'
      const { folderId, folderName } = folderOf(guide, input.folders)

      out.push({
        id: `request:${request.id}`,
        kind,
        severity: overdue ? 'CRITICAL' : 'WARNING',
        staffId: person.id,
        staffName: person.name,
        guideId: request.guideId,
        guideTitle: guide?.title ?? null,
        folderId,
        folderName,
        reasonText: warningReasonText(kind, {
          changedAt: guide?.updatedAt ?? null,
          requestedAt: request.requestedAt,
          due: due.toISOString(),
          reason: request.reason,
        }),
        since: request.requestedAt,
        due: due.toISOString(),
        requestId: request.id,
        followUpId: null,
      })
    }

    for (const guideId of person.requiredGuideIds) {
      if (requestedGuideIds.has(guideId)) continue
      const guide = input.guides[guideId]
      if (!guide) continue
      const completion = person.completions[guideId]
      const completedAt = completion?.completedAt ?? null
      const guideChangedAt = guide.updatedAt
      const changedMs = new Date(guideChangedAt).getTime()
      const completedMs = completedAt ? new Date(completedAt).getTime() : null
      const upToDate = completedMs != null && !Number.isNaN(changedMs) && completedMs >= changedMs
      if (upToDate) continue

      const kind: WarningKind = completion
        ? 'STALE'
        : guide.requiresSignOff
          ? 'SIGN_OFF_PENDING'
          : 'MISSING'
      const { folderId, folderName } = folderOf(guide, input.folders)

      out.push({
        id: `guide:${person.id}:${guide.id}:${kind}`,
        kind,
        severity: kind === 'STALE' ? 'CRITICAL' : 'WARNING',
        staffId: person.id,
        staffName: person.name,
        guideId: guide.id,
        guideTitle: guide.title,
        folderId,
        folderName,
        reasonText: warningReasonText(kind, {
          changedAt: guideChangedAt,
          completedAt,
        }),
        since: kind === 'STALE' ? guideChangedAt : null,
        due: null,
        requestId: null,
        followUpId: null,
      })
    }

    for (const followUp of person.followUps) {
      const guide = followUp.guideId ? input.guides[followUp.guideId] : undefined
      const { folderId, folderName } = folderOf(guide, input.folders)
      out.push({
        id: `followup:${followUp.id}`,
        kind: 'FOLLOW_UP',
        severity: 'CRITICAL',
        staffId: person.id,
        staffName: person.name,
        guideId: followUp.guideId,
        guideTitle: guide?.title ?? null,
        folderId,
        folderName,
        reasonText: warningReasonText('FOLLOW_UP', {
          followUpKind: followUp.kind,
          followUpDetail: followUp.detail,
        }),
        since: followUp.dueDate,
        due: null,
        requestId: null,
        followUpId: followUp.id,
      })
    }
  }

  return out
}

export interface WarningFilters {
  kind?: WarningKind | 'ALL'
  severity?: WarningSeverity | 'ALL'
  staffId?: string
  folderId?: string | 'UNFILED' | 'ALL'
  search?: string
}

export function filterWarnings(warnings: GuideWarning[], filters: WarningFilters = {}): GuideWarning[] {
  const search = filters.search?.trim().toLowerCase()
  return warnings.filter((w) => {
    if (filters.kind && filters.kind !== 'ALL' && w.kind !== filters.kind) return false
    if (filters.severity && filters.severity !== 'ALL' && w.severity !== filters.severity) return false
    if (filters.staffId && w.staffId !== filters.staffId) return false
    if (filters.folderId && filters.folderId !== 'ALL') {
      if (filters.folderId === 'UNFILED') {
        if (w.folderId) return false
      } else if (w.folderId !== filters.folderId) {
        return false
      }
    }
    if (search) {
      const haystack = `${w.staffName} ${w.guideTitle ?? ''} ${w.reasonText}`.toLowerCase()
      if (!haystack.includes(search)) return false
    }
    return true
  })
}

const SEVERITY_RANK: Record<WarningSeverity, number> = { CRITICAL: 0, WARNING: 1 }

export function sortWarnings(warnings: GuideWarning[], sort: WarningSort = 'severity'): GuideWarning[] {
  const bySince = (a: GuideWarning, b: GuideWarning) => {
    if (!a.since && !b.since) return 0
    if (!a.since) return 1
    if (!b.since) return -1
    return a.since.localeCompare(b.since)
  }
  return [...warnings].sort((a, b) => {
    switch (sort) {
      case 'oldest':
        return bySince(a, b) || a.staffName.localeCompare(b.staffName)
      case 'person':
        return a.staffName.localeCompare(b.staffName) || (a.guideTitle ?? '').localeCompare(b.guideTitle ?? '')
      case 'guide':
        return (a.guideTitle ?? '').localeCompare(b.guideTitle ?? '') || a.staffName.localeCompare(b.staffName)
      default:
        return (
          SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
          bySince(a, b) ||
          a.staffName.localeCompare(b.staffName)
        )
    }
  })
}

export interface WarningFolderGroup {
  folder: WarningFolder | null
  warnings: GuideWarning[]
}

/**
 * Group warnings under their guide folder, in folder order. Only folders that
 * actually have warnings are returned, and the UNFILED bucket (`folder: null`)
 * is appended when any warning has no folder.
 */
export function groupWarningsByFolder(
  warnings: GuideWarning[],
  folders: WarningFolder[],
): WarningFolderGroup[] {
  const ordered = [...folders].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name),
  )
  const byFolder = new Map<string, GuideWarning[]>()
  for (const f of ordered) byFolder.set(f.id, [])
  const unfiled: GuideWarning[] = []
  for (const w of warnings) {
    if (w.folderId && byFolder.has(w.folderId)) byFolder.get(w.folderId)!.push(w)
    else unfiled.push(w)
  }
  const groups: WarningFolderGroup[] = ordered
    .map((folder) => ({ folder, warnings: byFolder.get(folder.id) ?? [] }))
    .filter((g) => g.warnings.length > 0)
  if (unfiled.length) groups.push({ folder: null, warnings: unfiled })
  return groups
}

// ── Per-guide state (sign-off modal / worker list) ─────────────────────────

export interface GuideTrainingStateInput {
  updatedAt: string
  requiresSignOff: boolean
  completion: { completedAt: string } | null
  request: WarningRetrainRequest | null
  now?: Date
  overdueAfterDays?: number
}

export interface GuideTrainingState {
  needsAction: boolean
  stale: boolean
  severity: WarningSeverity | null
  reasonText: string | null
  requestId: string | null
}

/**
 * Collapse the warning rules into the state of ONE guide for one person. This
 * is what the sign-off modal and the worker guide card render (red highlighter
 * + plain-English reason), so they cannot disagree with the warnings list.
 */
export function guideTrainingState(input: GuideTrainingStateInput): GuideTrainingState {
  const now = input.now ?? new Date()
  const completionMs = input.completion ? new Date(input.completion.completedAt).getTime() : null

  if (input.request) {
    const requestedAt = new Date(input.request.requestedAt)
    const overdueDays = input.overdueAfterDays ?? 14
    const due = new Date(requestedAt.getTime() + overdueDays * DAY_MS)
    const overdue = !Number.isNaN(due.getTime()) && due.getTime() < now.getTime()
    const kind: WarningKind = overdue ? 'OVERDUE' : 'RETRAIN_REQUESTED'
    return {
      needsAction: true,
      stale: true,
      severity: overdue ? 'CRITICAL' : 'WARNING',
      reasonText: warningReasonText(kind, {
        changedAt: input.updatedAt,
        requestedAt: input.request.requestedAt,
        due: due.toISOString(),
        reason: input.request.reason,
      }),
      requestId: input.request.id,
    }
  }

  if (completionMs != null) {
    const changedMs = new Date(input.updatedAt).getTime()
    if (!Number.isNaN(changedMs) && completionMs < changedMs) {
      return {
        needsAction: true,
        stale: true,
        severity: 'CRITICAL',
        reasonText: warningReasonText('STALE', {
          changedAt: input.updatedAt,
          completedAt: input.completion!.completedAt,
        }),
        requestId: null,
      }
    }
    return { needsAction: false, stale: false, severity: null, reasonText: null, requestId: null }
  }

  const kind: WarningKind = input.requiresSignOff ? 'SIGN_OFF_PENDING' : 'MISSING'
  return {
    needsAction: true,
    stale: false,
    severity: 'WARNING',
    reasonText: warningReasonText(kind, { changedAt: input.updatedAt }),
    requestId: null,
  }
}

export interface WarningSummary {
  total: number
  critical: number
  warning: number
}

export function warningSummary(warnings: GuideWarning[]): WarningSummary {
  let critical = 0
  for (const w of warnings) if (w.severity === 'CRITICAL') critical++
  return { total: warnings.length, critical, warning: warnings.length - critical }
}
