// NZ payroll engine (Holidays Act 2003 + Income Tax Act 2007, PAYE rules).
// Pure and deterministic — no Prisma, no Date.now(). All statutory rates are
// parameters with current-as-at-2026 defaults (they change annually; the UI
// stores them in PayrollSettings). Guidance figures for small hospitality
// payroll — not legal advice; reconcile against IRD at year end.
//
//   PAYE brackets (from 1 Jul 2025)         Secondary tax codes (flat %):
//     10.5%  ≤ $15,600                       S    17.5%
//     17.5%  ≤ $53,500                       SB   30%
//     30%    ≤ $78,100                       SH   33%
//     33%    ≤ $180,000                      ST   39%
//     39%    > $180,000                      CAE  17.5%
//   Student loan: 12% of gross when annual income exceeds the repayment
//   threshold ($24,128 for the 2025/26 tax year).
//   ACC earner levy (employee share): 1.47% of taxable gross (2025/26).
//   KiwiSaver: employee 3–10% (contractual), employer minimum 3% on top.
//   Public holidays: 1.5× pay + one alternative day (day in lieu) per date.
//   Casuals: 8% holiday pay paid out with each pay. Permanents: annual leave
//   accrues at 4 weeks per 52 (8% of hours — recorded, not paid).
//   Minimum wage: the effective rate is never below the statutory minimum.

import { nzBreakEntitlement } from '@/lib/breaks'

// ── Constants ──────────────────────────────────────────────────────────────

export const PAYE_BRACKETS: { upTo: number; rate: number }[] = [
  { upTo: 15600, rate: 0.105 },
  { upTo: 53500, rate: 0.175 },
  { upTo: 78100, rate: 0.3 },
  { upTo: 180000, rate: 0.33 },
  { upTo: Infinity, rate: 0.39 },
]

// Secondary codes deduct a flat % of ALL earnings (their annual income is
// taxed progressively at their main job, so these are withholding-only).
export const SECONDARY_TAX_CODES: Record<string, number> = {
  S: 0.175,
  SB: 0.3,
  SH: 0.33,
  ST: 0.39,
  CAE: 0.175,
}

export const TAX_CODES = [
  'M', 'M SL', 'S', 'S SL', 'SB', 'SB SL', 'SH', 'SH SL', 'ST', 'ST SL', 'CAE', 'CAE SL',
]

export const STUDENT_LOAN_THRESHOLD = 24128 // annual repayment threshold (2025/26)

export const MIN_KIWISAVER_RATE = 3 // employer minimum (%)

export const ANNUAL_LEAVE_WEEKS_PER_YEAR = 4

// ── Tax code helpers ───────────────────────────────────────────────────────

/** The flat secondary rate for a code, or null when it's a main (M) code. */
export function secondaryRateFor(taxCode: string): number | null {
  const base = taxCodeBase(taxCode)
  return SECONDARY_TAX_CODES[base] ?? null
}

/** Base code without the " SL" student-loan suffix. */
export function taxCodeBase(taxCode: string): string {
  return (taxCode ?? 'M').trim().replace(/\s+SL$/i, '').toUpperCase()
}

/** True when the code is an SL variant (student loan withheld at source). */
export function taxCodeHasStudentLoan(taxCode: string): boolean {
  return /SL$/i.test((taxCode ?? '').trim())
}

// ── Income tax (PAYE) ──────────────────────────────────────────────────────

/** PAYE on an ANNUAL income for a tax code. */
export function payeForIncome(annualIncome: number, taxCode: string): number {
  const flat = secondaryRateFor(taxCode)
  if (flat !== null) return Math.max(0, annualIncome) * flat

  let tax = 0
  let prev = 0
  for (const { upTo, rate } of PAYE_BRACKETS) {
    const band = Math.max(0, Math.min(annualIncome, upTo) - prev)
    tax += band * rate
    prev = upTo
    if (annualIncome <= upTo) break
  }
  return tax
}

// ── Statutory deductions (per pay period) ──────────────────────────────────

/** ACC earner levy on a period's taxable gross (employee share). */
export function accLevyFor(gross: number, accRatePct: number): number {
  return gross * (accRatePct / 100)
}

/** KiwiSaver: employee deduction + employer contribution. */
export function kiwiSaverFor(
  gross: number,
  employeeRatePct: number | null,
  employerRatePct: number
): { employee: number; employer: number } {
  if (employeeRatePct == null || employeeRatePct <= 0) return { employee: 0, employer: 0 }
  return {
    employee: gross * (employeeRatePct / 100),
    employer: gross * (employerRatePct / 100),
  }
}

/**
 * Student loan repayment withheld this period: 12% of taxable gross once the
 * annualised income clears the repayment threshold.
 */
