// Server half of room sharing: resolve whether an Area is reachable from a
// venue (owned or shared into it). Writes must additionally be owner-only —
// see `isAreaOwner` in `area-scope.ts` and the area routes.

import { prisma } from '@hospo-ops/db'
import { areaWhereForVenues } from './area-scope'

/** True when the room is owned by, or shared into, the given venue. */
export async function areaVisibleToVenue(areaId: string, venueId: string): Promise<boolean> {
  const area = await prisma.area.findFirst({
    where: { id: areaId, deletedAt: null, ...areaWhereForVenues([venueId]) },
    select: { id: true },
  })
  return !!area
}
