import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getServerSession, guardAccess, prismaMocks } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  prismaMocks: {
    payPeriod: { findUnique: vi.fn() },
    payrollEntry: { findMany: vi.fn() },
  },
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@hospo-ops/db', () => ({ prisma: prismaMocks }))

import { GET } from './route'

const getReq = (url: string) => ({ url, nextUrl: new URL(url) } as unknown as NextRequest)
const params = { id: 'pp1' }

const period = {
  id: 'pp1',
  startDate: new Date('2026-08-03T00:00:00Z'),
  endDate: new Date('2026-08-09T00:00:00Z'),
  deletedAt: null,
}

const baseEntry = {
  totalHours: 7.5,
  hourlyRate: 25,
  totalPay: 187.5,
  ordinaryHours: 7.5,
  overtimeHours: 0,
  publicHolidayHours: 0,
  grossPay: 187.5,
  holidayPay: 0,
  paye: 19.69,
  accLevy: 2.76,
  kiwiSaverEmployee: 5.63,
  kiwiSaverEmployer: 5.63,
  studentLoan: 0,
  netPay: 159.42,
  employerCost: 193.13,
  alternativeDaysOwed: 0,
  staff: { firstName: 'LIAM', lastName: 'HEAVEN', employmentType: 'FULL_TIME' },
}

const splitEntry = {
  ...baseEntry,
  breakdown: [
    { dateKey: '2026-08-10', hours: 7.5, breaksMinutes: 40, paidBreakMinutes: 10, unpaidBreakMinutes: 30, type: 'ORDINARY' },
    { dateKey: '2026-08-11', hours: 7.5, breaksMinutes: 20, paidBreakMinutes: 5, unpaidBreakMinutes: 15, type: 'ORDINARY' },
  ],
}

const legacyEntry = {
  ...baseEntry,
  breakdown: [
    { dateKey: '2026-08-10', hours: 7.5, breaksMinutes: 30, type: 'ORDINARY' },
  ],
}

function csvLines(text: string) {
  return text.trim().split('\n')
}

describe('GET /api/admin/payroll/periods/[id]/export?format=csv', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1' } })
    guardAccess.mockResolvedValue(null)
    prismaMocks.payPeriod.findUnique.mockResolvedValue(period)
    prismaMocks.payrollEntry.findMany.mockResolvedValue([splitEntry])
  })

  it('keeps the original columns in place and appends the break split', async () => {
    const res = await GET(getReq('http://localhost/api/admin/payroll/periods/pp1/export?format=csv'), { params })
    expect(res.status).toBe(200)
    const header = csvLines(await res.text())[0]
    expect(header).toBe(
      'Name,Employment Type,Ordinary Hours,Overtime Hours,Public Holiday Hours,Total Hours,Rate,Gross Pay,Holiday Pay,PAYE,ACC,KiwiSaver Employee,KiwiSaver Employer,Student Loan,Net Pay,Employer Cost,Alt Days Owed,Paid Break Hours,Unpaid Break Hours'
    )
  })

  it('sums the paid and unpaid break hours from the breakdown', async () => {
    const res = await GET(getReq('http://localhost/api/admin/payroll/periods/pp1/export?format=csv'), { params })
    const [, row] = csvLines(await res.text())
    const cells = row.split(',')
    // 10 + 5 paid minutes → 0.25h; 30 + 15 unpaid minutes → 0.75h.
    expect(cells.slice(-2)).toEqual(['0.25', '0.75'])
    // Existing columns keep their positions.
    expect(cells.slice(0, 6)).toEqual(['"LIAM HEAVEN"', 'FULL_TIME', '7.50', '0.00', '0.00', '7.50'])
  })

  it('reports zero break hours for a legacy breakdown without the split', async () => {
    prismaMocks.payrollEntry.findMany.mockResolvedValue([legacyEntry])
    const res = await GET(getReq('http://localhost/api/admin/payroll/periods/pp1/export?format=csv'), { params })
    const [, row] = csvLines(await res.text())
    expect(row.split(',').slice(-2)).toEqual(['0.00', '0.00'])
  })

  it('404s when the period is missing', async () => {
    prismaMocks.payPeriod.findUnique.mockResolvedValue(null)
    const res = await GET(getReq('http://localhost/api/admin/payroll/periods/pp1/export?format=csv'), { params })
    expect(res.status).toBe(404)
  })
})
