// Pure, client-safe helpers for the availability HISTORY popup (#206).
//
// The audit trail already exists on the availability rows: every declaration
// (`StaffAvailability`) keeps its review stamp, and every worker change
// (`AvailabilityEditRequest`) keeps its status, reviewer, review note and soft
// delete — so an applied, discarded, superseded or withdrawn request is still
// on record. This module normalises those rows for display; it never writes.
//
// Prisma-free on purpose: the popup renders in the browser. All reads live in
// `availability-history.server.ts`.

import {
  describeWindows,
  requestTargetDates,
  type AvailabilityEntry,
  type AvailabilityPayloadLike,
  type AvailabilityScope,
} from '@/lib/availability'

/** A request's display status. WITHDRAWN/REMOVED are the soft-deleted cases. */
export type AvailabilityHistoryStatus = 'PENDING' | 'APPLIED' | 'DISCARDED' | 'SUPERSEDED' | 'WITHDRAWN' | 'REMOVED'

export const AVAILABILITY_HISTORY_STATUSES: AvailabilityHistoryStatus[] = [
  'PENDING',
  'APPLIED',
  'DISCARDED',
  'SUPERSEDED',
  'WITHDRAWN',
  'REMOVED',
]

const STATUS_META: Record<AvailabilityHistoryStatus, { label: string; badge: string }> = {
  PENDING: { label: 'PENDING', badge: 'border-warning text-warning' },
  APPLIED: { label: 'APPLIED', badge: 'border-success text-success' },
  DISCARDED: { label: 'DISCARDED', badge: 'border-danger text-danger' },
  SUPERSEDED: { label: 'SUPERSEDED', badge: 'border-grey-mid text-grey-light' },
  WITHDRAWN: { label: 'WITHDRAWN', badge: 'border-grey-mid text-accent' },
  REMOVED: { label: 'REMOVED', badge: 'border-grey-mid text-accent' },
}

/** Badge metadata for a display status. */
export function historyStatusMeta(status: AvailabilityHistoryStatus): { label: string; badge: string } {
  return STATUS_META[status]
}

/** One day's comment, shaped for the shared read-only `CommentThread`. */
export interface AvailabilityHistoryComment {
  id: string
  staffId: string
  date: string
  body: string
  source: string
  authorName: string | null
  createdAt: string
}

/** The minimal edit-request shape the history filters and labels need. */
export interface HistoryRequestLike {
  id: string
  staffId: string
  /** The request's anchor day (YYYY-MM-DD). */
  date: string
  scope: AvailabilityScope
  seriesId: string | null
  action: 'SET' | 'CLEAR'
  payload: { availability?: AvailabilityPayloadLike | null; writeDates?: string[] | null; removeDates?: string[] | null } | null
  reason: string | null
  status: string
  reviewNote: string | null
  reviewedById: string | null
  reviewedAt: string | null
  createdAt: string
  /**
   * Soft-deleted: a worker withdrawal, a manager dismissal (delete series) or
   * a legacy dismissal with no stamp. `historyRequestStatus` says which.
   */
  deleted?: boolean
}

export interface AvailabilityHistoryRequest extends HistoryRequestLike {
  staffName: string
  /** 'AUTOMATIC' when retired by the system (auto-supersede), null if unreviewed. */
  reviewedByLabel: string | null
  comments: AvailabilityHistoryComment[]
}

/** A declaration day with its review/lock stamp and comment thread. */
export interface AvailabilityHistoryDay extends AvailabilityEntry {
  reviewedById: string | null
  reviewedAt: string | null
  reviewedByName: string | null
  /** Soft-deleted (cancelled) declaration — still part of the history. */
  cancelled: boolean
  staffName: string
  lockedByName: string | null
  comments: AvailabilityHistoryComment[]
}

function lookupName(nameById: ReadonlyMap<string, string>, id: string): string | null {
  return nameById.get(id) ?? null
}

/** The review note the delete-series route stamps when it dismisses requests. */
export const SERIES_DELETED_NOTE = 'SERIES DELETED'

/** The fields needed to classify a request. */
export type HistoryStatusSource = Pick<
  HistoryRequestLike,
  'status' | 'deleted' | 'staffId' | 'reviewedById' | 'reviewNote'
>

/**
 * The display status of a request, including the soft-deleted cases.
 *
 * - A live row keeps its stored status.
 * - A worker withdrawal is soft-deleted DISCARDED with the worker stamped as
 *   the reviewer (self), so it reads WITHDRAWN.
 * - A manager dismissal is soft-deleted DISCARDED with someone else stamped as
 *   the reviewer, so it stays DISCARDED (with the review note saying why).
 * - A soft-deleted row that never carried a decision (legacy delete-series
 *   rows had only `deletedAt`) reads REMOVED — never WITHDRAWN, because that
 *   would attribute a manager action to the worker.
 */
export function historyRequestStatus(row: HistoryStatusSource): AvailabilityHistoryStatus {
  const status = row.status as AvailabilityHistoryStatus
  if (!row.deleted) return AVAILABILITY_HISTORY_STATUSES.includes(status) ? status : 'PENDING'
  if (row.status === 'DISCARDED') {
    const managerDismissal = !!row.reviewedById
      && (row.reviewedById !== row.staffId || row.reviewNote === SERIES_DELETED_NOTE)
    return managerDismissal ? 'DISCARDED' : 'WITHDRAWN'
  }
  return 'REMOVED'
}

