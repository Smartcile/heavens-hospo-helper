import { describe, it, expect } from 'vitest'
import {
  payeForIncome,
  secondaryRateFor,
  taxCodeBase,
  taxCodeHasStudentLoan,
  accLevyFor,
  kiwiSaverFor,
  studentLoanFor,
  classifyBreakMinutes,
  payrunForStaff,
  STUDENT_LOAN_THRESHOLD,
  TAX_CODES,
  type PayrunSettings,
  type PayrunStaff,
} from '@/lib/nz-payroll'

const settings: PayrunSettings = {
  minimumWage: 23.5,
  accRate: 1.47,
  kiwiSaverEmployerRate: 3,
  studentLoanRate: 12,
  holidayPayPct: 8,
  defaultTaxCode: 'M',
  overtimeEnabled: false,
  overtimeHoursPerWeek: 40,
  overtimeRate: 1.5,
  periodsPerYear: 52,
}

const staff: PayrunStaff = {
  hourlyRate: 25,
  employmentType: 'FULL_TIME',
  taxCode: 'M',
  kiwiSaverRate: 3,
  studentLoan: false,
}

const iso = (d: string, h: number, m = 0) => new Date(`${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`).toISOString()

const session = (date: string, startH: number, endH: number, breaks = 0) => ({
  dateKey: date,
  clockIn: iso(date, startH),
  clockOut: iso(date, endH),
  breaksMinutes: breaks,
})

describe('PAYE', () => {
  it('applies progressive brackets on M', () => {
    expect(payeForIncome(0, 'M')).toBe(0)
    // 15,600 × 10.5%
    expect(payeForIncome(15600, 'M')).toBeCloseTo(1638, 2)
    // + (53,500 − 15,600) × 17.5%
    expect(payeForIncome(53500, 'M')).toBeCloseTo(1638 + 37900 * 0.175, 2)
    // + (78,100 − 53,500) × 30%
    expect(payeForIncome(78100, 'M')).toBeCloseTo(1638 + 37900 * 0.175 + 24600 * 0.3, 2)
    // + (180,000 − 78,100) × 33%
    expect(payeForIncome(180000, 'M')).toBeCloseTo(1638 + 37900 * 0.175 + 24600 * 0.3 + 101900 * 0.33, 2)
    // + excess × 39%
    expect(payeForIncome(250000, 'M')).toBeCloseTo(1638 + 37900 * 0.175 + 24600 * 0.3 + 101900 * 0.33 + 70000 * 0.39, 2)
  })

  it('uses flat rates for secondary codes', () => {
    expect(payeForIncome(100000, 'S')).toBe(17500)
    expect(payeForIncome(100000, 'SB')).toBe(30000)
    expect(payeForIncome(100000, 'SH')).toBe(33000)
    expect(payeForIncome(100000, 'ST')).toBe(39000)
    expect(payeForIncome(100000, 'CAE')).toBe(17500)
  })

  it('handles SL variants as the same base code', () => {
    expect(payeForIncome(100000, 'M SL')).toBe(payeForIncome(100000, 'M'))
    expect(payeForIncome(100000, 'S SL')).toBe(payeForIncome(100000, 'S'))
  })

  it('treats unknown codes as M', () => {
    expect(payeForIncome(30000, 'ZZ')).toBe(payeForIncome(30000, 'M'))
  })

  it('exposes code helpers', () => {
    expect(secondaryRateFor('SB')).toBe(0.3)
    expect(secondaryRateFor('M')).toBeNull()
    expect(taxCodeBase('m sl')).toBe('M')
    expect(taxCodeHasStudentLoan('M SL')).toBe(true)
    expect(taxCodeHasStudentLoan('M')).toBe(false)
    expect(TAX_CODES).toContain('M SL')
    expect(TAX_CODES).toContain('CAE')
  })
})

