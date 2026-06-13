// NZ rest & meal break entitlements (Employment Relations Act 2000, s69ZD).
// Guidance figures shown to managers — not legal advice.
//
//   work period   rest (10 min, paid)   meal (30 min, unpaid)
//   2–4 h         1                     0
//   4–6 h         1                     1
//   6–8 h         2                     1
//   over 8 h      entitlements repeat for each further period
export function nzBreakEntitlement(hours: number): { rest10: number; meal30: number } {
  let rest = 0
  let meal = 0
  let h = hours
  // Each complete 8-hour block: 2 rest + 1 meal, then the remainder is graded.
  while (h > 8) {
    rest += 2
    meal += 1
    h -= 8
  }
  if (h > 6) {
    rest += 2
    meal += 1
  } else if (h > 4) {
    rest += 1
    meal += 1
  } else if (h > 2) {
    rest += 1
  }
  return { rest10: rest, meal30: meal }
}

/** Hours between two "HH:mm" times (handles shifts crossing midnight). */
export function shiftHours(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let mins = eh * 60 + em - (sh * 60 + sm)
  if (mins < 0) mins += 24 * 60
  return mins / 60
}

/** Human-readable entitlement, e.g. "2×10min + 1×30min" or "No breaks". */
export function formatBreaks(start: string, end: string): string {
  const { rest10, meal30 } = nzBreakEntitlement(shiftHours(start, end))
  const parts: string[] = []
  if (rest10) parts.push(`${rest10}×10min`)
  if (meal30) parts.push(`${meal30}×30min`)
  return parts.length ? parts.join(' + ') : 'No breaks'
}
