// Gift card numbering helpers (pure — safe for the browser).
//
// Cards are PREMADE rows numbered by calendar year: `${year}` + a zero-padded
// 4-digit sequence, e.g. 20260001..20269999 for 2026. The year is the CURRENT
// venue-year at premake time. Issuing never invents a number — it consumes the
// lowest-numbered DRAFT row (any year, so leftovers are used first) and only
// premakes more when none remain. The pool scheme (0001..0100) is retired.

export const GIFT_CARD_YEAR_MAX_SEQUENCE = 9999

/** Format a sequence for a year: (2026, 1) → '20260001'. */
export function giftCardNumberForYear(year: number, sequence: number): string {
  return `${year}${String(sequence).padStart(4, '0')}`
}

/** Parse a year-series number ('20260042') → { year, sequence }, else null. */
export function parseGiftCardNumber(number: string): { year: number; sequence: number } | null {
  const m = number.match(/^(\d{4})(\d{4})$/)
  if (!m) return null
  const year = parseInt(m[1], 10)
  const sequence = parseInt(m[2], 10)
  if (sequence < 1 || sequence > GIFT_CARD_YEAR_MAX_SEQUENCE) return null
  return { year, sequence }
}

/** Numeric ordering for lists: year-series sort as their integer value. */
export function giftCardSortValue(number: string): number {
  const parsed = parseGiftCardNumber(number)
  if (parsed) return parsed.year * 10000 + parsed.sequence
  // Legacy rows from the retired pool scheme ('0001'..'0100') still exist in
  // some databases — keep them sortable (below the year series) until purged.
  const legacy = number.match(/^(\d{4})$/)
  return legacy ? parseInt(legacy[1], 10) : 0
}
