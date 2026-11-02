// Pure staff-grouping helpers shared by the admin staff grids — availability,
// roster, clocks and payroll: items are grouped under the highest-ranked
// Position the person holds (so a senior who is also a manager sits with the
// managers), and the position groups are reordered by drag-and-drop —
// persisted on `Position.sortOrder`.
//
// Prisma- and DOM-free, so the same rules can be unit-tested and the grids
// cannot disagree about which group a person lands in.

export const NO_POSITION_KEY = '__no_position__'

export interface StaffGroupPosition {
  id: string
  name: string
  colour?: string | null
}

export interface StaffGroupsMember {
  id: string
  firstName: string
  lastName: string
  positions?: { id: string; name: string; colour?: string | null }[]
}

export interface StaffGroup<T> {
  /** Position id, or `NO_POSITION_KEY` for the trailing unassigned bucket. */
  key: string
  positionId: string | null
  label: string
  colour: string | null
  items: T[]
}

/** The held position that ranks highest in `order` (lowest index), or null. */
export function topPositionId(held: { id: string }[] | undefined, order: string[]): string | null {
  let best: string | null = null
  let bestIndex = Infinity
  for (const p of held ?? []) {
    const idx = order.indexOf(p.id)
    if (idx >= 0 && idx < bestIndex) {
      best = p.id
      bestIndex = idx
    }
  }
  return best
}

/**
 * Group any list (staff rows, clock sessions, payroll entries) under the
 * highest-ranked position the item maps to. Groups follow `positions` order
 * (the persisted drag order); empty groups are omitted and items mapping to no
 * listed position fall into one `NO POSITION` group at the bottom.
 */
export function groupByPosition<T>(
  items: T[],
  positions: StaffGroupPosition[],
  positionIdsOf: (item: T) => string[] | undefined,
): StaffGroup<T>[] {
  const order = positions.map((p) => p.id)
  const buckets = new Map<string, T[]>()
  for (const item of items) {
    const key = topPositionId((positionIdsOf(item) ?? []).map((id) => ({ id })), order) ?? NO_POSITION_KEY
    buckets.set(key, [...(buckets.get(key) ?? []), item])
  }

  const groups: StaffGroup<T>[] = []
  for (const p of positions) {
    const members = buckets.get(p.id)
    if (members?.length) {
      groups.push({ key: p.id, positionId: p.id, label: p.name, colour: p.colour ?? null, items: members })
    }
  }
  const none = buckets.get(NO_POSITION_KEY)
  if (none?.length) {
    groups.push({ key: NO_POSITION_KEY, positionId: null, label: 'NO POSITION', colour: null, items: none })
  }
  return groups
}

/** Group staff rows by their highest-ranked held position. */
export function buildStaffGroups<T extends StaffGroupsMember>(
  staff: T[],
  positions: StaffGroupPosition[],
): StaffGroup<T>[] {
  return groupByPosition(staff, positions, (s) => s.positions?.map((p) => p.id))
}

/**
 * Derive a position list from the loaded items — the fallback for views whose
 * positions fetch is unavailable (a grant-restricted manager); encounter order
 * still groups correctly, it just isn't the persisted drag order.
 */
export function collectPositions<T>(
  items: T[],
  positionsOf: (item: T) => { id: string; name: string; colour?: string | null }[] | undefined,
): StaffGroupPosition[] {
  const out: StaffGroupPosition[] = []
  const seen = new Set<string>()
  for (const item of items) {
    for (const p of positionsOf(item) ?? []) {
      if (seen.has(p.id)) continue
      seen.add(p.id)
      out.push({ id: p.id, name: p.name, colour: p.colour ?? null })
    }
  }
  return out
}

/**
 * Reorder only the `before` members of `all`, dropping `after` back into the
 * slots the subset occupied — hidden positions keep their place. A length
 * mismatch means the caller's view is stale, so `all` is returned untouched.
 */
export function insertSubset(all: string[], before: string[], after: string[]): string[] {
  const beforeSet = new Set(before)
  const slots: number[] = []
  all.forEach((id, i) => {
    if (beforeSet.has(id)) slots.push(i)
  })
  if (slots.length !== after.length) return all
  const out = [...all]
  slots.forEach((slot, i) => {
    out[slot] = after[i]
  })
  return out
}

/** Stable float of "available for the pinned day" staff to the front. */
export function sortByPinnedAvailability<T extends { id: string }>(
  staff: T[],
  isAvailable: (s: T) => boolean,
): T[] {
  return [...staff].sort((a, b) => Number(isAvailable(b)) - Number(isAvailable(a)))
}
