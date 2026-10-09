// Server half of staff availability — Prisma-backed, never imported by a
// client component. One place for the write operations (plan → execute), the
// approval rules and the edit-request flow, so the worker routes and the admin
// page can never drift.
//
// A "plan" is the complete description of an availability change: which dates
// get written, which get removed, which series they belong to and how the
// series ends. Worker saves build a plan; if any APPROVED row is touched the
// plan is stored as an AvailabilityEditRequest instead of executed. Admins
// execute plans directly (bypassing locks/approvals) and apply requests.

import { randomUUID } from 'crypto'
import { prisma, Prisma } from '@hospo-ops/db'
import { formatDateKey } from '@/lib/scheduling'
import {
  autoComplement,
  canWorkerEditDate,
  initialStatus,
  normaliseWindows,
  occurrencesForRepeat,
  repeatWeekly,
  seriesEndDateKey,
  SERIES_HORIZON_WEEKS,
  type AvailabilityEntry,
  type AvailabilityScope,
  type AvailabilityStatus,
  type AvailabilityType,
  type AvailabilityWindow,
  type Repeat,
} from '@/lib/availability'

export interface AvailabilityPayload {
  isAllDay: boolean
  type: AvailabilityType
  windows: AvailabilityWindow[]
  timeOff: boolean
  notes: string | null
}

export interface AvailabilityPlan {
  action: 'SET' | 'CLEAR'
  anchor: string
  scope: AvailabilityScope
  availability: AvailabilityPayload | null
  writeDates: string[]
  removeDates: string[]
  seriesId: string | null
  seriesEndDate: string | null
  /** Update every row of the series to the plan's end date after writing. */
  syncSeriesEnd: boolean
}

export interface AvailabilityGate {
  todayKey: string
  lockDays: number
  /** Admin/manager backend: skip the past/lock and approval protections. */
  bypass: boolean
}

export type PlanOutcome =
  | { ok: true; plan: AvailabilityPlan; skipped: string[] }
  | { ok: false; error: string }

export type SaveOutcome =
  | { mode: 'SAVED'; plan: AvailabilityPlan; skipped: string[] }
  | { mode: 'REQUEST'; requestId: string; skipped: string[] }
  | { error: string }

interface AvailabilityRow {
  id: string
  staffId: string
  venueId: string
  date: Date
  type: string
  isAllDay: boolean
  startTime: string | null
  endTime: string | null
  segments: unknown
  status: string
  timeOff: boolean
  notes: string | null
  reason: string | null
  reviewNote: string | null
  seriesId: string | null
  seriesEndDate: Date | null
}

const utcDay = (key: string) => new Date(`${key}T00:00:00Z`)

// ── Mapping ───────────────────────────────────────────────────────────────

export function mapAvailabilityEntry(row: AvailabilityRow): AvailabilityEntry {
  const windows = row.isAllDay ? [] : normaliseWindows(row.segments ?? [])
  const type: AvailabilityType = row.isAllDay
    ? (row.type as AvailabilityType)
    : windows.some((w) => w.type === 'UNAVAILABLE') ? 'UNAVAILABLE' : 'AVAILABLE'
  return {
    id: row.id,
    staffId: row.staffId,
    date: formatDateKey(row.date),
    type,
    isAllDay: row.isAllDay,
    startTime: row.startTime,
    endTime: row.endTime,
    windows,
    status: row.status as AvailabilityStatus,
    timeOff: row.timeOff,
    notes: row.notes,
    reason: row.reason,
    reviewNote: row.reviewNote,
    seriesId: row.seriesId,
    seriesEndDate: row.seriesEndDate ? formatDateKey(row.seriesEndDate) : null,
  }
}

// ── Payload validation ────────────────────────────────────────────────────

/** Validate + normalise a raw availability body. Windowed days get the
 *  auto-complement (any AVAILABLE time makes the rest UNAVAILABLE). */
