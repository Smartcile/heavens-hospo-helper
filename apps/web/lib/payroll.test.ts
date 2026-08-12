import { describe, it, expect, vi, beforeEach } from 'vitest'
import { calculateStaffHours, generatePayPeriod } from '@/lib/payroll'

const { prismaMocks } = vi.hoisted(() => ({
  prismaMocks: {
    timeClock: { findMany: vi.fn() },
    payrollEntry: { deleteMany: vi.fn(), create: vi.fn() },
    payPeriod: { update: vi.fn() },
    staff: { findMany: vi.fn() },
    payrollSettings: { findUnique: vi.fn() },
    publicHoliday: { findMany: vi.fn() },
    alternativeDay: { deleteMany: vi.fn(), create: vi.fn() },
  },
}))

vi.mock('@hospo-ops/db', () => ({
  prisma: {
    ...prismaMocks,
    $transaction: async (fn: (tx: Record<string, unknown>) => Promise<void>) => {
      await fn({ ...prismaMocks })
    },
  },
}))

import { prisma } from '@hospo-ops/db'

const mockTimeClock = prisma.timeClock.findMany as unknown as ReturnType<typeof vi.fn>
const mockStaff = prisma.staff.findMany as unknown as ReturnType<typeof vi.fn>
const mockSettings = prisma.payrollSettings.findUnique as unknown as ReturnType<typeof vi.fn>
const mockHolidays = prisma.publicHoliday.findMany as unknown as ReturnType<typeof vi.fn>

const baseClockIn = new Date('2026-07-01T09:00:00Z')
const baseClockOut = new Date('2026-07-01T17:00:00Z') // 8 hours

describe('calculateStaffHours', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calculates hours from completed sessions', async () => {
    mockTimeClock.mockResolvedValueOnce([
      { id: '1', clockIn: baseClockIn, clockOut: baseClockOut },
      { id: '2', clockIn: new Date('2026-07-02T09:00:00Z'), clockOut: new Date('2026-07-02T16:00:00Z') }, // 7 hours
    ])

    const result = await calculateStaffHours('s1', 'v1', new Date('2026-07-01'), new Date('2026-07-05'))
    expect(result.totalHours).toBe(15)
    expect(result.sessions).toHaveLength(2)
  })

  it('excludes still-active sessions', async () => {
    mockTimeClock.mockResolvedValueOnce([
      { id: '1', clockIn: baseClockIn, clockOut: baseClockOut },
    ])

    const result = await calculateStaffHours('s1', 'v1', new Date('2026-07-01'), new Date('2026-07-05'))
    expect(result.totalHours).toBe(8)
  })

  it('returns zero for no sessions', async () => {
    mockTimeClock.mockResolvedValueOnce([])
    const result = await calculateStaffHours('s1', 'v1', new Date('2026-07-01'), new Date('2026-07-05'))
    expect(result.totalHours).toBe(0)
    expect(result.totalMinutes).toBe(0)
  })
})

describe('generatePayPeriod', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('closes the period from APPROVED sessions with the full NZ breakdown', async () => {
    mockSettings.mockResolvedValueOnce(null) // venue defaults
    mockHolidays.mockResolvedValueOnce([])
    mockTimeClock.mockResolvedValueOnce([
      { staffId: 's1', clockIn: baseClockIn, clockOut: baseClockOut, breaksMinutes: 0 },
      { staffId: 's2', clockIn: baseClockIn, clockOut: baseClockOut, breaksMinutes: 30 },
    ])
    mockStaff.mockResolvedValueOnce([
      { id: 's1', hourlyRate: 25, employmentType: 'FULL_TIME', taxCode: 'M', kiwiSaverRate: 3, studentLoan: false },
      { id: 's2', hourlyRate: 23.5, employmentType: 'CASUAL', taxCode: 'M', kiwiSaverRate: null, studentLoan: false },
    ])

    const count = await generatePayPeriod('pp1', 'v1', new Date('2026-07-01'), new Date('2026-07-05'))

    expect(count).toBe(2)
    expect(prisma.payrollEntry.deleteMany).toHaveBeenCalledWith({ where: { payPeriodId: 'pp1' } })
    expect(prisma.alternativeDay.deleteMany).toHaveBeenCalledWith({ where: { payPeriodId: 'pp1' } })
    expect(prisma.payPeriod.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CLOSED' }) })
    )
  })

  it('creates alternative days for public holidays worked', async () => {
    mockSettings.mockResolvedValueOnce(null)
    mockHolidays.mockResolvedValueOnce([{ date: new Date('2026-07-03T00:00:00Z'), venueId: null }])
    mockTimeClock.mockResolvedValueOnce([
      { staffId: 's1', clockIn: new Date('2026-07-03T09:00:00Z'), clockOut: new Date('2026-07-03T17:00:00Z'), breaksMinutes: 0 },
    ])
    mockStaff.mockResolvedValueOnce([
      { id: 's1', hourlyRate: 25, employmentType: 'FULL_TIME', taxCode: 'M', kiwiSaverRate: null, studentLoan: false },
    ])

    await generatePayPeriod('pp1', 'v1', new Date('2026-07-01'), new Date('2026-07-05'))

    const createCalls = (prisma.alternativeDay.create as unknown as ReturnType<typeof vi.fn>).mock.calls
    expect(createCalls).toHaveLength(1)
    expect(createCalls[0][0].data).toMatchObject({ staffId: 's1', payPeriodId: 'pp1' })
  })
})
