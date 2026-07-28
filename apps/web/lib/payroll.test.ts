import { describe, it, expect, vi, beforeEach } from 'vitest'
import { calculateStaffHours, generatePayPeriod } from '@/lib/payroll'

vi.mock('@hospo-ops/db', () => ({
  prisma: {
    timeClock: {
      findMany: vi.fn(),
    },
    payrollEntry: {
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    payPeriod: {
      update: vi.fn(),
    },
    staff: {
      findUnique: vi.fn(),
    },
  },
}))

import { prisma } from '@hospo-ops/db'

const mockTimeClock = prisma.timeClock.findMany as ReturnType<typeof vi.fn>
const mockStaff = prisma.staff.findUnique as ReturnType<typeof vi.fn>
const mockDelete = prisma.payrollEntry.deleteMany as ReturnType<typeof vi.fn>
const mockCreate = prisma.payrollEntry.create as ReturnType<typeof vi.fn>

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

  it('clears old entries and recreates', async () => {
    mockTimeClock.mockResolvedValueOnce([{ staffId: 's1' }, { staffId: 's2' }])
    mockTimeClock.mockResolvedValueOnce([{ id: '1', clockIn: baseClockIn, clockOut: baseClockOut }])
    mockStaff.mockResolvedValueOnce({ hourlyRate: 25 })
    mockTimeClock.mockResolvedValueOnce([{ id: '2', clockIn: baseClockIn, clockOut: baseClockOut }])
    mockStaff.mockResolvedValueOnce({ hourlyRate: 20 })

    const count = await generatePayPeriod('pp1', 'v1', new Date('2026-07-01'), new Date('2026-07-05'))

    expect(mockDelete).toHaveBeenCalledWith({ where: { payPeriodId: 'pp1' } })
    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(count).toBe(2)
  })
})