/**
 * Who resolved a request: a real name when the reviewer is known, `AUTOMATIC`
 * when the row carries a review time but no reviewer (the auto-supersede path),
 * and null while it is still open. Never invents an attribution.
 */
export function historyActorLabel(
  reviewedById: string | null | undefined,
  reviewedAt: string | null | undefined,
  nameById: ReadonlyMap<string, string>,
): string | null {
  if (reviewedById) return lookupName(nameById, reviewedById) ?? 'REMOVED STAFF'
  if (reviewedAt) return 'AUTOMATIC'
  return null
}

/** The days a request actually targets (its plan dates, else its anchor). */
export function historyRequestDates(row: Pick<HistoryRequestLike, 'date' | 'payload'>): string[] {
  const targets = requestTargetDates(row.payload)
  return targets.length > 0 ? targets : [row.date]
}

/** True when any target day falls inside the inclusive window. */
export function historyRequestInWindow(
  row: Pick<HistoryRequestLike, 'date' | 'payload'>,
  from: string,
  to: string,
): boolean {
  return historyRequestDates(row).some((d) => d >= from && d <= to)
}

/**
 * Plain-English summary of what the request asked for. Kept beside the pure
 * model so the history popup and the approvals queue cannot drift in wording.
 */
export function describeHistoryRequest(row: Pick<HistoryRequestLike, 'action' | 'scope' | 'payload'>): string {
  if (row.action === 'CLEAR') {
    if (row.scope === 'FROM') return 'REMOVE SERIES FROM THIS DAY'
    if (row.scope === 'ALL') return 'REMOVE WHOLE SERIES'
    return 'CLEAR THIS DAY'
  }
  const availability = row.payload?.availability
  if (!availability) return '—'
  if (availability.isAllDay) return `ALL DAY ${availability.type}`
  return describeWindows(availability.windows, false, availability.type)
}

export interface HistoryRequestFilters {
  staffId?: string | null
  status?: AvailabilityHistoryStatus | 'ALL' | null
  from?: string | null
  to?: string | null
  /** Withdrawn/removed requests stay in the history unless deliberately hidden. */
  includeWithdrawn?: boolean
}

/** Staff / status / target-date filtering for the requests tab. */
export function filterHistoryRequests<T extends HistoryRequestLike>(
  rows: T[],
  filters: HistoryRequestFilters = {},
): T[] {
  const includeWithdrawn = filters.includeWithdrawn !== false
  return rows.filter((row) => {
    const status = historyRequestStatus(row)
    if ((status === 'WITHDRAWN' || status === 'REMOVED') && !includeWithdrawn) return false
    if (filters.staffId && row.staffId !== filters.staffId) return false
    if (filters.status && filters.status !== 'ALL' && status !== filters.status) return false
    if (filters.from && filters.to && !historyRequestInWindow(row, filters.from, filters.to)) return false
    return true
  })
}

/** Newest first — a history reads from the most recent decision backwards. */
export function sortHistoryRequests<T extends Pick<HistoryRequestLike, 'createdAt' | 'date' | 'id'>>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1
    if (a.date !== b.date) return a.date < b.date ? 1 : -1
    return a.id < b.id ? 1 : -1
  })
}

export interface HistoryDayFilters {
  staffId?: string | null
  from?: string | null
  to?: string | null
  /** Cancelled (soft-deleted) days stay in the history unless hidden. */
  includeCancelled?: boolean
}

/** Staff / date filtering for the days tab. */
export function filterHistoryDays<T extends { staffId?: string; date: string; cancelled?: boolean }>(
  rows: T[],
  filters: HistoryDayFilters = {},
): T[] {
  const includeCancelled = filters.includeCancelled !== false
  return rows.filter((row) => {
    if (row.cancelled && !includeCancelled) return false
    if (filters.staffId && row.staffId !== filters.staffId) return false
    if (filters.from && row.date < filters.from) return false
    if (filters.to && row.date > filters.to) return false
    return true
  })
}

/** Newest first, then person name, for a stable days list. */
export function sortHistoryDays<T extends { date: string; staffName?: string; id?: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1
    const an = a.staffName ?? ''
    const bn = b.staffName ?? ''
    if (an !== bn) return an.localeCompare(bn)
    return (a.id ?? '') < (b.id ?? '') ? -1 : 1
  })
}

/**
 * Attach each row's day comments (newest first) by staff + anchor date. A
 * request shows the comments on the day it was filed against; a declaration
 * shows its own day's thread.
 */
export function attachHistoryComments<T extends { staffId: string; date: string }>(
  rows: T[],
  comments: AvailabilityHistoryComment[],
): (T & { comments: AvailabilityHistoryComment[] })[] {
  const byKey = new Map<string, AvailabilityHistoryComment[]>()
  for (const comment of comments) {
    const key = `${comment.staffId}:${comment.date}`
    const list = byKey.get(key) ?? []
    list.push(comment)
    byKey.set(key, list)
  }
  for (const list of byKey.values()) list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  return rows.map((row) => ({ ...row, comments: byKey.get(`${row.staffId}:${row.date}`) ?? [] }))
}

/** Tab labels: how much history each view holds. */
export function historySummary(
  requests: HistoryStatusSource[],
  days: { cancelled?: boolean }[],
): { requests: number; pending: number; days: number; cancelled: number } {
  return {
    requests: requests.length,
    pending: requests.filter((r) => historyRequestStatus(r) === 'PENDING').length,
    days: days.length,
    cancelled: days.filter((d) => d.cancelled).length,
  }
}
