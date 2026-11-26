// Room (Area) sharing scope — pure, Prisma-free so the predicate can be unit
// tested and imported anywhere.
//
// `Area.venueId` is still the room's owner. `AreaVenue` rows add the venues a
// room is shared with (plus one owner row for uniform reads). A read that should
// show shared rooms uses `areaWhereForVenues([activeVenue])`; a write must stay
// owner-only, so check `isAreaOwner()` before touching the row.
//
// This predicate is a Prisma `where` fragment, kept here (not in a *.server.ts)
// so its shape can be asserted in a test without a database.

export interface AreaScopeWhere {
  OR: Array<{
    venueId?: { in: string[] }
    venueLinks?: {
      some: {
        venueId: { in: string[] }
        deletedAt: null
      }
    }
  }>
}

/**
 * Prisma where-fragment matching every room a venue can see: rooms it owns and
 * rooms shared into it. An empty venue list matches nothing (Prisma treats
 * `OR: []` as false), so a caller with no scoped venue can never widen the read.
 */
export function areaWhereForVenues(
  venueIds: Array<string | null | undefined>,
): AreaScopeWhere {
  const ids = Array.from(
    new Set(venueIds.filter((v): v is string => typeof v === 'string' && v.trim() !== '')),
  )
  if (ids.length === 0) return { OR: [] }
  return {
    OR: [
      { venueId: { in: ids } },
      { venueLinks: { some: { venueId: { in: ids }, deletedAt: null } } },
    ],
  }
}

/** A room may only be edited/deleted by the venue that owns it. */
export function isAreaOwner(
  ownerVenueId: string,
  actingVenueId: string | null | undefined,
): boolean {
  return !!actingVenueId && ownerVenueId === actingVenueId
}
