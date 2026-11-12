// Pure working-slot rules. A slot is a reusable shift preset (role + time
// window + headcount), not an unassigned requirement layer. Prisma-free.

import { isValidTime } from '@/lib/calendar'

export const SLOT_HEADCOUNT_MIN = 1
export const SLOT_HEADCOUNT_MAX = 50

export interface RosterSlotInput {
  name?: string | null
  startTime?: string | null
  endTime?: string | null
  breakMinutes?: number | null
  headcount?: number | null
}

/** Validation messages, empty when the slot is valid. */
export function validateRosterSlot(input: RosterSlotInput): string[] {
  const errors: string[] = []
  if (!input.name?.trim()) errors.push('NAME IS REQUIRED')
  if (!isValidTime(String(input.startTime ?? ''))) errors.push('START TIME MUST BE HH:mm')
  if (!isValidTime(String(input.endTime ?? ''))) errors.push('END TIME MUST BE HH:mm')
  if (input.startTime && input.endTime && input.startTime === input.endTime) {
    errors.push('START AND END MUST DIFFER')
  }
  if (input.breakMinutes != null && (!Number.isFinite(Number(input.breakMinutes)) || Number(input.breakMinutes) < 0)) {
    errors.push('BREAK MUST BE ZERO OR MORE')
  }
  const headcount = Number(input.headcount)
  if (!Number.isInteger(headcount) || headcount < SLOT_HEADCOUNT_MIN || headcount > SLOT_HEADCOUNT_MAX) {
    errors.push(`HEADCOUNT MUST BE ${SLOT_HEADCOUNT_MIN}–${SLOT_HEADCOUNT_MAX}`)
  }
  return errors
}

export interface SlotPlacementPlan {
  /** Valid, de-duplicated staff in the order supplied. */
  selected: string[]
  /** Selected ids that are not active staff in the venue. */
  skippedStaffIds: string[]
  /** Headcount seats left unfilled. */
  skippedSeats: number
  /** Set when more than the headcount was selected. */
  error: string | null
}

/**
 * Resolve the staff chosen for a slot's seats. Selecting fewer people than the
 * headcount is allowed (the rest are reported as unselected seats); selecting
 * more is an error so a slot never silently drops someone.
 */
export function planSlotPlacement(
  headcount: number,
  staffIds: string[],
  validStaffIds: Iterable<string>,
): SlotPlacementPlan {
  const valid = new Set(validStaffIds)
  const seen = new Set<string>()
  const selected: string[] = []
  const skippedStaffIds: string[] = []

  for (const id of staffIds) {
    if (!id || seen.has(id)) continue
    seen.add(id)
    if (valid.has(id)) selected.push(id)
    else skippedStaffIds.push(id)
  }

  const seats = Math.max(SLOT_HEADCOUNT_MIN, Math.min(SLOT_HEADCOUNT_MAX, Math.trunc(headcount) || 1))
  if (selected.length > seats) {
    return {
      selected,
      skippedStaffIds,
      skippedSeats: 0,
      error: `ONLY ${seats} SEAT${seats === 1 ? '' : 'S'} — SELECT FEWER STAFF`,
    }
  }

  return {
    selected,
    skippedStaffIds,
    skippedSeats: seats - selected.length,
    error: null,
  }
}

/** "2 SEATS · 07:00–16:00 · DUTY MANAGER" — a compact slot description. */
export function describeRosterSlot(slot: {
  name: string
  headcount: number
  startTime: string
  endTime: string
  positionName?: string | null
}): string {
  const seats = `${slot.headcount} SEAT${slot.headcount === 1 ? '' : 'S'}`
  return [seats, `${slot.startTime}–${slot.endTime}`, slot.positionName || slot.name].join(' · ')
}
