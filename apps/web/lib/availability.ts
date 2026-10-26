// Pure staff-availability logic for the worker availability calendar, the
// admin availability page and the Roster Editor overlay.
//
// A day carries full 15-minute windows: AVAILABLE / UNAVAILABLE. Declaring an
// AVAILABLE window auto-fills the rest of the day as UNAVAILABLE (the "anything
// I didn't mark available is time I can't work" rule); declaring only
// UNAVAILABLE windows is a partial block-out against the default. Weekly
// repeats materialise one row per occurrence sharing a `seriesId`.
//
// Prisma-free: the same functions run in the browser (live UI) and on the
// server (authoritative validation), so the worker calendar and the admin
// overlay can never disagree about what a colour means.

import { mondayOf, shiftDay } from '@/lib/date-nav'

export type AvailabilityType = 'UNAVAILABLE' | 'PREFERRED' | 'AVAILABLE'
export type AvailabilityState = 'UNAVAILABLE' | 'AVAILABLE' | 'PARTIAL' | 'DEFAULT'
export type AvailabilityWindowType = 'AVAILABLE' | 'UNAVAILABLE'
export type AvailabilityStatus = 'PENDING' | 'APPROVED' | 'DECLINED'
export type AvailabilityScope = 'THIS' | 'FROM' | 'ALL'

export interface AvailabilityWindow {
  type: AvailabilityWindowType
  startTime: string // "HH:mm" — 15-minute steps
  endTime: string // "HH:mm" or "24:00"
}

/** The availability half of a save payload / stored plan (client-safe shape). */
export interface AvailabilityPayloadLike {
  isAllDay: boolean
  type: AvailabilityType
  windows: AvailabilityWindow[]
  timeOff: boolean
  notes: string | null
}

export interface AvailabilityEntry {
  id?: string
  staffId?: string // admin views only
  date: string // YYYY-MM-DD
  type: AvailabilityType // dominant / all-day state
  isAllDay: boolean
  startTime: string | null // legacy single window
  endTime: string | null
  windows: AvailabilityWindow[]
  status: AvailabilityStatus
  timeOff: boolean
  notes: string | null
  reason: string | null
  reviewNote: string | null
  seriesId: string | null
  seriesEndDate: string | null // null with a seriesId = no end date
}

export interface AvailabilitySeries {
  id: string
  startDate: string
  endDate: string | null
  count: number
}

export interface AvailabilityPreset {
  key: string
  label: string
  startTime: string
  endTime: string
}

/** 15-minute resolution — the only times the editor and server accept. */
export const SLOT_MINUTES = 15
export const MINUTES_PER_DAY = 24 * 60

/** Weekly series with no end date materialise this many occurrences (2 years). */
export const SERIES_HORIZON_WEEKS = 104

export type Repeat = { weeks: number } | { noEnd: true }

// ── Day state ─────────────────────────────────────────────────────────────

/** Casuals opt IN to shifts; FT/PT block OUT exceptions. */
export function isCasual(employmentType: string | null | undefined): boolean {
  return (employmentType ?? '').trim().toUpperCase() === 'CASUAL'
}

/** The logical state for a day from its (optional) entry. A DECLINED request is
 *  not in force — it reads as DEFAULT (with the badge shown separately).
 *  Windowed days are judged by their FREE time: all day free = AVAILABLE, no
 *  free time = UNAVAILABLE, some free time = PARTIAL ("can work the morning,
 *  not the night" must never read as a blanket unavailable). */
export function availabilityState(entry: {
  type?: AvailabilityType
  isAllDay?: boolean
  startTime?: string | null
  endTime?: string | null
  windows?: AvailabilityWindow[] | null
  status?: AvailabilityStatus
} | undefined | null): AvailabilityState {
  if (!entry) return 'DEFAULT'
  if (entry.status === 'DECLINED') return 'DEFAULT'
  if (entry.isAllDay !== false) {
    return entry.type === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'AVAILABLE'
  }
  const windows = entryWindows(entry)
  if (windows.length === 0) return 'DEFAULT'
  const free = freeWindows(entry)
  if (free.length === 0) return 'UNAVAILABLE'
  if (free.length === 1 && minutesOfTime(free[0].startTime) === 0 && minutesOfTime(free[0].endTime) === MINUTES_PER_DAY) {
    return 'AVAILABLE'
  }
  return 'PARTIAL'
}

