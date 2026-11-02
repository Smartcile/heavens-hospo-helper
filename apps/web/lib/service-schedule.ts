// Pure schedule resolution for dated ordering services. No DB access — the
// routes feed these shapes in and sum covers against what's already booked.

export interface SlotRule {
  startTime: string // "HH:mm" venue-local
  endTime: string
  maxCovers: number
}

export interface ServiceScheduleInput {
  slots: { dayOfWeek: number; startTime: string; endTime: string; maxCovers: number }[]
  exceptions: { date: string; closed: boolean; startTime: string | null; endTime: string | null; maxCovers: number | null }[]
}

/** 0=Sun..6=Sat for a YYYY-MM-DD key. */
export function dayOfWeekForDate(dateKey: string): number {
  return new Date(dateKey + 'T00:00:00.000Z').getUTCDay()
}

export interface ResolvedSlots {
  /** closed = a date exception says no orders this day. */
  closed: boolean
  slots: SlotRule[]
}

/**
 * The slots a service offers on a date. A date exception with times overrides
 * the weekly rule; an exception marked closed shuts the day down; otherwise
 * the weekly rule for that day-of-week applies. A service with no rule on the
 * date resolves to closed with no slots (unavailable that day).
 */
export function slotsForDate(svc: ServiceScheduleInput, dateKey: string): ResolvedSlots {
  const ex = svc.exceptions.find((e) => e.date.slice(0, 10) === dateKey)
  if (ex) {
    if (ex.closed) return { closed: true, slots: [] }
    if (ex.startTime && ex.endTime) {
      return {
        closed: false,
        slots: [{ startTime: ex.startTime, endTime: ex.endTime, maxCovers: ex.maxCovers ?? 10 }],
      }
    }
  }

  const dow = dayOfWeekForDate(dateKey)
  const slots = svc.slots
    .filter((s) => s.dayOfWeek === dow)
    .sort((a, b) => (a.startTime < b.startTime ? -1 : 1))
    .map((s) => ({ startTime: s.startTime, endTime: s.endTime, maxCovers: s.maxCovers }))

  return { closed: slots.length === 0, slots }
}

/** A time "HH:mm" falls in [start, end). */
export function timeInSlot(time: string, start: string, end: string): boolean {
  return time >= start && time < end
}

/** The end time of the slot whose start matches, or null when not found. */
export function slotEndForTime(svc: ServiceScheduleInput, dateKey: string, time: string): string | null {
  const resolved = slotsForDate(svc, dateKey)
  if (resolved.closed) return null
  return resolved.slots.find((s) => s.startTime === time)?.endTime ?? null
}

/** "17:30" + 90 → "19:00". Used as the booking end when no slot matches. */
export function addMinutesHHMM(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  const hours = Math.floor(total / 60) % 24
  const mins = total % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

export interface CoverTotals {
  startTime: string
  endTime: string
  maxCovers: number
  /** Sum of party sizes of orders in the slot window. */
  usedCovers: number
  remaining: number
  /** Remaining >= the party size being asked for. */
  available: boolean
}

/**
 * Cover math for one date's slots. Orders count by their serviceTime (anywhere
 * in the slot window); bookings count at the slot's exact start (the public
 * booking API stamps bookings at the slot start).
 */
export function computeCoverTotals(
  slots: SlotRule[],
  partySize: number,
  orders: { serviceTime: string; partySize: number }[],
  bookings: { startTime: string; partySize: number }[],
): CoverTotals[] {
  return slots.map((s) => {
    const used =
      orders
        .filter((o) => timeInSlot(o.serviceTime, s.startTime, s.endTime))
        .reduce((sum, o) => sum + (o.partySize || 1), 0) +
      bookings
        .filter((b) => b.startTime === s.startTime)
        .reduce((sum, b) => sum + (b.partySize || 1), 0)
    const remaining = Math.max(0, s.maxCovers - used)
    return {
      startTime: s.startTime,
      endTime: s.endTime,
      maxCovers: s.maxCovers,
      usedCovers: used,
      remaining,
      available: remaining >= partySize,
    }
  })
}