export function buildAvailabilityPayload(raw: unknown):
  | { ok: true; payload: AvailabilityPayload }
  | { ok: false; error: string } {
  const body = (raw ?? {}) as {
    isAllDay?: unknown
    type?: unknown
    windows?: unknown
    timeOff?: unknown
    notes?: unknown
  }
  const isAllDay = body.isAllDay !== false
  const timeOff = body.timeOff === true
  const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null

  if (isAllDay) {
    if (body.type !== 'AVAILABLE' && body.type !== 'UNAVAILABLE') {
      return { ok: false, error: 'CHOOSE AVAILABLE OR UNAVAILABLE' }
    }
    return { ok: true, payload: { isAllDay: true, type: body.type, windows: [], timeOff, notes } }
  }

  const windows = autoComplement(normaliseWindows(body.windows))
  if (windows.length === 0) return { ok: false, error: 'ADD AT LEAST ONE TIME WINDOW' }
  const type: AvailabilityType = windows.some((w) => w.type === 'UNAVAILABLE') ? 'UNAVAILABLE' : 'AVAILABLE'
  return { ok: true, payload: { isAllDay: false, type, windows, timeOff, notes } }
}

export function parseRepeat(raw: unknown): Repeat | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as { weeks?: unknown; noEnd?: unknown }
  if (r.noEnd === true) return { noEnd: true }
  const weeks = Math.floor(Number(r.weeks))
  if (!Number.isFinite(weeks) || weeks < 1) return null
  return { weeks: Math.min(weeks, SERIES_HORIZON_WEEKS) }
}

export function parseScope(raw: unknown): AvailabilityScope | null {
  return raw === 'THIS' || raw === 'FROM' || raw === 'ALL' ? raw : null
}

// ── Planning ──────────────────────────────────────────────────────────────

interface SeriesRow {
  date: Date
  seriesEndDate: Date | null
}

async function seriesRows(staffId: string, seriesId: string): Promise<SeriesRow[]> {
  return prisma.staffAvailability.findMany({
    where: { staffId, seriesId, deletedAt: null },
    select: { date: true, seriesEndDate: true },
    orderBy: { date: 'asc' },
  })
}

/**
 * Build the write plan for a SET. The plan is bounded to dates a worker may
 * actually touch (past/locked days are reported in `skipped`), a weekly repeat
 * materialises its occurrences, and a FROM/ALL edit can trim or extend the
 * series end.
 */
