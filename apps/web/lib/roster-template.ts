// Pure week→template mapping. Templates store shifts against a Monday-first
// day index (0 = Monday … 6 = Sunday), so the same template can be applied to
// any week. Prisma-free: routes and the UI share these helpers.

import { parseDay, shiftDay } from '@/lib/date-nav'

export type RosterApplyMode = 'ADD' | 'REPLACE'

/** A shift as captured in a template (day-index based). */
export interface TemplateShift {
  staffId: string
  positionId: string | null
  dayIndex: number
  startTime: string
  endTime: string
  breakMinutes: number
  colour: string | null
  tag: string | null
  note: string | null
  sortOrder: number
}

/** A source week shift — the subset of Shift fields the mapping needs. */
export interface WeekShiftInput {
  staffId: string
  positionId?: string | null
  date: string // YYYY-MM-DD
  startTime: string
  endTime: string
  breakMinutes?: number
  colour?: string | null
  tag?: string | null
  note?: string | null
}

/** A shift ready to be written to a target week. */
export interface WeekShiftRow {
  staffId: string
  positionId: string | null
  date: string // YYYY-MM-DD
  startTime: string
  endTime: string
  breakMinutes: number
  colour: string | null
  tag: string | null
  note: string | null
  sortOrder: number
}

export interface BuildWeekResult {
  rows: WeekShiftRow[]
  /** Staff referenced by the template/week that are missing or inactive. */
  skippedStaffIds: string[]
}

/** 0 = Monday … 6 = Sunday for a "YYYY-MM-DD" key. */
export function dayIndexFromDate(dateKey: string): number {
  return (parseDay(dateKey).getUTCDay() + 6) % 7
}

/** The date key for a day index within the week starting at `weekStart`. */
export function dateForDayIndex(weekStart: string, dayIndex: number): string {
  return shiftDay(weekStart, Math.max(0, Math.min(6, Math.trunc(dayIndex))))
}

export function weekRange(weekStart: string): { start: string; end: string } {
  return { start: weekStart, end: shiftDay(weekStart, 6) }
}

export function isDateInWeek(dateKey: string, weekStart: string): boolean {
  const { end } = weekRange(weekStart)
  return dateKey >= weekStart && dateKey <= end
}

/**
 * Capture a week's shifts as template rows, normalised to Monday–Sunday day
 * indexes. Shifts outside the week are dropped; the rest keep their order
 * (sorted by day/time for a stable template).
 */
export function normaliseWeekToTemplate(shifts: WeekShiftInput[], weekStart: string): TemplateShift[] {
  return shifts
    .filter((s) => isDateInWeek(s.date, weekStart))
    .slice()
    .sort((a, b) => (a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)))
    .map((s, i) => ({
      staffId: s.staffId,
      positionId: s.positionId ?? null,
      dayIndex: dayIndexFromDate(s.date),
      startTime: s.startTime,
      endTime: s.endTime,
      breakMinutes: Math.max(0, Math.round(s.breakMinutes ?? 0)),
      colour: s.colour ?? null,
      tag: s.tag ?? null,
      note: s.note ?? null,
      sortOrder: i,
    }))
}

/**
 * Turn template rows into shifts for a target week. Any staff id not present
 * in `validStaffIds` (missing, soft-deleted or inactive) is skipped and
 * reported once.
 */
export function buildTemplateWeekRows(
  templateShifts: TemplateShift[],
  targetWeekStart: string,
  validStaffIds: Iterable<string>,
): BuildWeekResult {
  const valid = new Set(validStaffIds)
  const skipped = new Set<string>()
  const rows: WeekShiftRow[] = []

  for (const t of templateShifts) {
    if (!valid.has(t.staffId)) {
      skipped.add(t.staffId)
      continue
    }
    rows.push({
      staffId: t.staffId,
      positionId: t.positionId ?? null,
      date: dateForDayIndex(targetWeekStart, t.dayIndex),
      startTime: t.startTime,
      endTime: t.endTime,
      breakMinutes: Math.max(0, Math.round(t.breakMinutes ?? 0)),
      colour: t.colour ?? null,
      tag: t.tag ?? null,
      note: t.note ?? null,
      sortOrder: t.sortOrder,
    })
  }

  return { rows, skippedStaffIds: [...skipped] }
}

/**
 * Copy a source week directly onto a target week. Reuses the template mapping
 * so the same staff-skip rules apply.
 */
export function buildCopyWeekRows(
  sourceShifts: WeekShiftInput[],
  sourceWeekStart: string,
  targetWeekStart: string,
  validStaffIds: Iterable<string>,
): BuildWeekResult {
  const template = normaliseWeekToTemplate(sourceShifts, sourceWeekStart)
  return buildTemplateWeekRows(template, targetWeekStart, validStaffIds)
}

/** Validate an apply/copy mode string. */
export function normaliseApplyMode(mode: unknown): RosterApplyMode {
  return mode === 'REPLACE' ? 'REPLACE' : 'ADD'
}

/** Validate a "YYYY-MM-DD" date key. */
export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = parseDay(value)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}