describe('statutory deductions', () => {
  it('calculates ACC earner levy', () => {
    expect(accLevyFor(1000, 1.47)).toBeCloseTo(14.7, 2)
    expect(accLevyFor(0, 1.47)).toBe(0)
  })

  it('calculates KiwiSaver employee + employer', () => {
    expect(kiwiSaverFor(1000, 3, 3)).toEqual({ employee: 30, employer: 30 })
    expect(kiwiSaverFor(1000, 8, 3)).toEqual({ employee: 80, employer: 30 })
    expect(kiwiSaverFor(1000, null, 3)).toEqual({ employee: 0, employer: 0 })
    expect(kiwiSaverFor(1000, 0, 3)).toEqual({ employee: 0, employer: 0 })
  })

  it('withholds student loan only above the annual threshold', () => {
    expect(studentLoanFor(1000, 20000, 12)).toBe(0) // annualised below threshold
    expect(studentLoanFor(1000, 30000, 12)).toBeCloseTo(120, 2) // 12% of gross
    expect(studentLoanFor(1000, STUDENT_LOAN_THRESHOLD, 12)).toBe(0) // exactly at threshold
    expect(studentLoanFor(1000, STUDENT_LOAN_THRESHOLD + 1, 12)).toBeCloseTo(120, 2)
  })
})

describe('break classification', () => {
  it('treats a short break as a paid rest break', () => {
    const r = classifyBreakMinutes(10, 5 * 60)
    expect(r).toEqual({ paidMinutes: 10, unpaidMinutes: 0 })
  })

  it('treats a 30-min break on a 5h shift as an unpaid meal break', () => {
    const r = classifyBreakMinutes(30, 5 * 60)
    expect(r).toEqual({ paidMinutes: 0, unpaidMinutes: 30 })
  })

  it('splits rest + meal on a long shift (1h clocked = 30 meal + 10 rest, 20 surplus unpaid)', () => {
    const r = classifyBreakMinutes(60, 6 * 60)
    expect(r).toEqual({ paidMinutes: 10, unpaidMinutes: 50 })
  })

  it('handles zero and no-entitlement shifts', () => {
    expect(classifyBreakMinutes(0, 5 * 60)).toEqual({ paidMinutes: 0, unpaidMinutes: 0 })
    // 1.5h shift: no break entitlement at all → everything unpaid
    expect(classifyBreakMinutes(15, 90)).toEqual({ paidMinutes: 0, unpaidMinutes: 15 })
  })
})

