import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prisma, getWorkerSession, applicableChecklistsForStaff } = vi.hoisted(() => ({
  prisma: {
    venue: { findUnique: vi.fn() },
    task: { findUnique: vi.fn() },
    taskProgress: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    taskPush: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    notice: { create: vi.fn() },
    taskCompletion: { findFirst: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  },
  getWorkerSession: vi.fn(),
  applicableChecklistsForStaff: vi.fn(),
}))

vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))
vi.mock('@/lib/utils', () => ({
  getTodayDate: () => new Date('2026-11-08T00:00:00.000Z'),
}))
vi.mock('@/lib/checklist-applicability.server', () => ({ applicableChecklistsForStaff }))

import { DELETE, POST } from './route'

const TODAY = new Date('2026-11-08T00:00:00.000Z')
const TOMORROW = new Date('2026-11-09T00:00:00.000Z')
const YESTERDAY = new Date('2026-11-07T00:00:00.000Z')
const DAY_BEFORE = new Date('2026-11-06T00:00:00.000Z')

const req = (body?: unknown) =>
  ({ json: async () => body ?? {} } as never)

function list(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    name: 'SIDE WORK',
    appearFromTime: null,
    activatedOn: null,
    schedules: [],
    events: [],
    allowedOutcomes: [],
    requireOutcomeReason: false,
    multiDay: false,
    departmentId: 'd1',
    excludeFromProgress: false,
    allowPushToTomorrow: true,
    pushAlertAfter: 3,
    tasks: [{ taskId: 't1', groupLabel: null }],
    ...overrides,
  }
}

const params = { params: { id: 't1' } }

beforeEach(() => {
  vi.clearAllMocks()
  getWorkerSession.mockResolvedValue({
    staffId: 's1', venueId: 'v1', departmentId: 'd1', firstName: 'ANN', role: 'STAFF',
  })
  prisma.venue.findUnique.mockResolvedValue({ timezone: 'Pacific/Auckland' })
  prisma.task.findUnique.mockResolvedValue({ id: 't1', title: 'DEEP CLEAN', venueId: 'v1', departmentId: 'd1' })
  applicableChecklistsForStaff.mockResolvedValue({ checklists: [list()], departmentIds: null })
  prisma.taskPush.findFirst.mockResolvedValue(null)
  prisma.taskProgress.findUnique.mockResolvedValue(null)
  prisma.taskProgress.upsert.mockResolvedValue({ id: 'p1' })
  prisma.taskPush.create.mockResolvedValue({ id: 'push1', createdProgress: true })
  prisma.taskPush.findMany.mockResolvedValue([])
  prisma.notice.create.mockResolvedValue({ id: 'n1' })
  prisma.taskPush.update.mockResolvedValue({ id: 'push1' })
  prisma.taskProgress.updateMany.mockResolvedValue({ count: 1 })
  prisma.taskProgress.deleteMany.mockResolvedValue({ count: 1 })
  prisma.taskCompletion.findFirst.mockResolvedValue(null)
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      taskPush: {
        findFirst: prisma.taskPush.findFirst,
        create: prisma.taskPush.create,
      },
    }),
  )
})