export function studentLoanFor(
  gross: number,
  annualizedGross: number,
  studentLoanRatePct: number,
  threshold: number = STUDENT_LOAN_THRESHOLD
): number {
  if (annualizedGross <= threshold) return 0
  return gross * (studentLoanRatePct / 100)
}

// ── Breaks (paid rest vs unpaid meal) ──────────────────────────────────────

export interface BreakClassification {
  paidMinutes: number // rest breaks — paid
  unpaidMinutes: number // meal breaks + anything beyond entitlement — unpaid
}

/**
 * Classify clocked break minutes against the NZ entitlement for the shift's
 * length (lib/breaks.ts). Deterministic rule: a total within the rest-break
 * entitlement is a paid rest break; beyond that, the meal-break minutes come
 * off first (unpaid), then rest minutes again, and any surplus is unpaid.
 */
export function classifyBreakMinutes(clockedMinutes: number, shiftMinutes: number): BreakClassification {
  if (clockedMinutes <= 0) return { paidMinutes: 0, unpaidMinutes: 0 }
  const { rest10, meal30 } = nzBreakEntitlement(shiftMinutes / 60)
  const restTotal = rest10 * 10
  if (clockedMinutes <= restTotal) return { paidMinutes: clockedMinutes, unpaidMinutes: 0 }
  const unpaid = Math.min(clockedMinutes, meal30 * 30)
  const paid = Math.min(clockedMinutes - unpaid, restTotal)
  return { paidMinutes: paid, unpaidMinutes: clockedMinutes - paid }
}

// ── The payrun ─────────────────────────────────────────────────────────────

export interface PayrunSession {
  dateKey: string // YYYY-MM-DD (venue-local)
  clockIn: string // ISO
  clockOut: string // ISO
  breaksMinutes: number // total clocked break minutes for the session
}

export interface PayrunStaff {
  hourlyRate: number | null
  employmentType: string | null // FULL_TIME | PART_TIME | CASUAL
  taxCode: string | null
  kiwiSaverRate: number | null // % or null when not enrolled
  studentLoan: boolean
}

export interface PayrunSettings {
  minimumWage: number
  accRate: number // %
  kiwiSaverEmployerRate: number // %
  studentLoanRate: number // %
  holidayPayPct: number // % (casual holiday pay)
  defaultTaxCode: string
  overtimeEnabled: boolean
  overtimeHoursPerWeek: number
  overtimeRate: number // multiplier
  periodsPerYear: number // 52 weekly | 26 fortnightly | 12 monthly
}

export interface PayrunBreakdownLine {
  dateKey: string
  clockIn: string
  clockOut: string
  hours: number // paid hours (incl. paid breaks, excl. unpaid)
  breaksMinutes: number
  type: 'ORDINARY' | 'OVERTIME' | 'PUBLIC_HOLIDAY'
}

