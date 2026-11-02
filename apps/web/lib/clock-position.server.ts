// Resolve which role a time-clock session should be paid as, from the staff
// member's rostered shift(s) for that (venue-local) day. Prisma-backed.

import { prisma } from '@hospo-ops/db'

function localParts(at: Date, timezone: string): { dateKey: string; hhmm: string } {
  const dateFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const timeFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const p = dateFmt.formatToParts(at)
  const t = timeFmt.formatToParts(at)
  const y = p.find((x) => x.type === 'year')?.value
  const m = p.find((x) => x.type === 'month')?.value
  const d = p.find((x) => x.type === 'day')?.value
  const hh = t.find((x) => x.type === 'hour')?.value ?? '00'
  const mm = t.find((x) => x.type === 'minute')?.value ?? '00'
  return { dateKey: `${y}-${m}-${d}`, hhmm: `${hh === '24' ? '00' : hh}:${mm}` }
}

/**
 * The position for a clock session: the role on the staff member's shift that
 * day. Prefers the shift whose window contains the punch time; falls back to the
 * only/first shift. Null when there is no rostered role (⇒ base rate).
 */
export async function resolveClockPosition(staffId: string, venueId: string, at: Date): Promise<string | null> {
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { timezone: true } })
  const tz = venue?.timezone || process.env.DEFAULT_TIMEZONE || 'Pacific/Auckland'
  const { dateKey, hhmm } = localParts(at, tz)
  const day = new Date(`${dateKey}T00:00:00Z`)

  const shifts = await prisma.shift.findMany({
    where: { staffId, venueId, date: day, deletedAt: null, positionId: { not: null } },
    select: { positionId: true, startTime: true, endTime: true },
    orderBy: { startTime: 'asc' },
  })
  if (shifts.length === 0) return null
  if (shifts.length === 1) return shifts[0].positionId
  const covering = shifts.find((s) => s.startTime <= hhmm && hhmm < s.endTime)
  return (covering ?? shifts[0]).positionId
}