/** A stored entry's windows — explicit `windows`, or the legacy single window. */
export function entryWindows(entry: {
  type?: AvailabilityType
  isAllDay?: boolean
  startTime?: string | null
  endTime?: string | null
  windows?: AvailabilityWindow[] | null
}): AvailabilityWindow[] {
  const windows = normaliseWindows(entry.windows ?? [])
  if (windows.length > 0) return windows
  if (entry.isAllDay !== false) return []
  if (entry.startTime && entry.endTime && isValidAvailabilityTime(entry.startTime) && isValidAvailabilityTime(entry.endTime)) {
    const snapped = snapWindow({
      type: entry.type === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'AVAILABLE',
      startTime: entry.startTime,
      endTime: entry.endTime,
    })
    return snapped ? [snapped] : []
  }
  return []
}

/**
 * Snap a raw HH:mm window onto the 15-minute grid (start down, end up) —
 * legacy rows created before the grid existed still render and conflict
 * correctly instead of vanishing.
 */
export function snapWindow(window: AvailabilityWindow): AvailabilityWindow | null {
  if (minutesOfTime(window.endTime) <= minutesOfTime(window.startTime)) return null
  const start = Math.floor(minutesOfTime(window.startTime) / SLOT_MINUTES) * SLOT_MINUTES
  let end = Math.ceil(minutesOfTime(window.endTime) / SLOT_MINUTES) * SLOT_MINUTES
  if (end <= start) end = Math.min(MINUTES_PER_DAY, start + SLOT_MINUTES)
  return { type: window.type, startTime: fromMinutes(start), endTime: fromMinutes(end) }
}

/** The subset of a stored edit-request plan the UI needs to preview a proposal. */
export interface EditRequestProposalLike {
  action?: 'SET' | 'CLEAR'
  availability?: AvailabilityPayloadLike | null
}

/**
 * Turn a stored edit-request proposal into an `AvailabilityEntry` so the normal
 * day editor can open pre-filled with the worker's proposed state. Returns null
 * for a CLEAR request (there is no proposed day to edit) or an empty payload.
 */
export function proposalToEntry(input: {
  date: string
  payload: EditRequestProposalLike | null | undefined
  staffId?: string
  seriesId?: string | null
  seriesEndDate?: string | null
  status?: AvailabilityStatus
}): AvailabilityEntry | null {
  const proposal = input.payload
  if (!proposal || proposal.action === 'CLEAR') return null
  const availability = proposal.availability
  if (!availability) return null
  const isAllDay = availability.isAllDay !== false
  const windows = isAllDay ? [] : normaliseWindows(availability.windows)
  const type: AvailabilityType = isAllDay
    ? availability.type
    : windows.some((w) => w.type === 'UNAVAILABLE') ? 'UNAVAILABLE' : 'AVAILABLE'
  return {
    staffId: input.staffId,
    date: input.date,
    type,
    isAllDay,
    startTime: null,
    endTime: null,
    windows,
    status: input.status ?? 'PENDING',
    timeOff: availability.timeOff === true,
    notes: availability.notes ?? null,
    reason: null,
    reviewNote: null,
    seriesId: input.seriesId ?? null,
    seriesEndDate: input.seriesEndDate ?? null,
  }
}

export interface AvailabilityMeta {
  label: string
  /** Badge pill classes: `border ${badge}`. */
  badge: string
  /** Cell background tint (empty string = no tint). */
  tint: string
  /** Dot colour class. */
  dot: string
}

/** Display metadata for a state. A casual's DEFAULT is a warning ("UNSET" —
 *  they have not logged a preference); a FT/PT DEFAULT is fine. */
export function availabilityMeta(
  state: AvailabilityState,
  employmentType: string | null | undefined,
): AvailabilityMeta {
  if (state === 'UNAVAILABLE') {
    return { label: 'UNAVAILABLE', badge: 'border-danger text-danger', tint: 'bg-danger/10', dot: 'bg-danger' }
  }
  if (state === 'PARTIAL') {
    return { label: 'SPLIT', badge: 'border-warning text-warning', tint: 'bg-warning/10', dot: 'bg-warning' }
  }
  if (state === 'AVAILABLE') {
    return { label: 'AVAILABLE', badge: 'border-success text-success', tint: 'bg-success/10', dot: 'bg-success' }
  }
  return isCasual(employmentType)
    ? { label: 'UNSET', badge: 'border-grey-mid text-warning', tint: '', dot: 'bg-warning' }
    : { label: 'AVAILABLE', badge: 'border-grey-mid text-grey-light', tint: '', dot: 'bg-grey-mid' }
}