export interface PayrunResult {
  totalHours: number
  ordinaryHours: number
  overtimeHours: number
  publicHolidayHours: number
  grossPay: number // ordinary + OT + PH (PH at 1.5x), min-wage floored
  holidayPay: number // 8% casual — paid out
  annualLeaveAccruedHours: number // permanents — recorded, not paid
  alternativeDaysOwed: number
  alternativeDayDates: string[] // the PH dates worked (one alt day each)
  paye: number
  accLevy: number
  kiwiSaverEmployee: number
  kiwiSaverEmployer: number
  studentLoan: number
  netPay: number
  employerCost: number
  breakdown: PayrunBreakdownLine[]
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * The whole per-staff payrun for one period. Sessions must already be
 * APPROVED (the caller filters); PH dates passed as a Set of date keys.
 *
 * Overtime is contractual (NZ has no statutory OT): when enabled, hours
 * beyond the weekly threshold on NON-public-holiday sessions shift to the
 * overtime rate. Public holiday hours are always 1.5× and never count
 * toward the OT threshold.
 */
export function payrunForStaff(
  sessions: PayrunSession[],
  staff: PayrunStaff,
  settings: PayrunSettings,
  publicHolidayDateKeys: Set<string> = new Set()
): PayrunResult {
  const rate = Math.max(staff.hourlyRate ?? 0, settings.minimumWage)
  const taxCode = (staff.taxCode ?? (settings.defaultTaxCode || 'M')).trim()

  let ordinaryMinutes = 0
  let phMinutes = 0
  let otMinutes = 0
  const breakdown: PayrunBreakdownLine[] = []
  let alternativeDays = 0

  // Pass 1: parse sessions, split minutes into ordinary / public-holiday pools.
  const parsed: { dateKey: string; clockIn: string; clockOut: string; paidMinutes: number; breaksMinutes: number; isPH: boolean; ot?: boolean }[] = []
  const phDays = new Set<string>()
  for (const s of sessions) {
    const start = new Date(s.clockIn).getTime()
    const end = new Date(s.clockOut).getTime()
    if (!(end > start)) continue
    const totalMinutes = (end - start) / 60000
    const breaks = Math.min(s.breaksMinutes || 0, totalMinutes)
    const paidMinutes = totalMinutes - breaks // unpaid (meal) minutes already excluded
    const isPH = publicHolidayDateKeys.has(s.dateKey)

    if (isPH) {
      phMinutes += paidMinutes
      if (!phDays.has(s.dateKey)) {
        phDays.add(s.dateKey)
        alternativeDays += 1
      }
    } else {
      ordinaryMinutes += paidMinutes
    }
    parsed.push({ dateKey: s.dateKey, clockIn: s.clockIn, clockOut: s.clockOut, paidMinutes, breaksMinutes: s.breaksMinutes || 0, isPH })
  }

  // Pass 2: contractual overtime over the weekly threshold (non-PH only).
  if (settings.overtimeEnabled && ordinaryMinutes > settings.overtimeHoursPerWeek * 60) {
    otMinutes = ordinaryMinutes - settings.overtimeHoursPerWeek * 60
    ordinaryMinutes = settings.overtimeHoursPerWeek * 60
  }

  // Pass 3: build the per-session breakdown. OT minutes carve off the END of
  // the ordinary sessions (latest sessions are the ones that tip over).
  let otRemaining = otMinutes
  for (let i = parsed.length - 1; i >= 0 && otRemaining > 0; i--) {
    const p = parsed[i]
    if (p.isPH) continue
    const carve = Math.min(p.paidMinutes, otRemaining)
    p.paidMinutes -= carve
    otRemaining -= carve
    p.ot = true
    parsed.push({ ...p, paidMinutes: carve, isPH: false })
  }
  for (const p of parsed) {
    if (p.paidMinutes <= 0) continue
    breakdown.push({
      dateKey: p.dateKey,
      clockIn: p.clockIn,
      clockOut: p.clockOut,
      hours: round2(p.paidMinutes / 60),
      breaksMinutes: p.breaksMinutes,
      type: p.isPH ? 'PUBLIC_HOLIDAY' : p.ot ? 'OVERTIME' : 'ORDINARY',
    })
  }

  const ordinaryHours = round2(ordinaryMinutes / 60)
  const overtimeHours = round2(otMinutes / 60)
  const publicHolidayHours = round2(phMinutes / 60)

  const ordinaryPay = ordinaryHours * rate
  const overtimePay = overtimeHours * rate * (settings.overtimeRate || 1.5)
  const phPay = publicHolidayHours * rate * 1.5
  const grossPay = round2(ordinaryPay + overtimePay + phPay)

  // Holiday pay: casuals get it paid out; permanents accrue annual leave.
  const isCasual = (staff.employmentType ?? '').toUpperCase() === 'CASUAL'
  const holidayPay = isCasual ? round2(grossPay * (settings.holidayPayPct / 100)) : 0
  const annualLeaveAccruedHours = isCasual
    ? 0
    : round2((ordinaryHours + overtimeHours + publicHolidayHours) * (ANNUAL_LEAVE_WEEKS_PER_YEAR / 52))

  // Deductions apply to taxable gross = gross + casual holiday pay.
  const taxableGross = round2(grossPay + holidayPay)
  const annualized = taxableGross * settings.periodsPerYear

  const paye = round2(payeForIncome(annualized, taxCode) / settings.periodsPerYear)
  const accLevy = round2(accLevyFor(taxableGross, settings.accRate))
  const kiwi = kiwiSaverFor(taxableGross, staff.kiwiSaverRate, settings.kiwiSaverEmployerRate)
  const hasSL = staff.studentLoan || taxCodeHasStudentLoan(taxCode)
  const studentLoan = hasSL
    ? round2(studentLoanFor(taxableGross, annualized, settings.studentLoanRate))
    : 0

  const netPay = round2(taxableGross - paye - accLevy - round2(kiwi.employee) - studentLoan)
  const employerCost = round2(taxableGross + round2(kiwi.employer))

  return {
    totalHours: round2(ordinaryHours + overtimeHours + publicHolidayHours),
    ordinaryHours,
    overtimeHours,
    publicHolidayHours,
    grossPay,
    holidayPay,
    annualLeaveAccruedHours,
    alternativeDaysOwed: alternativeDays,
    alternativeDayDates: [...phDays].sort(),
    paye,
    accLevy,
    kiwiSaverEmployee: round2(kiwi.employee),
    kiwiSaverEmployer: round2(kiwi.employer),
    studentLoan,
    netPay,
    employerCost,
    breakdown,
  }
}