describe('POST /api/worker/tasks/[id]/push', () => {
  it('401 without a worker session', async () => {
    getWorkerSession.mockResolvedValue(null)
    const res = await POST(req({}), params)
    expect(res.status).toBe(401)
    expect(prisma.taskPush.create).not.toHaveBeenCalled()
  })

  it('404 when the task is not in the worker venue', async () => {
    prisma.task.findUnique.mockResolvedValue({ id: 't1', title: 'X', venueId: 'other', departmentId: null })
    const res = await POST(req({}), params)
    expect(res.status).toBe(404)
    expect(prisma.taskPush.create).not.toHaveBeenCalled()
  })

  it('422 when no list containing the task is open', async () => {
    applicableChecklistsForStaff.mockResolvedValue({
      checklists: [list({ appearFromTime: '17:00' })],
      departmentIds: null,
    })
    const res = await POST(req({}), params)
    expect(res.status).toBe(422)
    expect(prisma.taskPush.create).not.toHaveBeenCalled()
  })

  it('422 when the open list does not allow FINISH TOMORROW', async () => {
    applicableChecklistsForStaff.mockResolvedValue({
      checklists: [list({ allowPushToTomorrow: false })],
      departmentIds: null,
    })
    const res = await POST(req({}), params)
    expect(res.status).toBe(422)
    expect(prisma.taskProgress.upsert).not.toHaveBeenCalled()
  })

  it('409 when the task is already completed today', async () => {
    prisma.taskCompletion.findFirst.mockResolvedValue({ id: 'tc1' })

    const res = await POST(req({}), params)
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toBe('TASK ALREADY COMPLETED TODAY')
    expect(prisma.taskProgress.upsert).not.toHaveBeenCalled()
    expect(prisma.taskPush.create).not.toHaveBeenCalled()
  })

  it('hides the task until tomorrow and writes no completion', async () => {
    // The push row is in the table when the streak is read back.
    prisma.taskPush.findMany.mockResolvedValue([
      { fromDate: TODAY, toDate: TOMORROW, alertedAt: null },
    ])
    const res = await POST(req({ note: 'second coat needed' }), params)
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.pushedTo).toBe('2026-11-09')
    expect(body.streak).toBe(1)
    expect(body.alertRaised).toBe(false)

    expect(prisma.taskProgress.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { taskId: 't1' },
        create: expect.objectContaining({ pushedToDate: TOMORROW, progressDate: TODAY }),
        update: expect.objectContaining({ pushedToDate: TOMORROW, progressDate: TODAY }),
      }),
    )
    expect(prisma.taskPush.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          taskId: 't1',
          venueId: 'v1',
          fromDate: TODAY,
          toDate: TOMORROW,
          note: 'second coat needed',
          // No progress row existed, so undo may remove the one this push creates.
          createdProgress: true,
        }),
      }),
    )
    // A push is a deferral, never a completion.
    expect(prisma.taskCompletion.create).not.toHaveBeenCalled()
    expect(prisma.notice.create).not.toHaveBeenCalled()
  })

  it('records that an earlier PARTIAL already existed', async () => {
    prisma.taskProgress.findUnique.mockResolvedValue({ id: 'existing-progress' })
    prisma.taskPush.findMany.mockResolvedValue([
      { fromDate: TODAY, toDate: TOMORROW, alertedAt: null },
    ])

    await POST(req({}), params)

    expect(prisma.taskPush.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ createdProgress: false }),
      }),
    )
  })

  it('trims and caps the push note at 500 characters', async () => {
    prisma.taskPush.findMany.mockResolvedValue([
      { fromDate: TODAY, toDate: TOMORROW, alertedAt: null },
    ])

    await POST(req({ note: `   ${'x'.repeat(600)}   ` }), params)

    const data = prisma.taskPush.create.mock.calls[0][0].data
    expect(data.note).toHaveLength(500)
    expect(data.note).toBe('x'.repeat(500))
  })

  it('raises one pinned manager Notice when the streak hits the threshold', async () => {
    prisma.taskPush.findMany.mockResolvedValue([
      { fromDate: TODAY, toDate: TOMORROW, alertedAt: null },
      { fromDate: YESTERDAY, toDate: TODAY, alertedAt: null },
      { fromDate: DAY_BEFORE, toDate: YESTERDAY, alertedAt: null },
    ])

    const res = await POST(req({}), params)
    const body = await res.json()

    expect(body.streak).toBe(3)
    expect(body.alertRaised).toBe(true)
    expect(prisma.notice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          venueId: 'v1',
          departmentId: 'd1',
          priority: 'IMPORTANT',
          pinned: true,
          requiresAck: false,
        }),
      }),
    )
    expect(prisma.taskPush.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'push1' }, data: { alertedAt: expect.any(Date) } }),
    )
    // Still no completion for a deferral.
    expect(prisma.taskCompletion.create).not.toHaveBeenCalled()
  })

  it('falls back to the open list department for the alert when the task has none', async () => {
    prisma.task.findUnique.mockResolvedValue({ id: 't1', title: 'DEEP CLEAN', venueId: 'v1', departmentId: null })
    applicableChecklistsForStaff.mockResolvedValue({
      checklists: [list({ departmentId: 'd-list' })],
      departmentIds: null,
    })
    prisma.taskPush.findMany.mockResolvedValue([
      { fromDate: TODAY, toDate: TOMORROW, alertedAt: null },
      { fromDate: YESTERDAY, toDate: TODAY, alertedAt: null },
      { fromDate: DAY_BEFORE, toDate: YESTERDAY, alertedAt: null },
    ])

    const res = await POST(req({}), params)

    expect(res.status).toBe(201)
    expect(prisma.notice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ departmentId: 'd-list' }),
      }),
    )
  })

  it('does not alert below the threshold', async () => {
    prisma.taskPush.findMany.mockResolvedValue([
      { fromDate: TODAY, toDate: TOMORROW, alertedAt: null },
      { fromDate: YESTERDAY, toDate: TODAY, alertedAt: null },
    ])

    const res = await POST(req({}), params)
    const body = await res.json()

    expect(body.streak).toBe(2)
    expect(body.alertRaised).toBe(false)
    expect(prisma.notice.create).not.toHaveBeenCalled()
  })

  it('does not duplicate the alert once the streak already alerted', async () => {
    prisma.taskPush.findMany.mockResolvedValue([
      { fromDate: TODAY, toDate: TOMORROW, alertedAt: null },
      { fromDate: YESTERDAY, toDate: TODAY, alertedAt: new Date('2026-11-07T09:00:00.000Z') },
      { fromDate: DAY_BEFORE, toDate: YESTERDAY, alertedAt: null },
    ])

    const res = await POST(req({}), params)
    const body = await res.json()

    expect(body.streak).toBe(3)
    expect(body.alertRaised).toBe(false)
    expect(prisma.notice.create).not.toHaveBeenCalled()
  })

  it('is idempotent when the task was already pushed today', async () => {
    prisma.taskPush.findFirst.mockResolvedValue({ id: 'existing', toDate: TOMORROW })

    const res = await POST(req({}), params)
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.pushedTo).toBe('2026-11-09')
    expect(prisma.taskPush.create).not.toHaveBeenCalled()
    expect(prisma.taskProgress.upsert).toHaveBeenCalled()
  })
})