describe('payrunForStaff', () => {
  it('computes ordinary hours × rate with PAYE, ACC, KiwiSaver and net pay', () => {
    const r = payrunForStaff([session('2026-08-10', 9, 17)], staff, settings)
    expect(r.totalHours).toBe(8)
    expect(r.ordinaryHours).toBe(8)
    expect(r.grossPay).toBe(200)
    expect(r.holidayPay).toBe(0)
    expect(r.alternativeDaysOwed).toBe(0)
    // annualised 200×52 = 10,400 → all in the 10.5% band
    expect(r.paye).toBeCloseTo(1092 / 52, 2) // 200 × 0.105
    expect(r.accLevy).toBeCloseTo(200 * 0.0147, 2)
    expect(r.kiwiSaverEmployee).toBe(6)
    expect(r.kiwiSaverEmployer).toBe(6)
    expect(r.studentLoan).toBe(0)
    expect(r.netPay).toBeCloseTo(200 - 1092 / 52 - 200 * 0.0147 - 6, 2)
    expect(r.employerCost).toBeCloseTo(200 + 6, 2)
  })

  it('deducts breaks from paid time', () => {
    const r = payrunForStaff([session('2026-08-10', 9, 17, 30)], staff, settings)
    expect(r.totalHours).toBe(7.5)
    expect(r.grossPay).toBeCloseTo(187.5, 2)
  })

  it('pays public holidays at 1.5x and owes an alternative day', () => {
    const ph = new Set(['2026-08-12'])
    const r = payrunForStaff([session('2026-08-12', 9, 17)], staff, settings, ph)
    expect(r.publicHolidayHours).toBe(8)
    expect(r.ordinaryHours).toBe(0)
    expect(r.grossPay).toBeCloseTo(8 * 25 * 1.5, 2) // 300
    expect(r.alternativeDaysOwed).toBe(1)
  })

  it('owes one alternative day per PH DATE, not per session', () => {
    const ph = new Set(['2026-08-12'])
    const r = payrunForStaff(
      [session('2026-08-12', 9, 13), session('2026-08-12', 14, 18)],
      staff,
      settings,
      ph
    )
    expect(r.publicHolidayHours).toBe(8)
    expect(r.alternativeDaysOwed).toBe(1)
  })

  it('pays 8% holiday pay to casuals and accrues annual leave for permanents', () => {
    const casual = { ...staff, employmentType: 'CASUAL' }
    const rc = payrunForStaff([session('2026-08-10', 9, 17)], casual, settings)
    expect(rc.holidayPay).toBeCloseTo(200 * 0.08, 2) // 16
    expect(rc.annualLeaveAccruedHours).toBe(0)
    expect(rc.netPay).toBeCloseTo(216 - 216 * 0.105 - 216 * 0.0147 - 216 * 0.03, 2)

    const rp = payrunForStaff([session('2026-08-10', 9, 17)], staff, settings)
    expect(rp.holidayPay).toBe(0)
    expect(rp.annualLeaveAccruedHours).toBeCloseTo(8 * (4 / 52), 2)
  })

  it('applies the minimum wage floor', () => {
    const low = { ...staff, hourlyRate: 20 } // below $23.50
    const r = payrunForStaff([session('2026-08-10', 9, 17)], low, settings)
    expect(r.grossPay).toBeCloseTo(8 * 23.5, 2) // 188, not 160
  })

  it('applies contractual overtime over the weekly threshold', () => {
    const ot = { ...settings, overtimeEnabled: true, overtimeHoursPerWeek: 40, overtimeRate: 1.5 }
    const sessions = [
      ...Array.from({ length: 5 }, (_, i) => session(`2026-08-1${i}`, 9, 17)), // 5 × 8h = 40h
      session('2026-08-16', 9, 17), // 8h → all overtime
    ]
    const r = payrunForStaff(sessions, staff, ot)
    expect(r.ordinaryHours).toBe(40)
    expect(r.overtimeHours).toBe(8)
    expect(r.grossPay).toBeCloseTo(40 * 25 + 8 * 25 * 1.5, 2) // 1300
    expect(r.breakdown.filter((l) => l.type === 'OVERTIME')).toHaveLength(1)
  })

  it('excludes public holiday hours from the overtime threshold', () => {
    const ot = { ...settings, overtimeEnabled: true, overtimeHoursPerWeek: 40, overtimeRate: 1.5 }
    const ph = new Set(['2026-08-16'])
    const sessions = [
      ...Array.from({ length: 5 }, (_, i) => session(`2026-08-1${i}`, 9, 17)),
      session('2026-08-16', 9, 17), // PH — stays 1.5x, does not tip OT
    ]
    const r = payrunForStaff(sessions, staff, ot, ph)
    expect(r.ordinaryHours).toBe(40)
    expect(r.overtimeHours).toBe(0)
    expect(r.publicHolidayHours).toBe(8)
  })

  it('skips sessions without a valid clock-out and clamps breaks to duration', () => {
    const r = payrunForStaff(
      [
        { dateKey: '2026-08-10', clockIn: iso('2026-08-10', 9), clockOut: iso('2026-08-10', 10), breaksMinutes: 120 }, // breaks > duration
        { dateKey: '2026-08-11', clockIn: iso('2026-08-11', 9), clockOut: iso('2026-08-11', 9), breaksMinutes: 0 }, // zero length
      ],
      staff,
      settings
    )
    expect(r.totalHours).toBe(0)
  })

  it('handles student loan via staff flag or SL tax code', () => {
    const sl = { ...staff, studentLoan: true, hourlyRate: 100 }
    const sessions = [session('2026-08-10', 9, 17)]
    const r = payrunForStaff(sessions, sl, settings)
    // annualised 800×52 = 41,600 > threshold → 12% of 800
    expect(r.studentLoan).toBeCloseTo(800 * 0.12, 2)

    const slCode = { ...staff, taxCode: 'M SL', studentLoan: false, hourlyRate: 100 }
    const r2 = payrunForStaff(sessions, slCode, settings)
    expect(r2.studentLoan).toBeCloseTo(800 * 0.12, 2)
  })

  it('respects the default tax code from settings', () => {
    const noCode = { ...staff, taxCode: null }
    const st = { ...settings, defaultTaxCode: 'ST' } // flat 39%
    const r = payrunForStaff([session('2026-08-10', 9, 17)], noCode, st)
    expect(r.paye).toBeCloseTo(200 * 0.39, 2)
  })

  it('breaks down each session', () => {
    const r = payrunForStaff([session('2026-08-10', 9, 17)], staff, settings)
    expect(r.breakdown).toHaveLength(1)
    expect(r.breakdown[0]).toMatchObject({ dateKey: '2026-08-10', hours: 8, type: 'ORDINARY' })
  })
})
