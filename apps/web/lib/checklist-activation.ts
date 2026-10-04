// A checklist can carry an `appearFromTime` ("HH:mm", venue-local) so a list
// only shows on the floor once the day has reached that time. An admin can
// force a not-yet-open list open for the rest of the current venue-day by
// stamping `activatedOn`; it resets automatically the next day because the
// stamp is compared against the venue's local calendar day.
//
// Pure and Prisma-free so the worker route, the admin route and the Tasks UI
// all agree on what "open" means.

/** The YYYY-MM-DD calendar day of a value (dates are stored anchored to UTC midnight). */
export function dayKey(date: Date | string): string {
  return new Date(date).toISOString().slice(0, 10)
}

/** True when a list was force-activated on the given venue-local day. */
export function isActivatedOn(activatedOn: Date | string | null | undefined, day: Date | string): boolean {
  if (!activatedOn) return false
  return dayKey(activatedOn) === dayKey(day)
}

/**
 * A list is open when its appear-from time has passed (or it has none) OR an
 * admin activated it for today. `nowHHmm` is a venue-local "HH:mm" string.
 */
export function isChecklistOpen(
  appearFromTime: string | null | undefined,
  activatedOn: Date | string | null | undefined,
  day: Date | string,
  nowHHmm: string,
): boolean {
  if (isActivatedOn(activatedOn, day)) return true
  return !appearFromTime || nowHHmm >= appearFromTime
}

/** True when a list is gated to a later time and is not open yet. */
export function isChecklistHidden(
  appearFromTime: string | null | undefined,
  activatedOn: Date | string | null | undefined,
  day: Date | string,
  nowHHmm: string,
): boolean {
  return !isChecklistOpen(appearFromTime, activatedOn, day, nowHHmm)
}