describe('DELETE /api/worker/tasks/[id]/push', () => {
  it('401 without a worker session', async () => {
    getWorkerSession.mockResolvedValue(null)
    const res = await DELETE(req(), params)
    expect(res.status).toBe(401)
  })

  it('404 when there is no push today', async () => {
    prisma.taskPush.findFirst.mockResolvedValue(null)
    const res = await DELETE(req(), params)
    expect(res.status).toBe(404)
    expect(prisma.taskPush.update).not.toHaveBeenCalled()
  })

  it('soft-deletes today\'s push and keeps an earlier PARTIAL', async () => {
    prisma.taskPush.findFirst.mockResolvedValue({ id: 'push1', createdProgress: false })

    const res = await DELETE(req(), params)

    expect(res.status).toBe(200)
    expect(prisma.taskPush.update).toHaveBeenCalledWith({
      where: { id: 'push1' },
      data: { deletedAt: expect.any(Date) },
    })
    expect(prisma.taskProgress.updateMany).toHaveBeenCalledWith({
      where: { taskId: 't1', pushedToDate: { not: null } },
      data: { pushedToDate: null },
    })
    // The progress row pre-existed, so it must not be removed.
    expect(prisma.taskProgress.deleteMany).not.toHaveBeenCalled()
  })

  it('removes the progress row when the push created it', async () => {
    prisma.taskPush.findFirst.mockResolvedValue({ id: 'push1', createdProgress: true })

    const res = await DELETE(req(), params)

    expect(res.status).toBe(200)
    expect(prisma.taskProgress.deleteMany).toHaveBeenCalledWith({ where: { taskId: 't1' } })
    // No synthetic PARTIAL: nothing is left behind to un-hide.
    expect(prisma.taskProgress.updateMany).not.toHaveBeenCalled()
  })
})
