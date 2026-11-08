import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prisma, getWorkerSession, workerTaskAccess, validateWorkerTaskRefs } = vi.hoisted(() => {
  const checklistEvent = { updateMany: vi.fn(), upsert: vi.fn() }
  return {
    prisma: {
      checklist: { findMany: vi.fn(), create: vi.fn() },
      task: { count: vi.fn() },
      venue: { findUnique: vi.fn() },
      calendarEvent: { count: vi.fn() },
      checklistEvent,
      $transaction: vi.fn(),
    },
    getWorkerSession: vi.fn(),
    workerTaskAccess: vi.fn(),
    validateWorkerTaskRefs: vi.fn(),
  }
})

vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))
vi.mock('@/lib/worker-task-access.server', () => ({ workerTaskAccess }))
vi.mock('@/lib/worker-task-refs.server', () => ({ validateWorkerTaskRefs }))

import { POST } from './route'

const req = (body: unknown) => ({ json: async () => body } as unknown as Request)

beforeEach(() => {
  vi.clearAllMocks()
  getWorkerSession.mockResolvedValue({
    staffId: 's1', venueId: 'v1', departmentId: 'd1', firstName: 'ALEX', role: 'MANAGER',
  })
  workerTaskAccess.mockResolvedValue({ canAuthor: true, canCreateList: true })
  validateWorkerTaskRefs.mockResolvedValue(null)
  prisma.task.count.mockResolvedValue(1)
  prisma.checklist.create.mockResolvedValue({ id: 'c1' })
  prisma.calendarEvent.count.mockResolvedValue(0)
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma))
})

describe('POST /api/worker/checklists schedules', () => {
  it('creates schedule windows for the worker venue', async () => {
    const res = await POST(req({
      name: 'closing',
      taskIds: ['t1'],
      schedules: [{ dayOfWeek: 4, fromTime: '17:00', toTime: '22:00' }],
    }))

    expect(res.status).toBe(201)
    expect(prisma.checklist.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          venueId: 'v1',
          schedules: { create: [{ dayOfWeek: 4, fromTime: '17:00', toTime: '22:00' }] },
        }),
      }),
    )
  })

  it('rejects an invalid schedule time', async () => {
    const res = await POST(req({
      name: 'CLOSING',
      taskIds: ['t1'],
      schedules: [{ dayOfWeek: 4, fromTime: '17:00', toTime: '10pm' }],
    }))

    expect(res.status).toBe(400)
    expect(prisma.checklist.create).not.toHaveBeenCalled()
  })
})

describe('POST /api/worker/checklists multi-day', () => {
  it('persists the multiDay flag for the worker venue', async () => {
    const res = await POST(req({ name: 'SIDE WORK', taskIds: ['t1'], multiDay: true }))

    expect(res.status).toBe(201)
    expect(prisma.checklist.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ multiDay: true }) }),
    )
  })
})

describe('POST /api/worker/checklists events', () => {
  it('links the selected events for the worker venue', async () => {
    prisma.calendarEvent.count.mockResolvedValue(1)

    const res = await POST(req({ name: 'DINNER', taskIds: ['t1'], eventIds: ['e1'] }))

    expect(res.status).toBe(201)
    expect(prisma.calendarEvent.count).toHaveBeenCalledWith({
      where: { id: { in: ['e1'] }, venueId: 'v1', deletedAt: null },
    })
    expect(prisma.checklistEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { checklistId_calendarEventId: { checklistId: 'c1', calendarEventId: 'e1' } } }),
    )
  })

  it('rejects an event outside the worker venue', async () => {
    prisma.calendarEvent.count.mockResolvedValue(0)

    const res = await POST(req({ name: 'DINNER', taskIds: ['t1'], eventIds: ['other'] }))

    expect(res.status).toBe(400)
    expect(prisma.checklist.create).not.toHaveBeenCalled()
  })
})