/** Approval badge metadata. */
export function statusMeta(status: AvailabilityStatus): { label: string; badge: string } {
  if (status === 'PENDING') return { label: 'PENDING', badge: 'border-warning text-warning' }
  if (status === 'DECLINED') return { label: 'DECLINED', badge: 'border-danger text-danger' }
  return { label: 'APPROVED', badge: 'border-success text-success' }
}

/** True when a day must be confirmed by a manager: any UNAVAILABLE time, or a
 *  time-off request tick. Pure-AVAILABLE days save instantly. */
export function needsApproval(entry: {
  type: AvailabilityType
  isAllDay: boolean
  windows: AvailabilityWindow[]
  timeOff: boolean
}): boolean {
  if (entry.timeOff) return true
  if (entry.isAllDay) return entry.type === 'UNAVAILABLE'
  return entry.windows.some((w) => w.type === 'UNAVAILABLE')
}

export function initialStatus(entry: {
  type: AvailabilityType
  isAllDay: boolean
  windows: AvailabilityWindow[]
  timeOff: boolean
}): AvailabilityStatus {
  return needsApproval(entry) ? 'PENDING' : 'APPROVED'
}

// ── Time helpers ──────────────────────────────────────────────────────────

/** "HH:mm" (or "24:00") → minutes since midnight. */
export function minutesOfTime(value: string): number {
  const [h, m] = value.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** Minutes since midnight → "HH:mm" ("24:00" for 1440). */
export function fromMinutes(minutes: number): string {
  const m = Math.max(0, Math.min(MINUTES_PER_DAY, Math.round(minutes)))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** Guard for the legacy single-window HH:mm shape (00:00–23:59). */
export function isValidAvailabilityTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

/** A 15-minute start time 00:00 … 23:45. */
export function isQuarterTime(value: string): boolean {
  return isValidAvailabilityTime(value) && minutesOfTime(value) % SLOT_MINUTES === 0
}

/** A 15-minute window end — 00:15 … 24:00. */
export function isValidWindowEnd(value: string): boolean {
  if (value === '24:00') return true
  return isQuarterTime(value)
}

/** Every 15-minute boundary in the day: 00:00 … 23:45. */
export function quarterHourOptions(): string[] {
  const out: string[] = []
  for (let m = 0; m < MINUTES_PER_DAY; m += SLOT_MINUTES) out.push(fromMinutes(m))
  return out
}

/** Every 15-minute window end: 00:15 … 23:45 plus 24:00 (midnight). */
export function quarterHourEndOptions(): string[] {
  const out: string[] = []
  for (let m = SLOT_MINUTES; m < MINUTES_PER_DAY; m += SLOT_MINUTES) out.push(fromMinutes(m))
  out.push('24:00')
  return out
}

/** Do two [start, end) windows overlap? */
export function windowsOverlap(
  a: { startTime: string; endTime: string },
  b: { startTime: string; endTime: string },
): boolean {
  return minutesOfTime(a.startTime) < minutesOfTime(b.endTime)
    && minutesOfTime(b.startTime) < minutesOfTime(a.endTime)
}

/**
 * Validate, order and de-overlap a window list (earliest start wins on an
 * overlap) and merge adjacent same-type windows. Invalid input is dropped.
 */
export function normaliseWindows(input: unknown): AvailabilityWindow[] {
  if (!Array.isArray(input)) return []
  const parsed: AvailabilityWindow[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const { type, startTime, endTime } = raw as Partial<AvailabilityWindow>
    if (type !== 'AVAILABLE' && type !== 'UNAVAILABLE') continue
    if (typeof startTime !== 'string' || typeof endTime !== 'string') continue
    if (!isQuarterTime(startTime) || !isValidWindowEnd(endTime)) continue
    if (minutesOfTime(endTime) <= minutesOfTime(startTime)) continue
    parsed.push({ type, startTime, endTime })
  }
  parsed.sort((a, b) =>
    minutesOfTime(a.startTime) - minutesOfTime(b.startTime)
    || minutesOfTime(a.endTime) - minutesOfTime(b.endTime))

  const out: AvailabilityWindow[] = []
  let cursor = 0
  for (const w of parsed) {
    const start = Math.max(minutesOfTime(w.startTime), cursor)
    const end = minutesOfTime(w.endTime)
    if (end <= start) continue
    const last = out[out.length - 1]
    if (last && last.type === w.type && start <= minutesOfTime(last.endTime)) {
      last.endTime = w.endTime
    } else {
      out.push({ type: w.type, startTime: fromMinutes(start), endTime: w.endTime })
    }
    cursor = end
  }
  return out
}

/**
 * The auto-complement: once a day has at least one AVAILABLE window, every gap
 * becomes an explicit UNAVAILABLE window — "available 7am–3pm" means
 * unavailable after 3pm without extra clicks. UNAVAILABLE-only days are left
 * as partial block-outs.
 */
export function autoComplement(windows: AvailabilityWindow[]): AvailabilityWindow[] {
  const clean = normaliseWindows(windows)
  if (!clean.some((w) => w.type === 'AVAILABLE')) return clean
  const out: AvailabilityWindow[] = []
  let cursor = 0
  for (const w of clean) {
    const start = minutesOfTime(w.startTime)
    if (start > cursor) {
      out.push({ type: 'UNAVAILABLE', startTime: fromMinutes(cursor), endTime: w.startTime })
    }
    out.push(w)
    cursor = minutesOfTime(w.endTime)
  }
  if (cursor < MINUTES_PER_DAY) {
    out.push({ type: 'UNAVAILABLE', startTime: fromMinutes(cursor), endTime: '24:00' })
  }
  return out
}

/** Add a window (the new window wins on overlap) and re-run the complement. */
export function addWindow(windows: AvailabilityWindow[], next: AvailabilityWindow): AvailabilityWindow[] {
  const nextStart = minutesOfTime(next.startTime)
  const nextEnd = minutesOfTime(next.endTime)
  const trimmed = normaliseWindows(windows).flatMap((w) => {
    const s = minutesOfTime(w.startTime)
    const e = minutesOfTime(w.endTime)
    if (e <= nextStart || s >= nextEnd) return [w]
    const parts: AvailabilityWindow[] = []
    if (s < nextStart) parts.push({ ...w, endTime: next.startTime })
    if (e > nextEnd) parts.push({ ...w, startTime: next.endTime })
    return parts
  })
  return autoComplement([...trimmed, next])
}

/**
 * Edit a window in a PARTITION (a list that covers the day, e.g. the
 * 00:00–09:00 / 09:00–17:00 / 17:00–24:00 shape) by moving the boundary with
 * it: pushing a boundary later pulls the neighbouring window's edge along, so
 * the day stays one clean red/green run instead of sprouting a new little
 * block. Only available for partitions — in a partial block-out the marks are
 * independent and `addWindow` is the right operation.
 */
export function spliceWindow(
  windows: AvailabilityWindow[],
  index: number,
  next: AvailabilityWindow,
): AvailabilityWindow[] {
  const clean = normaliseWindows(windows)
  if (index < 0 || index >= clean.length) return addWindow(clean, next)
  const old = clean[index]
  if (minutesOfTime(next.endTime) <= minutesOfTime(next.startTime)) return clean

  const updated = clean.map((w, i) => (i === index ? { ...next } : { ...w }))
  const movedStart = minutesOfTime(next.startTime) !== minutesOfTime(old.startTime)
  const movedEnd = minutesOfTime(next.endTime) !== minutesOfTime(old.endTime)
  if (movedStart && index > 0) {
    updated[index - 1] = { ...updated[index - 1], endTime: next.startTime }
  }
  if (movedEnd && index < updated.length - 1) {
    updated[index + 1] = { ...updated[index + 1], startTime: next.endTime }
  }
  return normaliseWindows(autoComplement(normaliseWindows(updated)))
}

/** Remove a window by index (the rest keeps its shape — no re-complement). */
export function removeWindow(windows: AvailabilityWindow[], index: number): AvailabilityWindow[] {
  return normaliseWindows(windows.filter((_, i) => i !== index))
}

/** A partition (an AVAILABLE window exists) cannot drop its gap windows. */
export function windowsArePartition(windows: AvailabilityWindow[]): boolean {
  return windows.some((w) => w.type === 'AVAILABLE')
}

/** "07:00–15:00" for one window. */
export function formatWindow(w: { startTime: string; endTime: string }): string {
  return `${w.startTime}–${w.endTime}`
}

/** A one-line summary of a day's windows: "ALL DAY", "07:00–15:00 +2" … */
export function describeWindows(windows: AvailabilityWindow[], isAllDay: boolean, type: AvailabilityType): string {
  if (isAllDay || windows.length === 0) return 'ALL DAY'
  const first = formatWindow(windows[0])
  if (windows.length === 1) return first
  return `${first} +${windows.length - 1}`
}

// ── Free-time windows ─────────────────────────────────────────────────────

interface MinuteInterval {
  start: number
  end: number
}

function subtractInterval(list: MinuteInterval[], cut: MinuteInterval): MinuteInterval[] {
  const out: MinuteInterval[] = []
  for (const iv of list) {
    if (cut.end <= iv.start || cut.start >= iv.end) {
      out.push(iv)
      continue
    }
    if (cut.start > iv.start) out.push({ start: iv.start, end: cut.start })
    if (cut.end < iv.end) out.push({ start: cut.end, end: iv.end })
  }
  return out
}

function mergeIntervals(list: MinuteInterval[]): MinuteInterval[] {
  const sorted = [...list].sort((a, b) => a.start - b.start)
  const out: MinuteInterval[] = []
  for (const iv of sorted) {
    const last = out[out.length - 1]
    if (last && iv.start <= last.end) last.end = Math.max(last.end, iv.end)
    else out.push({ ...iv })
  }
  return out
}

/**
 * The day's genuinely free windows. A partition day (any AVAILABLE window)
 * frees exactly those windows; a block-out day (UNAVAILABLE-only) frees the
 * whole day minus the blocked windows. No free time = [].
 */
export function freeWindows(entry: {
  type?: AvailabilityType
  isAllDay?: boolean
  startTime?: string | null
  endTime?: string | null
  windows?: AvailabilityWindow[] | null
}): AvailabilityWindow[] {
  if (entry.isAllDay !== false) {
    return entry.type === 'UNAVAILABLE' ? [] : [{ type: 'AVAILABLE', startTime: '00:00', endTime: '24:00' }]
  }
  const windows = entryWindows(entry)
  if (windows.length === 0) {
    return entry.type === 'UNAVAILABLE' ? [] : [{ type: 'AVAILABLE', startTime: '00:00', endTime: '24:00' }]
  }
  const available = windows.filter((w) => w.type === 'AVAILABLE')
  let free: MinuteInterval[] =
    available.length > 0
      ? mergeIntervals(available.map((w) => ({ start: minutesOfTime(w.startTime), end: minutesOfTime(w.endTime) })))
      : [{ start: 0, end: MINUTES_PER_DAY }]
  for (const block of windows.filter((w) => w.type === 'UNAVAILABLE')) {
    free = subtractInterval(free, { start: minutesOfTime(block.startTime), end: minutesOfTime(block.endTime) })
  }
  return mergeIntervals(free).map((iv) => ({
    type: 'AVAILABLE' as const,
    startTime: fromMinutes(iv.start),
    endTime: fromMinutes(iv.end),
  }))
}

/** Free windows still ahead of `minutes` — the "today" evaluation (past
 *  windows are history; the window containing now is clipped to now). */
export function freeWindowsFrom(
  entry: {
    type?: AvailabilityType
    isAllDay?: boolean
    startTime?: string | null
    endTime?: string | null
    windows?: AvailabilityWindow[] | null
  },
  minutes: number,
): AvailabilityWindow[] {
  const out: AvailabilityWindow[] = []
  for (const w of freeWindows(entry)) {
    const end = minutesOfTime(w.endTime)
    if (end <= minutes) continue
    out.push({
      type: 'AVAILABLE',
      startTime: fromMinutes(Math.max(minutesOfTime(w.startTime), minutes)),
      endTime: w.endTime,
    })
  }
  return out
}

/** True when any free time is left after `minutes` (free NOW). */
export function isFreeAt(entry: Parameters<typeof freeWindows>[0], minutes: number): boolean {
  return freeWindowsFrom(entry, minutes).length > 0
}

/** "FREE ALL DAY" / "FREE 07:00–12:00" / "FREE 07:00–12:00 +1" / "NO FREE TIME".
 *  Pass `minutes` to evaluate only what is left today. */
export function describeFreeWindows(
  entry: Parameters<typeof freeWindows>[0],
  minutes?: number,
): string {
  const free = typeof minutes === 'number' ? freeWindowsFrom(entry, minutes) : freeWindows(entry)
  if (free.length === 0) return 'NO FREE TIME'
  if (free.length === 1 && minutesOfTime(free[0].startTime) === 0 && minutesOfTime(free[0].endTime) === MINUTES_PER_DAY) {
    return 'FREE ALL DAY'
  }
  const first = formatWindow(free[0])
  return free.length === 1 ? `FREE ${first}` : `FREE ${first} +${free.length - 1}`
}

// ── Conflicts + locks ─────────────────────────────────────────────────────

/**
 * True when a rostered shift window overlaps UNAVAILABLE time on the day.
 * All-day UNAVAILABLE blocks anything; windowed entries conflict only on a
 * real overlap. AVAILABLE and DECLINED entries never block.
 */
export function conflictsWithShift(
  entry: {
    type: AvailabilityType
    isAllDay: boolean
    startTime: string | null
    endTime: string | null
    windows?: AvailabilityWindow[] | null
    status?: AvailabilityStatus
  } | undefined | null,
  startTime: string,
  endTime: string,
): boolean {
  if (!entry || entry.status === 'DECLINED') return false
  if (entry.isAllDay !== false) return entry.type === 'UNAVAILABLE'
  const shift = { startTime, endTime }
  return entryWindows(entry).some((w) => w.type === 'UNAVAILABLE' && windowsOverlap(w, shift))
}

/** A date before today (venue-local) is history — workers never edit it. */
export function isPastDate(dateKey: string, todayKey: string): boolean {
  return dateKey < todayKey
}

/**
 * The worker-level edit gate for a date: not in the past, and not inside the
 * venue's near-term lock-out. Managers/admins bypass.
 */
export function canWorkerEditDate(dateKey: string, lockDays: number, todayKey: string): boolean {
  return !isPastDate(dateKey, todayKey) && !isDateLocked(dateKey, lockDays, todayKey)
}

/**
 * The availability cut-off: any date before (today + lockDays) is locked.
 * lockDays 0 (or unset) = no near-term lock (past dates still blocked above).
 */
export function isDateLocked(dateKey: string, lockDays: number, todayKey: string): boolean {
  if (!lockDays || lockDays <= 0) return false
  return dateKey < shiftDay(todayKey, lockDays)
}

// ── Weekly request cut-off ────────────────────────────────────────────────

export interface AvailabilityCutoff {
  day: number // 0 = Sunday … 6 = Saturday
  time: string // "HH:mm"
}

export const AVAILABILITY_WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const

/** Validate + normalise a venue's cut-off payload. Null = no cut-off. */
export function parseAvailabilityCutoff(raw: unknown): AvailabilityCutoff | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as { day?: unknown; time?: unknown }
  const day = Math.floor(Number(row.day))
  if (!Number.isFinite(day) || day < 0 || day > 6) return null
  if (typeof row.time !== 'string' || !isQuarterTime(row.time)) return null
  return { day, time: row.time }
}

/**
 * The deadline for a date's roster week: the most recent occurrence of the
 * cut-off weekday before that week's Monday. Changes for the week auto-approve
 * until this moment, then become manager requests.
 */
export function cutoffDeadlineKey(dateKey: string, cutoff: AvailabilityCutoff): string {
  const monday = mondayOf(dateKey)
  const offset = ((cutoff.day - 1) % 7 + 7) % 7
  return shiftDay(monday, -7 + offset)
}

/** True once the deadline for `dateKey`'s week has passed. */
export function isPastCutoff(
  dateKey: string,
  cutoff: AvailabilityCutoff,
  nowKey: string,
  nowMinutes: number,
): boolean {
  const deadline = cutoffDeadlineKey(dateKey, cutoff)
  if (nowKey !== deadline) return nowKey > deadline
  return nowMinutes >= minutesOfTime(cutoff.time)
}

/** "THURSDAY 17:00" — the settings + worker hint label. */
export function describeAvailabilityCutoff(cutoff: AvailabilityCutoff): string {
  return `${AVAILABILITY_WEEKDAYS[cutoff.day]} ${cutoff.time}`
}

// ── Weekly series ─────────────────────────────────────────────────────────

/** `occurrences` weekly date keys starting at startKey (minimum 1). */
export function repeatWeekly(startKey: string, occurrences: number): string[] {
  const n = Math.max(1, Math.floor(occurrences) || 1)
  return Array.from({ length: n }, (_, i) => shiftDay(startKey, i * 7))
}

/** The last date of a `weeks`-long weekly series starting at startKey. */
export function seriesEndDateKey(startKey: string, weeks: number): string {
  const dates = repeatWeekly(startKey, weeks)
  return dates[dates.length - 1]
}

/** How many whole weeks a start→end series spans (minimum 1). */
export function weeksForSeries(startKey: string, endKey: string): number {
  const days = Math.round((Date.parse(`${endKey}T00:00:00Z`) - Date.parse(`${startKey}T00:00:00Z`)) / 86_400_000)
  return Math.max(1, Math.floor(days / 7) + 1)
}

/** Every occurrence date for a repeat, capped at the materialisation horizon. */
export function occurrencesForRepeat(startKey: string, repeat: Repeat): string[] {
  if ('noEnd' in repeat) return repeatWeekly(startKey, SERIES_HORIZON_WEEKS)
  return repeatWeekly(startKey, repeat.weeks)
}

/** "NO END DATE" / "ENDS 22 OCT 2026". */
export function describeSeriesEnd(endDate: string | null): string {
  if (!endDate) return 'NO END DATE'
  const [y, m, d] = endDate.split('-').map(Number)
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  return `ENDS ${String(d).padStart(2, '0')} ${months[(m || 1) - 1]} ${y}`
}

/** Summarise a series' dates into start/end/count for display + editing. */
export function summariseSeries(id: string, dates: string[]): AvailabilitySeries {
  const sorted = [...dates].filter(Boolean).sort()
  return {
    id,
    startDate: sorted[0] ?? '',
    endDate: sorted[sorted.length - 1] ?? null,
    count: sorted.length,
  }
}

// ── Venue presets ─────────────────────────────────────────────────────────

export const AVAILABILITY_PRESET_KEYS = ['MORNING', 'AFTERNOON', 'EVENING'] as const

export const DEFAULT_AVAILABILITY_PRESETS: AvailabilityPreset[] = [
  { key: 'MORNING', label: 'MORNING', startTime: '07:00', endTime: '12:00' },
  { key: 'AFTERNOON', label: 'AFTERNOON', startTime: '12:00', endTime: '17:00' },
  { key: 'EVENING', label: 'EVENING', startTime: '17:00', endTime: '23:00' },
]

/**
 * The venue's morning/afternoon/evening quick-picks: editable in Settings →
 * GENERAL, validated against the 15-minute grid, falling back to the defaults
 * for anything missing or invalid.
 */
export function resolveAvailabilityPresets(raw: unknown): AvailabilityPreset[] {
  const rows = Array.isArray(raw) ? raw : []
  return DEFAULT_AVAILABILITY_PRESETS.map((def) => {
    const found = rows.find((r) => r && typeof r === 'object' && (r as AvailabilityPreset).key === def.key)
    if (!found) return def
    const row = found as Partial<AvailabilityPreset>
    const start = row.startTime
    const end = row.endTime
    if (typeof start !== 'string' || typeof end !== 'string') return def
    if (!isQuarterTime(start) || !isValidWindowEnd(end)) return def
    if (minutesOfTime(end) <= minutesOfTime(start)) return def
    return { ...def, startTime: start, endTime: end, label: def.label }
  })
}

/** A preset as an AVAILABLE window ready to add to a day. */
export function presetWindow(preset: AvailabilityPreset): AvailabilityWindow {
  return { type: 'AVAILABLE', startTime: preset.startTime, endTime: preset.endTime }
}
