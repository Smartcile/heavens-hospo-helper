// Server half of the availability HISTORY popup (#206) — Prisma-backed reads
// only, never imported by a client component.
//
// The popup is deliberately read-only: it renders what already exists on the
// availability rows. `AvailabilityEditRequest` keeps every request in every
// status (including soft-deleted withdrawals) and `StaffAvailability` keeps the
// current declaration with its review/lock stamp, so no new table or column is
// needed. Previous day values overwritten in place are NOT recoverable — the
// history shows the current day, the request that proposed a change, and the
// decision.

import { prisma } from '@hospo-ops/db'
import { formatDateKey } from '@/lib/scheduling'
import { getTodayDate } from '@/lib/utils'
import {
  attachHistoryComments,
  filterHistoryDays,
  filterHistoryRequests,
  historyActorLabel,
  historyRequestStatus,
  sortHistoryDays,
  sortHistoryRequests,
  type AvailabilityHistoryComment,
  type AvailabilityHistoryDay,
  type AvailabilityHistoryStatus,
  type AvailabilityHistoryRequest,
} from '@/lib/availability-history'
import { mapAvailabilityEntry, mapEditRequest } from '@/lib/availability.server'

/** A 90-day default window already tells the story; caps keep the payload sane. */
export const HISTORY_DEFAULT_DAYS = 90
export const HISTORY_REQUEST_CAP = 400
export const HISTORY_DAY_CAP = 2000
export const HISTORY_COMMENT_CAP = 2000

const utcDay = (key: string) => new Date(`${key}T00:00:00Z`)

function isHistoryStatus(value: string | null | undefined): value is AvailabilityHistoryStatus {
  return value === 'PENDING'
    || value === 'APPLIED'
    || value === 'DISCARDED'
    || value === 'SUPERSEDED'
    || value === 'WITHDRAWN'
    || value === 'REMOVED'
}

export interface AvailabilityHistory {
  venueId: string
  /** Venue-local today (YYYY-MM-DD), never the device day. */
  today: string
  timezone: string
  from: string
  to: string
  staff: { id: string; name: string }[]
  requests: AvailabilityHistoryRequest[]
  days: AvailabilityHistoryDay[]
  /** True when a cap was hit — the popup says so rather than pretending. */
  truncated: boolean
}

/**
 * Load the venue's availability history for an inclusive day window.
 *
 * Requests are bounded by their anchor (`date <= to`) then filtered on the days
 * they actually target, so a FROM/ALL request filed before the window still
 * appears when it covers a day inside it. Soft-deleted rows are included by
 * default; the popup flags withdrawals and cancelled declarations.
 */
export async function loadAvailabilityHistory(input: {
  venueId: string
  from: string
  to: string
  timezone?: string | null
  staffId?: string | null
  status?: string | null
  includeDeleted?: boolean
}): Promise<AvailabilityHistory> {
  const includeDeleted = input.includeDeleted !== false
  const status: AvailabilityHistoryStatus | 'ALL' =
    isHistoryStatus(input.status?.toUpperCase() ?? null) ? (input.status!.toUpperCase() as AvailabilityHistoryStatus) : 'ALL'

  const dateWindow = { gte: utcDay(input.from), lte: utcDay(input.to) }
  const staffScoped = input.staffId ? { staffId: input.staffId } : {}

  const [venue, staffRows, requests, dayRows, commentRows] = await Promise.all([
    prisma.venue.findUnique({ where: { id: input.venueId }, select: { timezone: true } }),
    prisma.staff.findMany({
      where: { venueId: input.venueId },
      select: { id: true, firstName: true, lastName: true, isActive: true, deletedAt: true },
    }),
    prisma.availabilityEditRequest.findMany({
      where: {
        venueId: input.venueId,
        date: { lte: dateWindow.lte },
        ...staffScoped,
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
      orderBy: [{ createdAt: 'desc' }],
      take: HISTORY_REQUEST_CAP,
    }),
    prisma.staffAvailability.findMany({
      where: {
        venueId: input.venueId,
        date: dateWindow,
        ...staffScoped,
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
      orderBy: [{ date: 'desc' }, { staffId: 'asc' }],
      take: HISTORY_DAY_CAP,
    }),
    prisma.availabilityComment.findMany({
      where: { venueId: input.venueId, deletedAt: null, date: dateWindow, ...staffScoped },
      orderBy: [{ createdAt: 'desc' }],
      take: HISTORY_COMMENT_CAP,
    }),
  ])

  const timezone = input.timezone || venue?.timezone || 'Pacific/Auckland'
  const today = formatDateKey(getTodayDate(timezone))

  const nameById = new Map(
    staffRows.map((row) => [row.id, `${row.firstName} ${row.lastName}`.trim()]),
  )
  // The filter picker offers active staff plus anyone who appears in this
  // window's history (a departed person's record is still readable).
  const referencedStaff = new Set([
    ...requests.map((row) => row.staffId),
    ...dayRows.map((row) => row.staffId),
  ])
  const staff = staffRows
    .filter((row) => (row.isActive && !row.deletedAt) || referencedStaff.has(row.id))
    .map((row) => ({ id: row.id, name: nameById.get(row.id) ?? '' }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const comments: AvailabilityHistoryComment[] = commentRows.map((row) => ({
    id: row.id,
    staffId: row.staffId,
    date: formatDateKey(row.date),
    body: row.body,
    source: row.source,
    authorName: row.authorId ? nameById.get(row.authorId) ?? null : null,
    createdAt: row.createdAt.toISOString(),
  }))

  const requestRows = requests.map((row) => {
    const base = mapEditRequest(row)
    return {
      ...base,
      deleted: !!row.deletedAt,
      reviewedById: row.reviewedById ?? null,
      reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
      staffName: nameById.get(row.staffId) ?? 'REMOVED STAFF',
      reviewedByLabel: historyActorLabel(
        row.reviewedById,
        row.reviewedAt ? row.reviewedAt.toISOString() : null,
        nameById,
      ),
      comments: [] as AvailabilityHistoryComment[],
    }
  })

  const mappedRequests = attachHistoryComments(
    sortHistoryRequests(
      filterHistoryRequests(requestRows, {
        staffId: input.staffId ?? null,
        status,
        from: input.from,
        to: input.to,
        includeWithdrawn: includeDeleted,
      }),
    ),
    comments,
  )

  const mappedDays = attachHistoryComments(
    sortHistoryDays(
      filterHistoryDays(
        dayRows.map((row) => {
          const entry = mapAvailabilityEntry(row)
          return {
            ...entry,
            staffId: row.staffId,
            reviewedById: row.reviewedById ?? null,
            reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
            reviewedByName: row.reviewedById ? nameById.get(row.reviewedById) ?? 'REMOVED STAFF' : null,
            cancelled: !!row.deletedAt,
            staffName: nameById.get(row.staffId) ?? 'REMOVED STAFF',
            lockedByName: row.lockedById ? nameById.get(row.lockedById) ?? 'REMOVED STAFF' : null,
            comments: [] as AvailabilityHistoryComment[],
          }
        }),
        {
          staffId: input.staffId ?? null,
          from: input.from,
          to: input.to,
          includeCancelled: includeDeleted,
        },
      ),
    ),
    comments,
  )

  return {
    venueId: input.venueId,
    today,
    timezone,
    from: input.from,
    to: input.to,
    staff,
    requests: mappedRequests,
    days: mappedDays,
    truncated: requests.length >= HISTORY_REQUEST_CAP
      || dayRows.length >= HISTORY_DAY_CAP
      || commentRows.length >= HISTORY_COMMENT_CAP,
  }
}
