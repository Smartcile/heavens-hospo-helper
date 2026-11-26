import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prisma, getServerSession, guardAccess } = vi.hoisted(() => ({
  prisma: {
    task: { findMany: vi.fn() },
    taskCompletion: { findMany: vi.fn() },
    taskPush: { findMany: vi.fn() },
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/utils')>()
  return { ...actual, getTodayDate: () => new Date('2026-11-10T00:00:00.000Z') }
})

import { GET } from './route'

const req = () =>
  ({
    url: 'http://localhost/api/admin/overdue?days=2',
    nextUrl: new URL('http://localhost/api/admin/overdue?days=2'),
  }) as never

function dailyTask() {
  return {
    id: 't1',
    title: 'CLEAN KITCHEN',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    scheduleType: 'DAILY',
    scheduleDays: [],
    customCron: null,
    intervalMonths: 1,
    monthlyOption: null,
    monthlyDay: null,
    isOneOff: false,
    dueDate: null,
    rolloverEnabled: false,
    department: { name: 'BAR', colour: '#ffffff' },
    venue: { name: 'DEMO VENUE', timezone: 'Pacific/Auckland' },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1' } })
  guardAccess.mockResolvedValue(null)
  prisma.task.findMany.mockResolvedValue([dailyTask()])
  prisma.taskCompletion.findMany.mockResolvedValue([])
  prisma.taskPush.findMany.mockResolvedValue([])
})

describe('GET /api/admin/overdue — FINISH TOMORROW suppression', () => {
  it('reports a genuinely missed day but not a day pushed to tomorrow', async () => {
    // 2026-11-09 was deliberately deferred; 2026-11-08 was actually missed.
    prisma.taskPush.findMany.mockResolvedValue([
      { taskId: 't1', fromDate: new Date('2026-11-09T00:00:00.000Z') },
    ])

    const res = await GET(req())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.totalMissed).toBe(1)
    expect(body.items).toHaveLength(1)
    expect(body.items[0].taskId).toBe('t1')
    expect(body.items[0].date.slice(0, 10)).toBe('2026-11-08')
    expect(body.items.some((item: { date: string }) => item.date.startsWith('2026-11-09'))).toBe(false)
  })

  it('still reports every missed day when nothing was pushed', async () => {
    const res = await GET(req())
    const body = await res.json()

    expect(body.totalMissed).toBe(2)
    expect(
      body.items.map((item: { date: string }) => item.date.slice(0, 10)).sort(),
    ).toEqual(['2026-11-08', '2026-11-09'])
  })
})
