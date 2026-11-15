// Read-only FTP health state for pages/widgets. Deliberately does NOT import
// the browser module, so `/park` and the dashboard can read the cached state
// without loading Playwright.

import { prisma } from '@hospo-ops/db'
import { parkingHealthState, wallClockParts, type ParkingHealthState } from './parking'

export interface FtpTypeHealth extends ParkingHealthState {
  typeId: string
  name: string
  lastCheckAt: Date | null
}

function localDate(date: Date, timezone: string): string {
  return wallClockParts(date, timezone).date
}

export async function ftpHealthForVenue(
  venueId: string,
  now: Date = new Date(),
): Promise<FtpTypeHealth[]> {
  const [types, venue] = await Promise.all([
    prisma.ftpParkingType.findMany({
      where: { venueId, isActive: true, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.venue.findUnique({ where: { id: venueId }, select: { timezone: true } }),
  ])
  const timezone = venue?.timezone || 'Pacific/Auckland'
  return types.map((type) => {
    const state = parkingHealthState(
      type.lastCheckAt,
      type.lastCheckOk,
      type.lastCheckMessage,
      now,
    )
    if (
      type.lastCheckAt &&
      localDate(type.lastCheckAt, timezone) !== localDate(now, timezone)
    ) {
      return {
        ...state,
        stale: true,
        typeId: type.id,
        name: type.name,
        lastCheckAt: type.lastCheckAt,
      }
    }
    return { ...state, typeId: type.id, name: type.name, lastCheckAt: type.lastCheckAt }
  })
}

/** The most relevant health state for the dashboard ATTENTION widget. */
export function worstFtpHealth(states: FtpTypeHealth[]): ParkingHealthState | null {
  if (states.length === 0) return null
  const failed = states.find((state) => !state.ok)
  return failed ?? states[0]
}