export async function planSet(
  input: {
    staffId: string
    dateKey: string
    payload: AvailabilityPayload
    repeat: Repeat | null
    scope: AvailabilityScope | null
    seriesId: string | null
  },
  gate: AvailabilityGate,
): Promise<PlanOutcome> {
  const { staffId, dateKey, payload } = input
  const skipped: string[] = []

  // Editing an existing series occurrence.
  if (input.seriesId) {
    const rows = await seriesRows(staffId, input.seriesId)
    if (rows.length === 0) return { ok: false, error: 'SERIES NOT FOUND' }
    const dates = rows.map((r) => formatDateKey(r.date))
    const storedEnd = rows.find((r) => r.seriesEndDate)?.seriesEndDate
    const currentEnd = storedEnd ? formatDateKey(storedEnd) : null
    const scope = input.scope ?? 'THIS'

    let writeDates = scope === 'THIS' ? [dateKey] : scope === 'FROM' ? dates.filter((d) => d >= dateKey) : dates
    if (writeDates.length === 0) return { ok: false, error: 'NO DAYS IN RANGE' }

    const seriesId = input.seriesId
    let seriesEndDate = currentEnd
    let syncSeriesEnd = false
    const removeSet = new Set<string>()

    if (scope !== 'THIS' && input.repeat) {
      const start = scope === 'FROM' ? dateKey : dates[0]
      const occurrenceDates = occurrencesForRepeat(start, input.repeat)
      seriesEndDate = 'noEnd' in input.repeat ? null : seriesEndDateKey(start, input.repeat.weeks)
      writeDates = occurrenceDates
      const keep = new Set(occurrenceDates)
      for (const d of dates) {
        if (d < start) continue
        if (!keep.has(d)) removeSet.add(d)
      }
      syncSeriesEnd = true
    }

    if (!gate.bypass) {
      const editable = writeDates.filter((d) => canWorkerEditDate(d, gate.lockDays, gate.todayKey))
      skipped.push(...writeDates.filter((d) => !editable.includes(d)))
      writeDates = editable
      const removable = [...removeSet].filter((d) => canWorkerEditDate(d, gate.lockDays, gate.todayKey))
      skipped.push(...[...removeSet].filter((d) => !removable.includes(d)))
      removeSet.clear()
      for (const d of removable) removeSet.add(d)
      if (writeDates.length === 0 && removeSet.size === 0) {
        return { ok: false, error: 'NO EDITABLE DAYS IN RANGE' }
      }
    }

    return {
      ok: true,
      skipped,
      plan: {
        action: 'SET',
        anchor: dateKey,
        scope,
        availability: payload,
        writeDates,
        removeDates: [...removeSet],
        seriesId,
        seriesEndDate,
        syncSeriesEnd,
      },
    }
  }

  // A new series from a weekly repeat.
  if (input.repeat) {
    if (!gate.bypass && !canWorkerEditDate(dateKey, gate.lockDays, gate.todayKey)) {
      return { ok: false, error: 'THIS DAY IS IN THE PAST OR LOCKED' }
    }
    const occurrenceDates = occurrencesForRepeat(dateKey, input.repeat)
    const end = 'noEnd' in input.repeat ? null : seriesEndDateKey(dateKey, input.repeat.weeks)
    return {
      ok: true,
      skipped,
      plan: {
        action: 'SET',
        anchor: dateKey,
        scope: 'ALL',
        availability: payload,
        writeDates: occurrenceDates,
        removeDates: [],
        seriesId: randomUUID(),
        seriesEndDate: end,
        syncSeriesEnd: false,
      },
    }
  }

  // A standalone day.
  if (!gate.bypass && !canWorkerEditDate(dateKey, gate.lockDays, gate.todayKey)) {
    return { ok: false, error: 'THIS DAY IS IN THE PAST OR LOCKED' }
  }
  return {
    ok: true,
    skipped,
    plan: {
      action: 'SET',
      anchor: dateKey,
      scope: 'THIS',
      availability: payload,
      writeDates: [dateKey],
      removeDates: [],
      seriesId: null,
      seriesEndDate: null,
      syncSeriesEnd: false,
    },
  }
}

/** Build the clear plan for a day / series scope. */
export async function planClear(
  input: {
    staffId: string
    dateKey: string
    scope: AvailabilityScope | null
    seriesId: string | null
  },
  gate: AvailabilityGate,
): Promise<PlanOutcome> {
  const skipped: string[] = []

  if (input.seriesId) {
    const rows = await seriesRows(input.staffId, input.seriesId)
    if (rows.length === 0) return { ok: false, error: 'SERIES NOT FOUND' }
    const dates = rows.map((r) => formatDateKey(r.date))
    const scope = input.scope ?? 'THIS'
    let removeDates = scope === 'THIS' ? [input.dateKey] : scope === 'FROM' ? dates.filter((d) => d >= input.dateKey) : dates
    if (removeDates.length === 0) return { ok: false, error: 'NO DAYS IN RANGE' }

    if (!gate.bypass) {
      const allowed = removeDates.filter((d) => canWorkerEditDate(d, gate.lockDays, gate.todayKey))
      skipped.push(...removeDates.filter((d) => !allowed.includes(d)))
      removeDates = allowed
      if (removeDates.length === 0) return { ok: false, error: 'NO EDITABLE DAYS IN RANGE' }
    }

    return {
      ok: true,
      skipped,
      plan: {
        action: 'CLEAR',
        anchor: input.dateKey,
        scope,
        availability: null,
        writeDates: [],
        removeDates,
        seriesId: input.seriesId,
        seriesEndDate: null,
        // A FROM clear turns the remainder of an open series finite.
        syncSeriesEnd: scope !== 'THIS',
      },
    }
  }

  if (!gate.bypass && !canWorkerEditDate(input.dateKey, gate.lockDays, gate.todayKey)) {
    return { ok: false, error: 'THIS DAY IS IN THE PAST OR LOCKED' }
  }
  return {
    ok: true,
    skipped,
    plan: {
      action: 'CLEAR',
      anchor: input.dateKey,
      scope: 'THIS',
      availability: null,
      writeDates: [],
      removeDates: [input.dateKey],
      seriesId: null,
      seriesEndDate: null,
      syncSeriesEnd: false,
    },
  }
}

