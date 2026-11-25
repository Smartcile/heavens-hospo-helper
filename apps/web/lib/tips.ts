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

// --- Relational shares (TipsShare) -----------------------------------------
// The old JSON snapshot is kept only for the one-off backfill. New rows carry a
// staff link (null = a manual, non-system person) and a per-person status.

export type TipsShareStatusValue = 'PLANNED' | 'APPROVED' | 'ISSUED' | 'FULLY_ISSUED'

export interface TipsShareDraft {
  id?: string
  staffId: string | null
  name: string
  hours: number
  shareWeight: number
  sortOrder: number
}

export interface TipsShareRow extends TipsShareDraft {
  status: TipsShareStatusValue
  approvalNote?: string | null
  issueNote?: string | null
  approvedAt?: string | Date | null
  issuedAt?: string | Date | null
  /** Number of live notes on this person's period thread (0 when not loaded). */
  noteCount?: number
}

/** A staff member offered by the bulk-add modal. */
export interface TipsStaffOption {
  id: string
  name: string
  departmentName?: string | null
}

export const TIPS_NOTE_MAX_LENGTH = 500

export interface TipsShareValue extends TipsShareRow {
  /** This person's share of the total hours (0–1). Advisory only. */
  hoursShare: number
  /** Hours-proportional weight suggestion (the suggestions sum to headcount). */
  suggestedWeight: number
  /** Hours-proportional payout suggestion (not cash-rounded). */
  suggestedAmount: number
  /** Final cash-rounded payout for this row. Rows always sum to the pool. */
  amount: number
}

export interface TipsProgress {
  total: number
  planned: number
  approved: number
  issued: number
  fullyIssued: number
  /** ISSUED + FULLY_ISSUED. */
  issuedCount: number
  /** 0–100, issuedCount / total. */
  percent: number
  /** 0–100, (approved + issued + fullyIssued) / total. */
  approvedPercent: number
  /** The overall stage of the period. */
  stage: TipsShareStatusValue
  complete: boolean
}

export const TIPS_CASH_STEP = 0.1

/** This person's fraction of the total hours (0 when there are no hours). */
export function hoursShare(hours: number, totalHours: number): number {
  const h = Number.isFinite(hours) && hours > 0 ? hours : 0
  const total = Number.isFinite(totalHours) && totalHours > 0 ? totalHours : 0
  return total > 0 ? h / total : 0
}

/** Hours-proportional weight suggestion, scaled so the suggestions sum to count. */
export function suggestedWeight(hours: number, totalHours: number, count: number): number {
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
  return round2(hoursShare(hours, totalHours) * n)
}

/** Hours-proportional payout suggestion (advisory, not cash-rounded). */
export function suggestedAmount(pool: number, hours: number, totalHours: number): number {
  const amount = Number.isFinite(pool) ? pool : 0
  return round2(amount * hoursShare(hours, totalHours))
}

/** Round a dollar value to the nearest 10c (NZ cash). */
export function cashRound(value: number, step = TIPS_CASH_STEP): number {
  const amount = Number.isFinite(value) ? value : 0
  return round2(Math.round((amount + Number.EPSILON) / step) * step)
}

/**
 * Split `total` by weight and cash-round every payout to the nearest 10c. The
 * 10c units are reconciled with the largest-remainder method, so the returned
 * amounts add up exactly to the nearest-10c value of the pool (never a cent
 * lost or invented). A zero/negative weight total pays nobody.
 */
