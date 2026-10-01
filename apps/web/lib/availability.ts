// Pure staff-availability logic for the worker availability calendar and the
// Roster Editor overlay. One row per person per day carries a single state:
// UNAVAILABLE (hard block-out) or PREFERRED (casual opting in). No row is the
// DEFAULT — available for FT/PT, unset/standby for casuals.
//
// Prisma-free: the same functions run in the browser (live UI) and on the
// server (authoritative validation), so the worker calendar and the admin
// overlay can never disagree about what a colour means.

import { shiftDay } from '@/lib/date-nav'

export type AvailabilityType = 'UNAVAILABLE' | 'PREFERRED'
export type AvailabilityState = 'UNAVAILABLE' | 'PREFERRED' | 'DEFAULT'

export interface AvailabilityEntry {
  id?: string
  date: string // YYYY-MM-DD
  type: AvailabilityType
  isAllDay: boolean
  startTime: string | null // "HH:mm"
  endTime: string | null
  notes: string | null
}

/** Casuals opt IN to shifts; FT/PT block OUT exceptions. */
export function isCasual(employmentType: string | null | undefined): boolean {
  return (employmentType ?? '').trim().toUpperCase() === 'CASUAL'
}

/** The states a person may set. Casuals can prefer or block; FT/PT only block. */
export function allowedTypes(employmentType: string | null | undefined): AvailabilityType[] {
  return isCasual(employmentType) ? ['PREFERRED', 'UNAVAILABLE'] : ['UNAVAILABLE']
}

/** Resolve the logical state for a day from its (optional) entry. */
export function availabilityState(entry: { type: AvailabilityType } | undefined | null): AvailabilityState {
  if (!entry) return 'DEFAULT'
  return entry.type
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

/** Admin/worker display metadata for a state. A casual's DEFAULT is a warning
 *  ("UNSET" — they have not logged a preference); a FT/PT DEFAULT is fine. */
export function availabilityMeta(
  state: AvailabilityState,
  employmentType: string | null | undefined,
): AvailabilityMeta {
  if (state === 'UNAVAILABLE') {
    return { label: 'UNAVAILABLE', badge: 'border-danger text-danger', tint: 'bg-danger/10', dot: 'bg-danger' }
  }
  if (state === 'PREFERRED') {
    return { label: 'PREFERRED', badge: 'border-success text-success', tint: 'bg-success/10', dot: 'bg-success' }
  }
  return isCasual(employmentType)
    ? { label: 'UNSET', badge: 'border-grey-mid text-warning', tint: '', dot: 'bg-warning' }
    : { label: 'AVAILABLE', badge: 'border-grey-mid text-grey-light', tint: '', dot: 'bg-grey-mid' }
}

/** "HH:mm" → minutes since midnight. */
export function minutesOfTime(value: string): number {
  const [h, m] = value.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** Guard for the same HH:mm shape Shift uses. */
export function isValidAvailabilityTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

/**
 * True when a rostered shift window overlaps an UNAVAILABLE entry. An all-day
 * block always conflicts; a timed block conflicts only when the windows
 * overlap. PREFERRED entries are opt-ins and never block a shift.
 */
export function conflictsWithShift(
  entry: {
    type: AvailabilityType
    isAllDay: boolean
    startTime: string | null
    endTime: string | null
  } | undefined | null,
  startTime: string,
  endTime: string,
): boolean {
  if (!entry || entry.type !== 'UNAVAILABLE') return false
  if (entry.isAllDay || !entry.startTime || !entry.endTime) return true
  return (
    minutesOfTime(startTime) < minutesOfTime(entry.endTime) &&
    minutesOfTime(entry.startTime) < minutesOfTime(endTime)
  )
}

/**
 * The availability cut-off: any date before (today + lockDays) is locked.
 * lockDays 0 (or unset) = no lock. Past dates count as locked.
 */
export function isDateLocked(dateKey: string, lockDays: number, todayKey: string): boolean {
  if (!lockDays || lockDays <= 0) return false
  return dateKey < shiftDay(todayKey, lockDays)
}

/** `occurrences` weekly date keys starting at startKey (minimum 1). */
export function repeatWeekly(startKey: string, occurrences: number): string[] {
  const n = Math.max(1, Math.floor(occurrences) || 1)
  return Array.from({ length: n }, (_, i) => shiftDay(startKey, i * 7))
}

/** Human label for an entry's window. */
export function availabilityTimeLabel(entry: AvailabilityEntry): string {
  if (entry.isAllDay || !entry.startTime || !entry.endTime) return 'ALL DAY'
  return `${entry.startTime}–${entry.endTime}`
}