// ── Execution ─────────────────────────────────────────────────────────────

/** Rows a plan would touch, scoped to the staff member. Only CONFIRMED
 *  block-outs / time off are protected — an auto-approved AVAILABLE day is
 *  informational and can always be changed. */
async function rowsTouchedByPlan(staffId: string, plan: AvailabilityPlan) {
  const dates = [...plan.writeDates, ...plan.removeDates]
  if (dates.length === 0) return [] as { id: string; status: string }[]
  return prisma.staffAvailability.findMany({
    where: {
      staffId,
      deletedAt: null,
      date: { in: dates.map(utcDay) },
      status: 'APPROVED',
      OR: [{ timeOff: true }, { type: 'UNAVAILABLE' }],
    },
    select: { id: true, status: true },
  })
}

function sharedRowData(payload: AvailabilityPayload, seriesId: string | null, seriesEndDate: string | null, status: AvailabilityStatus) {
  return {
    type: payload.type,
    isAllDay: payload.isAllDay,
    startTime: null,
    endTime: null,
    segments: payload.isAllDay ? Prisma.DbNull : (payload.windows as unknown as Prisma.InputJsonValue),
    timeOff: payload.timeOff,
    notes: payload.notes,
    seriesId,
    seriesEndDate: seriesEndDate ? utcDay(seriesEndDate) : null,
    status,
  }
}

/** Execute a SET plan. `status` decides approval: workers use the payload's
 *  initial status; admin edits/apply stamp APPROVED. Revives soft-deleted rows. */
export async function executeSet(
  staffId: string,
  venueId: string,
  plan: AvailabilityPlan,
  status: AvailabilityStatus,
): Promise<void> {
  const payload = plan.availability
  if (!payload) return
  const dates = plan.writeDates.map(utcDay)
  const data = sharedRowData(payload, plan.seriesId, plan.seriesEndDate, status)

  await prisma.$transaction(async (tx) => {
    if (dates.length > 0) {
      await tx.staffAvailability.updateMany({
        where: { staffId, date: { in: dates } },
        data: { ...data, deletedAt: null },
      })
      const existing = await tx.staffAvailability.findMany({
        where: { staffId, date: { in: dates } },
        select: { date: true },
      })
      const have = new Set(existing.map((r) => formatDateKey(r.date)))
      const toCreate = plan.writeDates.filter((d) => !have.has(d))
      if (toCreate.length > 0) {
        await tx.staffAvailability.createMany({
          data: toCreate.map((d) => ({ staffId, venueId, date: utcDay(d), ...data })),
        })
      }
    }
    await applyRemovals(tx, staffId, plan)
  })
}

/** Execute a CLEAR plan. */
export async function executeClear(staffId: string, plan: AvailabilityPlan): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await applyRemovals(tx, staffId, plan)
  })
}

async function applyRemovals(tx: Prisma.TransactionClient, staffId: string, plan: AvailabilityPlan) {
  if (plan.removeDates.length > 0) {
    await tx.staffAvailability.updateMany({
      where: { staffId, date: { in: plan.removeDates.map(utcDay) } },
      data: { deletedAt: new Date() },
    })
  }
  if (plan.syncSeriesEnd && plan.seriesId) {
    const remaining = await tx.staffAvailability.findMany({
      where: { staffId, seriesId: plan.seriesId, deletedAt: null },
      select: { date: true },
      orderBy: { date: 'asc' },
    })
    if (remaining.length > 0) {
      const end = formatDateKey(remaining[remaining.length - 1].date)
      await tx.staffAvailability.updateMany({
        where: { staffId, seriesId: plan.seriesId, deletedAt: null },
        data: { seriesEndDate: utcDay(end) },
      })
    }
  }
}

// ── Save / clear (worker + admin share these) ─────────────────────────────

export interface SaveInput {
  staffId: string
  venueId: string
  dateKey: string
  raw: unknown
  repeat: Repeat | null
  scope: AvailabilityScope | null
  seriesId: string | null
  reason: string | null
}

