import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  prisma,
  getServerSession,
  canAccess,
  trainingStatusForVenue,
  parkingHealthForVenue,
  ftpHealthForVenue,
  worstFtpHealth,
} = vi.hoisted(() => ({
  prisma: {
    venue: { findUnique: vi.fn() },
    booking: { findMany: vi.fn(), count: vi.fn() },
    wooOrder: { findMany: vi.fn(), aggregate: vi.fn() },
    event: { findMany: vi.fn() },
    hsAlert: { count: vi.fn() },
    timeClock: { count: vi.fn() },
    tipsPeriod: { findFirst: vi.fn() },
  },
  getServerSession: vi.fn(),
  canAccess: vi.fn(),
  trainingStatusForVenue: vi.fn(),
  parkingHealthForVenue: vi.fn(),
  ftpHealthForVenue: vi.fn(),
  worstFtpHealth: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ canAccess }))
vi.mock('@/lib/training-status.server', () => ({ trainingStatusForVenue }))
vi.mock('@/lib/parking-health.server', () => ({ parkingHealthForVenue }))
vi.mock('@/lib/ftp-health-state.server', () => ({ ftpHealthForVenue, worstFtpHealth }))

import { GET } from './route'

const req = () => ({ nextUrl: new URL('http://localhost/api/admin/dashboard/widgets') } as NextRequest)

const FORBIDDEN = [
  'amount',
  'cash',
  'cashCounts',
  'pos',
  'posTotal',
  'pool',
  'poolTotal',
  'totalTips',
  'value',
  'shareWeight',
  'hours',
  'shares',
]

function allKeys(value: unknown, keys: string[] = []): string[] {
  if (!value || typeof value !== 'object') return keys
  if (Array.isArray(value)) {
    for (const item of value) allKeys(item, keys)
    return keys
  }
  for (const [key, child] of Object.entries(value)) {
    keys.push(key)
    allKeys(child, keys)
  }
  return keys
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'MANAGER', venueId: 'v1' } })
  canAccess.mockResolvedValue(true)
  prisma.venue.findUnique.mockResolvedValue({ timezone: 'Pacific/Auckland' })
  prisma.booking.findMany.mockResolvedValue([])
  prisma.booking.count.mockResolvedValue(0)
  prisma.wooOrder.findMany.mockResolvedValue([])
  prisma.wooOrder.aggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { totalAmount: null } })
  prisma.event.findMany.mockResolvedValue([])
  prisma.hsAlert.count.mockResolvedValue(0)
  prisma.timeClock.count.mockResolvedValue(0)
  trainingStatusForVenue.mockResolvedValue(null)
  parkingHealthForVenue.mockResolvedValue({ message: 'NOT CONFIGURED' })
  ftpHealthForVenue.mockResolvedValue([])
  worstFtpHealth.mockReturnValue(null)
  prisma.tipsPeriod.findFirst.mockResolvedValue({
    label: 'FEBRUARY 2026',
    fromDate: new Date('2026-02-01T00:00:00.000Z'),
    toDate: new Date('2026-02-28T00:00:00.000Z'),
    shares: [{ status: 'PLANNED' }, { status: 'APPROVED' }, { status: 'ISSUED' }],
  })
})

describe('GET /api/admin/dashboard/widgets tips projection', () => {
  it('returns status counts + percent only — never a monetary key', async () => {
    const res = await GET(req())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.tips).toEqual({
      label: 'FEBRUARY 2026',
      total: 3,
      planned: 1,
      approved: 1,
      issued: 1,
      fullyIssued: 0,
      percent: 33,
      stage: 'ISSUED',
    })
    const keys = allKeys(body.tips)
    for (const forbidden of FORBIDDEN) expect(keys).not.toContain(forbidden)
  })

  it('is permission-gated', async () => {
    canAccess.mockResolvedValue(false)
    const res = await GET(req())
    expect((await res.json()).tips).toBeNull()
    expect(prisma.tipsPeriod.findFirst).not.toHaveBeenCalled()
  })
})
