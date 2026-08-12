// Pure roster math for the Roster Editor. Shift times are "HH:mm" strings that
// may cross midnight; rates come from Staff.hourlyRate.

import { shiftHours } from '@/lib/breaks'

export interface RosterShift {
  id: string
  staffId: string
  date: string // YYYY-MM-DD
  startTime: string // "HH:mm"
  endTime: string // "HH:mm"
  breakMinutes?: number // rostered unpaid break
  colour?: string | null
  tag?: string | null
  positionName?: string | null
  positionColour?: string | null
  status?: string
}

export interface StaffRate {
  staffId: string
  hourlyRate: number | null
}

/** Paid hours for a shift (rostered duration minus the unpaid break). */
export function shiftPaidHours(shift: RosterShift): number {
  const hours = shiftHours(shift.startTime, shift.endTime)
  const breaks = Math.max(0, Math.min(shift.breakMinutes || 0, hours * 60)) / 60
  return Math.round((hours - breaks) * 100) / 100
}

/** Labour cost of one shift at a staff rate (0 when the staff member has no rate). */
export function shiftCost(shift: RosterShift, rate: number | null): number {
  return Math.round(shiftPaidHours(shift) * (rate ?? 0) * 100) / 100
}

export interface StaffWeekTotal {
  staffId: string
  hours: number
  cost: number
  shiftCount: number
}

/** Per-staff hours/cost across a set of shifts. */
export function staffWeekTotals(shifts: RosterShift[], rates: StaffRate[]): Map<string, StaffWeekTotal> {
  const rateById = new Map(rates.map((r) => [r.staffId, r.hourlyRate ?? 0]))
  const totals = new Map<string, StaffWeekTotal>()
  for (const s of shifts) {
    const t = totals.get(s.staffId) ?? { staffId: s.staffId, hours: 0, cost: 0, shiftCount: 0 }
    t.hours = Math.round((t.hours + shiftPaidHours(s)) * 100) / 100
    t.cost = Math.round((t.cost + shiftCost(s, rateById.get(s.staffId) ?? null)) * 100) / 100
    t.shiftCount += 1
    totals.set(s.staffId, t)
  }
  return totals
}

export interface RosterWeekSummary {
  totalCost: number
  budgetedSales: number
  staffingRatio: number // totalCost / budgetedSales × 100 (null-safe → 0)
  totalPaidHours: number
}

/**
 * The global summary footer: total labour cost, budgeted sales (excl GST —
 * from the Budget module's REVENUE daily allocations), staffing ratio and
 * total paid hours. budgetedSalesByDate maps date keys to $ amounts.
 */
export function rosterWeekSummary(
  shifts: RosterShift[],
  rates: StaffRate[],
  budgetedSalesByDate: Record<string, number>
): RosterWeekSummary {
  const rateById = new Map(rates.map((r) => [r.staffId, r.hourlyRate ?? 0]))
  let totalCost = 0
  let totalPaidHours = 0
  for (const s of shifts) {
    totalCost += shiftCost(s, rateById.get(s.staffId) ?? null)
    totalPaidHours += shiftPaidHours(s)
  }
  totalCost = Math.round(totalCost * 100) / 100
  totalPaidHours = Math.round(totalPaidHours * 100) / 100

  const budgetedSales = Object.values(budgetedSalesByDate).reduce((s, v) => s + (v || 0), 0)
  const staffingRatio = budgetedSales > 0 ? Math.round((totalCost / budgetedSales) * 10000) / 100 : 0

  return { totalCost, budgetedSales: Math.round(budgetedSales * 100) / 100, staffingRatio, totalPaidHours }
}

/** The block colour: the shift's own colour wins, else the position's, else a
 * stable fallback from a fixed palette keyed by position name. */
const PALETTE = ['#0E7490', '#6D28D9', '#2563EB', '#E11D48', '#EA580C', '#15803D', '#A16207', '#9333EA']

export function colourForShift(shift: RosterShift): string {
  if (shift.colour) return shift.colour
  if (shift.positionColour) return shift.positionColour
  const name = shift.positionName ?? ''
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return PALETTE[hash % PALETTE.length]
}

/** "47.25HRS / $1,858.34" — the small line under each staff member's name. */
export function formatStaffTotal(hours: number, cost: number): string {
  return `${hours.toFixed(2).replace(/\.00$/, '')}HRS / $${cost.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
