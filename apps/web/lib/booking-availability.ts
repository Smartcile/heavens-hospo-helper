interface TimeSlot {
  date: string // "YYYY-MM-DD" venue-local date
  startTime: string // "HH:mm"
  endTime: string // "HH:mm"
}

interface ExistingBooking {
  id: string
  date: string
  startTime: string
  endTime: string
  partySize: number
  tables: { setupItemId: string }[]
}

interface TableInfo {
  id: string // SetupItem id
  profile: {
    id: string
    name: string
    capacity: number
    chairCount: number
    width: number
    depth: number
    colour: string | null
  }
  assignedNumber: string | null
}

interface SetupInfo {
  id: string
  name: string
  tables: TableInfo[]
}

export interface AvailabilityResult {
  available: boolean
  setup: SetupInfo
  availableTableCount: number
  totalCapacity: number
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/**
 * Two time slots overlap if one starts before the other ends AND
 * they are on the same date. This is used to determine which bookings
 * occupy tables in our target window.
 */
function slotsOverlap(a: TimeSlot, b: TimeSlot): boolean {
  if (a.date !== b.date) return false
  const aStart = timeToMinutes(a.startTime)
  const aEnd = timeToMinutes(a.endTime)
  const bStart = timeToMinutes(b.startTime)
  const bEnd = timeToMinutes(b.endTime)
  if (aEnd <= bStart) return false
  if (bEnd <= aStart) return false
  return true
}

/**
 * Checks per-setup table availability for a given date/time/party size.
 *
 * - Collects the full set of tables in the setup (all SetupItems).
 * - Removes any table that is booked in a conflicting time slot.
 * - Returns the count and total capacity of remaining tables.
 * - `available: true` means total capacity ≥ partySize.
 */
export function checkAvailability(
  slot: TimeSlot,
  partySize: number,
  setups: SetupInfo[],
  existingBookings: ExistingBooking[],
): AvailabilityResult[] {
  // Build a set of booked setupItemIds for any overlapping booking.
  const bookedTableIds = new Set<string>()
  for (const b of existingBookings) {
    if (slotsOverlap(slot, { date: b.date, startTime: b.startTime, endTime: b.endTime })) {
      for (const t of b.tables) bookedTableIds.add(t.setupItemId)
    }
  }

  return setups.map((setup) => {
    const free = setup.tables.filter((t) => !bookedTableIds.has(t.id))
    const totalCapacity = free.reduce((s, t) => s + t.profile.capacity, 0)
    return {
      available: totalCapacity >= partySize,
      setup,
      availableTableCount: free.length,
      totalCapacity,
    }
  })
}

/**
 * Returns the complete availability picture — which specific tables are free,
 * collectively they have capacity N, and enough capacity exists for the request.
 */
export function getAvailableTables(
  slot: TimeSlot,
  setups: SetupInfo[],
  existingBookings: ExistingBooking[],
): (AvailabilityResult & { freeTableIds: string[] })[] {
  const bookedTableIds = new Set<string>()
  for (const b of existingBookings) {
    if (slotsOverlap(slot, { date: b.date, startTime: b.startTime, endTime: b.endTime })) {
      for (const t of b.tables) bookedTableIds.add(t.setupItemId)
    }
  }

  return setups.map((setup) => {
    const free = setup.tables.filter((t) => !bookedTableIds.has(t.id))
    const totalCapacity = free.reduce((s, t) => s + t.profile.capacity, 0)
    return {
      available: totalCapacity >= 0, // always return; caller decides threshold
      setup,
      availableTableCount: free.length,
      totalCapacity,
      freeTableIds: free.map((t) => t.id),
    }
  })
}