async function storeRequest(
  input: { staffId: string; venueId: string; dateKey: string; reason: string | null },
  plan: AvailabilityPlan,
): Promise<string> {
  const request = await prisma.availabilityEditRequest.create({
    data: {
      staffId: input.staffId,
      venueId: input.venueId,
      scope: plan.scope,
      date: utcDay(input.dateKey),
      seriesId: plan.seriesId,
      action: plan.action,
      payload: plan as unknown as Prisma.InputJsonValue,
      reason: input.reason?.trim() || null,
    },
  })
  return request.id
}

/**
 * Worker save. Validates the payload, plans the change and either writes it or
 * (when approved rows are touched) files an edit request. Admins pass
 * `gate.bypass` and get a direct write with APPROVED status.
 */
export async function saveAvailability(input: SaveInput, gate: AvailabilityGate): Promise<SaveOutcome> {
  const built = buildAvailabilityPayload(input.raw)
  if (!built.ok) return { error: built.error }

  const planned = await planSet(
    {
      staffId: input.staffId,
      dateKey: input.dateKey,
      payload: built.payload,
      repeat: input.repeat,
      scope: input.scope,
      seriesId: input.seriesId,
    },
    gate,
  )
  if (!planned.ok) return { error: planned.error }

  if (!gate.bypass && planned.plan.writeDates.length + planned.plan.removeDates.length > 0) {
    const approved = await rowsTouchedByPlan(input.staffId, planned.plan)
    if (approved.length > 0) {
      const requestId = await storeRequest(input, planned.plan)
      return { mode: 'REQUEST', requestId, skipped: planned.skipped }
    }
  }

  await executeSet(input.staffId, input.venueId, planned.plan, gate.bypass ? 'APPROVED' : initialStatus(built.payload))
  return { mode: 'SAVED', plan: planned.plan, skipped: planned.skipped }
}

/** Worker clear. Approved rows are protected the same way. */
export async function clearAvailability(
  input: { staffId: string; venueId: string; dateKey: string; scope: AvailabilityScope | null; seriesId: string | null; reason: string | null },
  gate: AvailabilityGate,
): Promise<SaveOutcome> {
  const planned = await planClear(
    { staffId: input.staffId, dateKey: input.dateKey, scope: input.scope, seriesId: input.seriesId },
    gate,
  )
  if (!planned.ok) return { error: planned.error }

  if (!gate.bypass && planned.plan.removeDates.length > 0) {
    const approved = await rowsTouchedByPlan(input.staffId, planned.plan)
    if (approved.length > 0) {
      const requestId = await storeRequest(input, planned.plan)
      return { mode: 'REQUEST', requestId, skipped: planned.skipped }
    }
  }

  await executeClear(input.staffId, planned.plan)
  return { mode: 'SAVED', plan: planned.plan, skipped: planned.skipped }
}

// ── Edit requests (admin) ─────────────────────────────────────────────────

/** Admin cancel: soft-delete PENDING declarations by id, or every still-pending
 *  occurrence of a series. Approved rows are never touched — the grid editor's
 *  clear handles those. */
export async function cancelPendingAvailability(input: {
  venueId: string
  ids?: string[]
  staffId?: string | null
  seriesId?: string | null
}): Promise<number> {
  const ids = (input.ids ?? []).filter((x): x is string => typeof x === 'string' && !!x)
  const where = ids.length > 0
    ? { id: { in: ids } }
    : input.seriesId && input.staffId
      ? { seriesId: input.seriesId, staffId: input.staffId }
      : null
  if (!where) return 0
  const result = await prisma.staffAvailability.updateMany({
    where: { ...where, venueId: input.venueId, deletedAt: null, status: 'PENDING' },
    data: { deletedAt: new Date() },
  })
  return result.count
}

export interface EditRequestRow {
  id: string
  staffId: string
  venueId: string
  scope: string
  date: Date
  seriesId: string | null
  action: string
  payload: unknown
  reason: string | null
  status: string
  reviewNote: string | null
  createdAt: Date
}

export function mapEditRequest(row: EditRequestRow) {
  return {
    id: row.id,
    staffId: row.staffId,
    date: formatDateKey(row.date),
    scope: row.scope as AvailabilityScope,
    seriesId: row.seriesId,
    action: row.action as 'SET' | 'CLEAR',
    payload: row.payload as AvailabilityPlan | null,
    reason: row.reason,
    status: row.status,
    reviewNote: row.reviewNote,
    createdAt: row.createdAt.toISOString(),
  }
}

