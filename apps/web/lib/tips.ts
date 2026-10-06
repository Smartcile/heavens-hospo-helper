// Tip pooling — the single, pure brain behind the TIPS page.
//
// A settlement has two inputs: the cash counted from the till (denomination →
// quantity) and the EFTPOS/POS holding figure requested from finance. Their sum
// is the accrued tips, split across a staff list by a share weighting. Kitchen
// staff carry a fixed share (main 0.2 / small 0.1); FOH is assigned a tier
// (full / 3/4 / 1/2 / 1/4) that reflects the hours worked across the period.
//
// Nothing here touches Prisma: the same functions run in the browser for live
// feedback and on the server where they are authoritative, so a displayed value
// and a persisted one can never disagree.

/** NZD notes + coins, largest first. */
export const CASH_DENOMINATIONS = [100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1] as const

/** The six share tiers in the workbook's Calculator sheet. */
export const SHARE_PRESETS: { value: number; label: string }[] = [
  { value: 1, label: 'FULL SHARE' },
  { value: 0.75, label: '3/4 SHARE' },
  { value: 0.5, label: 'HALF SHARE' },
  { value: 0.25, label: '1/4 SHARE' },
  { value: 0.2, label: 'MAIN KITCHEN' },
  { value: 0.1, label: 'SMALL KITCHEN' },
]

export type CashCounts = Record<string, number>

export interface TipsShareInput {
  name: string
  hours: number
  shareWeight: number
}

export interface TipsShareResult extends TipsShareInput {
  value: number
}

export interface TipsSummary {
  /** Accrued tips = cash + POS. */
  totalTips: number
  /** Sum of every share weighting (the divisor). */
  weightTotal: number
  /** Value of one full (weight = 1) share. */
  perUnit: number
  /** Total handed out. Equals `totalTips` by construction. */
  allocated: number
  /** `totalTips - allocated`, rounded to cents — 0 when reconciled. */
  difference: number
}

/** Round to cents, avoiding float drift in comparisons. */
export function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}

/** "$100", "$0.50" — a denomination's display label. */
export function denominationLabel(value: number): string {
  return value % 1 === 0 ? `$${value}` : `$${value.toFixed(2)}`
}

/** The cash subtotal from a denomination → quantity count. */
export function cashTotalOf(counts: CashCounts | null | undefined): number {
  if (!counts || typeof counts !== 'object') return 0
  let sum = 0
  for (const denom of CASH_DENOMINATIONS) {
    const qty = Number(counts[String(denom)] ?? 0)
    if (Number.isFinite(qty) && qty > 0) sum += denom * qty
  }
  return round2(sum)
}

/** Accrued tips = counted cash + the POS/EFTPOS holding figure. */
export function totalTips(cashTotal: number, posTotal: number): number {
  const cash = Number.isFinite(cashTotal) ? cashTotal : 0
  const pos = Number.isFinite(posTotal) ? posTotal : 0
  return round2(cash + pos)
}

/** The tier label for a share weighting, or null when it isn't a preset. */
export function shareLabel(weight: number): string | null {
  return SHARE_PRESETS.find((p) => p.value === weight)?.label ?? null
}

/**
 * Split `total` across the shares by weighting. Each value is left unrounded so
 * the allocated sum equals the total exactly (matching the workbook, where the
 * "difference" line reads 0); display sites round to cents.
 */
export function distributeTips(total: number, shares: readonly TipsShareInput[]): TipsShareResult[] {
  const weightTotal = shares.reduce((s, x) => s + (Number(x.shareWeight) || 0), 0)
  const amount = Number.isFinite(total) ? total : 0
  return shares.map((s) => {
    const weight = Number(s.shareWeight) || 0
    return {
      name: s.name,
      hours: Number(s.hours) || 0,
      shareWeight: weight,
      value: weightTotal > 0 ? (amount * weight) / weightTotal : 0,
    }
  })
}

/** The Calculator sheet's readout: per-unit value, allocated total, difference. */
export function summariseTips(total: number, shares: readonly TipsShareInput[]): TipsSummary {
  const weightTotal = shares.reduce((s, x) => s + (Number(x.shareWeight) || 0), 0)
  const amount = Number.isFinite(total) ? total : 0
  const perUnit = weightTotal > 0 ? amount / weightTotal : 0
  const allocated = perUnit * weightTotal
  return {
    totalTips: round2(amount),
    weightTotal,
    perUnit,
    allocated,
    difference: round2(amount - allocated),
  }
}

/** Sanitise a cash count map: keep only known denominations, drop empties. */
export function cleanCashCounts(raw: unknown): CashCounts {
  if (!raw || typeof raw !== 'object') return {}
  const src = raw as Record<string, unknown>
  const out: CashCounts = {}
  for (const denom of CASH_DENOMINATIONS) {
    const qty = Math.floor(Number(src[String(denom)]))
    if (Number.isFinite(qty) && qty > 0) out[String(denom)] = qty
  }
  return out
}

/** Sanitise an incoming share list: uppercase names, coerce numbers, drop blanks. */
export function cleanShares(raw: unknown): TipsShareInput[] {
  if (!Array.isArray(raw)) return []
  const out: TipsShareInput[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const s = item as Partial<TipsShareInput>
    const name = typeof s.name === 'string' ? s.name.trim().toUpperCase() : ''
    if (!name) continue
    const hours = Number(s.hours)
    const weight = Number(s.shareWeight)
    out.push({
      name,
      hours: Number.isFinite(hours) && hours > 0 ? hours : 0,
      shareWeight: Number.isFinite(weight) && weight > 0 ? weight : 0,
    })
  }
  return out
}
