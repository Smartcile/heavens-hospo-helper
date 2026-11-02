// Pure service-table-plan seating. Given the physical tables of a service's
// table plan (FloorPlanSetup items) and the tables already taken for a time
// window, pick the tables that seat a party — the same greedy bin-packing the
// bookings route and the editor use, so every caller seats identically.
// The Prisma half lives in lib/service-seating.server.ts; this file stays
// client-safe.

import { planAutoSeat, type AutoSeatProfile } from './auto-seat'

export interface ServicePlanTable {
  id: string
  /** The furniture key (furnitureItemId, legacy tableProfileId) — placement
   *  matching must use this, never the item id: after the furniture migration
   *  every setup item carries null tableProfileId, so id-vs-key mismatches
   *  silently make every table unique and seating "works" but never reuses
   *  the same furniture type's number pool. */
  furnitureKey: string | null
  capacity: number
  chairCount: number
  width: number
  depth: number
  assignedNumber: string | null
}

export type SeatPlanFailure = 'NO_TABLES' | 'ALL_OCCUPIED' | 'NO_FIT'

export type SeatPlanResult =
  | { ok: true; itemIds: string[] }
  | { ok: false; reason: SeatPlanFailure }

/**
 * Seat `partySize` on the plan's tables, excluding `occupiedTableIds`
 * (bookings already seated on the same setup for an overlapping window).
 *
 * Matching mirrors the legacy explicit-setup path: placements are keyed by
 * furniture, and a placement that carries an assignedNumber prefers the item
 * holding that number. A table with no furniture (key null) is keyed by its
 * own id so it never collides with another.
 */
export function planSeatingOnTables(
  tables: ServicePlanTable[],
  occupiedTableIds: ReadonlySet<string>,
  partySize: number,
): SeatPlanResult {
  // Furniture-less items have no geometry (`resolvePlacedFurniture` null) and
  // were never seatable in the legacy path — keep them out of the pool so a
  // per-item key can't be double-picked by the packer.
  const seatable = tables.filter((t) => t.furnitureKey !== null)
  if (seatable.length === 0) return { ok: false, reason: 'NO_TABLES' }

  const available = seatable.filter((t) => !occupiedTableIds.has(t.id))
  if (available.length === 0) return { ok: false, reason: 'ALL_OCCUPIED' }

  const seatCapacity = (t: ServicePlanTable) => (t.capacity > 0 ? t.capacity : t.chairCount)

  // The packer's pass 2 adds only ONE overfill table, so it can return a
  // seating that doesn't actually cover the party. Gate on total capacity
  // first — a party bigger than the plan can seat is a NO_FIT, not a silent
  // squeeze onto fewer seats than they need.
  const totalCapacity = available.reduce((sum, t) => sum + seatCapacity(t), 0)
  if (totalCapacity < partySize) return { ok: false, reason: 'NO_FIT' }

  const keyOf = (t: ServicePlanTable) => t.furnitureKey ?? t.id

  const profiles: AutoSeatProfile[] = available.map((t) => ({
    id: keyOf(t),
    capacity: seatCapacity(t),
    chairCount: t.chairCount,
    width: t.width,
    depth: t.depth,
    tableNumbers: t.assignedNumber ? [t.assignedNumber] : [],
  }))

  const placements = planAutoSeat(partySize, profiles)
  if (placements.length === 0) return { ok: false, reason: 'NO_FIT' }

  const itemIds: string[] = []
  const used = new Set<string>()

  for (const placement of placements) {
    let match: ServicePlanTable | undefined
    if (placement.assignedNumber) {
      match = available.find(
        (t) => keyOf(t) === placement.profileId && t.assignedNumber === placement.assignedNumber && !used.has(t.id),
      )
    }
    if (!match) {
      match = available.find((t) => keyOf(t) === placement.profileId && !used.has(t.id))
    }
    if (match) {
      itemIds.push(match.id)
      used.add(match.id)
    }
  }

  return itemIds.length > 0 ? { ok: true, itemIds } : { ok: false, reason: 'NO_FIT' }
}