export function distributeCashRounded(total: number, shares: readonly { shareWeight: number }[]): number[] {
  if (shares.length === 0) return []
  const amount = Number.isFinite(total) && total > 0 ? total : 0
  const weightTotal = shares.reduce((sum, s) => sum + (Number(s.shareWeight) || 0), 0)
  const targetUnits = Math.max(0, Math.round(amount / TIPS_CASH_STEP))
  if (weightTotal <= 0 || targetUnits === 0) return shares.map(() => 0)

  const rawUnits = shares.map((s) => (targetUnits * (Number(s.shareWeight) || 0)) / weightTotal)
  const units = rawUnits.map((u) => Math.floor(u + 1e-9))
  const allocated = units.reduce((sum, u) => sum + u, 0)
  let remaining = targetUnits - allocated

  const order = shares
    .map((_, index) => ({ index, remainder: rawUnits[index] - Math.floor(rawUnits[index] + 1e-9) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)

  if (remaining > 0 && order.length > 0) {
    for (let i = 0; i < remaining; i++) units[order[i % order.length].index] += 1
  } else if (remaining < 0 && order.length > 0) {
    for (let i = 0; i < -remaining; i++) units[order[order.length - 1 - (i % order.length)].index] -= 1
  }

  return units.map((u) => round2(Math.max(0, u) * TIPS_CASH_STEP))
}

/** Attach hours share, suggestions and the reconciled payout to every row. */
export function valueTipsShares(total: number, shares: readonly TipsShareRow[]): TipsShareValue[] {
  const totalHours = shares.reduce((sum, s) => sum + (Number(s.hours) || 0), 0)
  const amounts = distributeCashRounded(total, shares)
  const count = shares.length
  return shares.map((s, i) => ({
    ...s,
    hoursShare: hoursShare(s.hours, totalHours),
    suggestedWeight: suggestedWeight(s.hours, totalHours, count),
    suggestedAmount: suggestedAmount(total, s.hours, totalHours),
    amount: amounts[i] ?? 0,
  }))
}

/** Status counts + percentages for the dashboard widget and the progress bar. */
export function tipsProgress(shares: readonly { status: TipsShareStatusValue }[]): TipsProgress {
  const total = shares.length
  let planned = 0
  let approved = 0
  let issued = 0
  let fullyIssued = 0
  for (const s of shares) {
    if (s.status === 'PLANNED') planned++
    else if (s.status === 'APPROVED') approved++
    else if (s.status === 'ISSUED') issued++
    else if (s.status === 'FULLY_ISSUED') fullyIssued++
  }
  const issuedCount = issued + fullyIssued
  const percent = total > 0 ? Math.round((issuedCount / total) * 100) : 0
  const approvedPercent = total > 0 ? Math.round(((approved + issuedCount) / total) * 100) : 0
  let stage: TipsShareStatusValue = 'PLANNED'
  if (total > 0 && fullyIssued === total) stage = 'FULLY_ISSUED'
  else if (issuedCount > 0) stage = 'ISSUED'
  else if (total > 0 && approved === total) stage = 'APPROVED'
  return {
    total,
    planned,
    approved,
    issued,
    fullyIssued,
    issuedCount,
    percent,
    approvedPercent,
    stage,
    complete: total > 0 && fullyIssued === total,
  }
}

/** The single allowed-transition rule, enforced again on the server. */
export function canTransitionTipsShare(from: TipsShareStatusValue, to: TipsShareStatusValue): boolean {
  if (from === 'PLANNED') return to === 'APPROVED'
  if (from === 'APPROVED') return to === 'ISSUED'
  if (from === 'ISSUED') return to === 'FULLY_ISSUED'
  return false
}

/** Hours/weight/name edits are only allowed before any payout is issued. */
export function isTipsShareEditable(status: TipsShareStatusValue): boolean {
  return status === 'PLANNED' || status === 'APPROVED'
}

/** True when a period contains a payout that has already been issued. */
export function isTipsPeriodLocked(shares: readonly { status: TipsShareStatusValue }[]): boolean {
  return shares.some((s) => !isTipsShareEditable(s.status))
}

/**
 * Sanitise incoming share rows for an admin save: trim/uppercase manual names,
 * coerce hours/weight, drop blank manual rows, and keep one row per staff link.
 */
export function cleanTipsShareRows(raw: unknown): TipsShareDraft[] {
  if (!Array.isArray(raw)) return []
  const out: TipsShareDraft[] = []
  const seenStaff = new Set<string>()
  raw.forEach((item, index) => {
    if (!item || typeof item !== 'object') return
    const row = item as Record<string, unknown>
    const staffId = typeof row.staffId === 'string' && row.staffId.trim() ? row.staffId.trim() : null
    const name = typeof row.name === 'string' ? row.name.trim().toUpperCase() : ''
    if (!staffId && !name) return
    if (staffId) {
      if (seenStaff.has(staffId)) return
      seenStaff.add(staffId)
    }
    const hoursRaw = Number(row.hours)
    const weightRaw = Number(row.shareWeight)
    const sortRaw = Number(row.sortOrder)
    out.push({
      id: typeof row.id === 'string' && row.id.trim() ? row.id.trim() : undefined,
      staffId,
      name,
      hours: Number.isFinite(hoursRaw) && hoursRaw > 0 ? hoursRaw : 0,
      shareWeight: Number.isFinite(weightRaw) && weightRaw >= 0 ? weightRaw : 1,
      sortOrder: Number.isFinite(sortRaw) && sortRaw >= 0 ? Math.floor(sortRaw) : index,
    })
  })
  return out
}

/**
 * Match a legacy share name (from the old JSON snapshot) to a venue staff
 * member, but only when exactly one person has that full name. Ambiguous names
 * stay manual (null) rather than guessing the wrong person's payout.
 */
export function matchLegacyTipStaff(
  name: string,
  staff: readonly { id: string; firstName: string; lastName: string }[],
): string | null {
  const target = name.trim().replace(/\s+/g, ' ').toUpperCase()
  if (!target) return null
  const matches = staff.filter((s) => {
    const full = `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim().replace(/\s+/g, ' ').toUpperCase()
    return full === target
  })
  return matches.length === 1 ? matches[0].id : null
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

// --- Breakdown table: columns, sorting and bulk add --------------------------

export type TipsColumnKey =
  | 'NAME'
  | 'HOURS'
  | 'WEIGHT'
  | 'HOURS_PCT'
  | 'SUGGESTED'
  | 'AMOUNT'
  | 'STATUS'
  | 'ACTIONS'

export interface TipsColumnDef {
  key: TipsColumnKey
  label: string
  /** Right-align the header and cells. */
  numeric: boolean
  /** Exposes a click-to-sort toggle. */
  sortable: boolean
}

export const TIPS_COLUMNS: TipsColumnDef[] = [
  { key: 'NAME', label: 'NAME', numeric: false, sortable: true },
  { key: 'HOURS', label: 'HOURS', numeric: true, sortable: true },
  { key: 'WEIGHT', label: 'WEIGHT', numeric: true, sortable: true },
  { key: 'HOURS_PCT', label: 'HOURS %', numeric: true, sortable: false },
  { key: 'SUGGESTED', label: 'SUGGESTED', numeric: true, sortable: false },
  { key: 'AMOUNT', label: 'AMOUNT', numeric: true, sortable: false },
  { key: 'STATUS', label: 'STATUS', numeric: false, sortable: false },
  { key: 'ACTIONS', label: 'ACTIONS', numeric: false, sortable: false },
]

export const DEFAULT_TIPS_COLUMN_ORDER: TipsColumnKey[] = TIPS_COLUMNS.map((c) => c.key)

/** localStorage key for one venue's saved column order. */
export function tipsColumnOrderStorageKey(venueId: string): string {
  return `hospo-tips-columns:${venueId}`
}

/**
 * Read a saved column order. Unknown/duplicate keys are dropped and any column
 * added since the order was saved is appended in its default position, so a new
 * column can never be hidden by stale preferences.
 */
export function parseTipsColumnOrder(raw: string | null | undefined): TipsColumnKey[] {
  const known = new Set(DEFAULT_TIPS_COLUMN_ORDER)
  let saved: unknown = null
  if (typeof raw === 'string' && raw.trim()) {
    try {
      saved = JSON.parse(raw)
    } catch {
      saved = null
    }
  }
  const order: TipsColumnKey[] = []
  if (Array.isArray(saved)) {
    for (const value of saved) {
      if (typeof value !== 'string') continue
      const key = value.toUpperCase() as TipsColumnKey
      if (!known.has(key) || order.includes(key)) continue
      order.push(key)
    }
  }
  for (const key of DEFAULT_TIPS_COLUMN_ORDER) {
    if (!order.includes(key)) order.push(key)
  }
  return order
}

/** Move one column so it sits where `target` currently is. */
export function moveTipsColumn(
  order: readonly TipsColumnKey[],
  from: TipsColumnKey,
  target: TipsColumnKey,
): TipsColumnKey[] {
  const base = parseTipsColumnOrder(JSON.stringify(order))
  const fromIndex = base.indexOf(from)
  const targetIndex = base.indexOf(target)
  if (fromIndex === -1 || targetIndex === -1 || fromIndex === targetIndex) return base
  const next = [...base]
  next.splice(fromIndex, 1)
  // Dropping onto a column inserts BEFORE it; dropping right to left needs no
  // shift because removing `from` does not move the target.
  const insertAt = fromIndex < targetIndex ? targetIndex - 1 : targetIndex
  next.splice(insertAt, 0, from)
  return next
}

export type TipsSortKey = 'name' | 'hours' | 'weight'
export type TipsSortDirection = 'asc' | 'desc'

export interface TipsSort {
  key: TipsSortKey
  dir: TipsSortDirection
}

/**
 * Sort breakdown rows for display. Pure and stable: ties keep their existing
 * order, and a null sort preserves the saved (manual) order. Sorting never
 * reorders the underlying draft — the component sorts a view copy.
 */
export function sortTipsShares<T extends { name: string; hours: number; shareWeight: number }>(
  rows: readonly T[],
  sort: TipsSort | null,
): T[] {
  const copy = [...rows]
  if (!sort) return copy
  const direction = sort.dir === 'desc' ? -1 : 1
  const value = (row: T): string | number => {
    if (sort.key === 'name') return row.name.trim().toUpperCase()
    if (sort.key === 'hours') return Number(row.hours) || 0
    return Number(row.shareWeight) || 0
  }
  return copy
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const left = value(a.row)
      const right = value(b.row)
      const delta =
        typeof left === 'number' && typeof right === 'number'
          ? left - right
          : String(left).localeCompare(String(right))
      return delta !== 0 ? delta * direction : a.index - b.index
    })
    .map((entry) => entry.row)
}

/**
 * Merge a bulk selection into the current draft. Existing rows are kept in
 * place (and never duplicated by staffId); newly selected people are appended
 * with a fresh sortOrder. Also returns how many were actually added.
 */
export function mergeTipsStaff(
  shares: readonly TipsShareRow[],
  staff: readonly TipsStaffOption[],
): { shares: TipsShareRow[]; added: number } {
  const merged = [...shares]
  const seen = new Set(merged.map((s) => s.staffId).filter((id): id is string => !!id))
  let added = 0
  for (const person of staff) {
    if (!person.id || seen.has(person.id)) continue
    seen.add(person.id)
    merged.push({
      staffId: person.id,
      name: person.name.trim().toUpperCase(),
      hours: 0,
      shareWeight: 1,
      sortOrder: merged.length,
      status: 'PLANNED',
      noteCount: 0,
    })
    added++
  }
  return { shares: merged, added }
}