/** Apply a stored edit request exactly as planned (admin authority). */
export async function applyEditRequest(id: string, actorId: string, reviewNote?: string | null): Promise<boolean> {
  const request = await prisma.availabilityEditRequest.findUnique({ where: { id } })
  if (!request || request.deletedAt || request.status !== 'PENDING') return false

  const plan = request.payload as unknown as AvailabilityPlan | null
  if (!plan) return false

  if (request.action === 'SET') {
    await executeSet(request.staffId, request.venueId, plan, 'APPROVED')
  } else {
    await executeClear(request.staffId, plan)
  }

  await prisma.availabilityEditRequest.update({
    where: { id },
    data: {
      status: 'APPLIED',
      reviewedById: actorId,
      reviewedAt: new Date(),
      reviewNote: reviewNote?.trim() || null,
    },
  })
  return true
}

/** Worker withdraws (cancels) their own pending edit request. The approved
 *  availability rows stay exactly as they are — the request just stops
 *  waiting. Only the owning staff member can withdraw, and only while PENDING. */
export async function withdrawEditRequest(id: string, staffId: string): Promise<boolean> {
  const request = await prisma.availabilityEditRequest.findUnique({ where: { id } })
  if (!request || request.deletedAt || request.status !== 'PENDING' || request.staffId !== staffId) return false
  await prisma.availabilityEditRequest.update({
    where: { id },
    data: { status: 'DISCARDED', reviewedAt: new Date(), deletedAt: new Date() },
  })
  return true
}

/** Discard a stored edit request — the approved rows stay as they are. */
export async function discardEditRequest(id: string, actorId: string, reviewNote?: string | null): Promise<boolean> {
  const request = await prisma.availabilityEditRequest.findUnique({ where: { id } })
  if (!request || request.deletedAt || request.status !== 'PENDING') return false
  await prisma.availabilityEditRequest.update({
    where: { id },
    data: {
      status: 'DISCARDED',
      reviewedById: actorId,
      reviewedAt: new Date(),
      reviewNote: reviewNote?.trim() || null,
    },
  })
  return true
}

// ── Reads ─────────────────────────────────────────────────────────────────

/** Series summaries (start / end / count) for a set of series ids. */
export async function loadSeriesSummaries(staffIds: string[], seriesIds: string[]) {
  const ids = [...new Set(seriesIds.filter(Boolean))]
  if (ids.length === 0) return [] as { id: string; staffId: string; startDate: string; endDate: string | null; count: number }[]
  const rows = await prisma.staffAvailability.findMany({
    where: { staffId: { in: staffIds }, seriesId: { in: ids }, deletedAt: null },
    select: { staffId: true, seriesId: true, date: true, seriesEndDate: true },
    orderBy: { date: 'asc' },
  })
  const bySeries = new Map<string, { staffId: string; dates: string[]; end: Date | null }>()
  for (const r of rows) {
    if (!r.seriesId) continue
    const bucket = bySeries.get(r.seriesId) ?? { staffId: r.staffId, dates: [], end: null }
    bucket.dates.push(formatDateKey(r.date))
    if (r.seriesEndDate) bucket.end = r.seriesEndDate
    bySeries.set(r.seriesId, bucket)
  }
  return [...bySeries.entries()].map(([id, b]) => ({
    id,
    staffId: b.staffId,
    startDate: b.dates[0],
    endDate: b.end ? formatDateKey(b.end) : null,
    count: b.dates.length,
  }))
}

/** Pending edit requests for a staff member in a date range. */
export async function loadPendingRequests(staffId: string, startKey: string, endKey: string) {
  const rows = await prisma.availabilityEditRequest.findMany({
    where: {
      staffId,
      status: 'PENDING',
      deletedAt: null,
      date: { gte: utcDay(startKey), lte: new Date(`${endKey}T23:59:59Z`) },
    },
    orderBy: { date: 'asc' },
  })
  return rows.map(mapEditRequest)
}
