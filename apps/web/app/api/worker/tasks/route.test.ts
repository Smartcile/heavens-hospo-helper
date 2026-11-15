import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prisma, getWorkerSession, applicableChecklistsForStaff, workerTaskAccess } = vi.hoisted(() => ({
  prisma: {
    departmentLink: { findMany: vi.fn() },
    venue: { findUnique: vi.fn() },
    task: { findMany: vi.fn() },
    staff: { findMany: vi.fn() },
    taskProgress: { deleteMany: vi.fn() },
    taskCompletion: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
  getWorkerSession: vi.fn(),
  applicableChecklistsForStaff: vi.fn(),
  workerTaskAccess: vi.fn(),
}))

vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))
vi.mock('@/lib/utils', () => ({
  getTodayDate: () => new Date('2026-11-08T00:00:00.000Z'),
}))
vi.mock('@/lib/checklist-applicability.server', () => ({ applicableChecklistsForStaff }))
vi.mock('@/lib/worker-task-access.server', () => ({ workerTaskAccess }))

import { GET } from './route'

const req = () =>
  ({ nextUrl: new URL('http://localhost/api/worker/tasks') }) as never

const YESTERDAY = new Date('2026-11-07T00:00:00.000Z')
const TODAY = new Date('2026-11-08T00:00:00.000Z')

function floorTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1',
    title: 'BACK WASH HEADS',
    description: null,
    completionType: 'TICK',
    departmentId: 'd1',
    sectionId: null,
    assignedToStaffId: null,
    scheduleType: 'WEEKLY',
    scheduleDays: [],
    customCron: null,
    intervalMonths: 1,
    monthlyOption: null,
    monthlyDay: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    isOneOff: false,
    dueDate: null,
    rolloverEnabled: false,
    rolledOverFrom: null,
    overrideOutcomes: false,
    allowedOutcomes: [],
    requireOutcomeReason: false,
    readingUnit: null,
    readingMin: null,
    readingMax: null,
    criticalMin: null,
    criticalMax: null,
    department: { id: 'd1', name: 'BAR', colour: '#ffffff' },
    section: null,
    linkedItem: null,
    taskCompletions: [],
    progress: null,
    taskGuides: [],
    trainingModules: [],
    parent: null,
    subtasks: [],
    ...overrides,
  }
}

function partial(progressDate: Date) {
  return {
    progressDate,
    note: 'half done',
    staff: { firstName: 'ANN', lastName: 'B' },
    createdAt: new Date('2026-11-07T10:00:00.000Z'),
  }
}

function multiDayChecklist() {
  return {
    id: 'c1', name: 'SIDE WORK', appearFromTime: null, activatedOn: null,
    schedules: [], events: [], allowedOutcomes: [], requireOutcomeReason: false,
    multiDay: true, tasks: [{ taskId: 't1' }],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  getWorkerSession.mockResolvedValue({
    staffId: 's1', venueId: 'v1', departmentId: null, firstName: 'ANN',
  })
  workerTaskAccess.mockResolvedValue({ canAuthor: false })
  applicableChecklistsForStaff.mockResolvedValue({ checklists: [], departmentIds: null })
  prisma.venue.findUnique.mockResolvedValue({ timezone: 'Pacific/Auckland' })
  prisma.staff.findMany.mockResolvedValue([])
  prisma.taskProgress.deleteMany.mockResolvedValue({ count: 1 })
  prisma.taskCompletion.findMany.mockResolvedValue([])
})

describe('GET /api/worker/tasks — day-aware partials', () => {
  // #94 — the reported bug: a PARTIAL left on a daily list yesterday must not
  // stay "in progress" today.
  it('drops and sweeps a stale today-only partial', async () => {
    prisma.task.findMany.mockResolvedValue([floorTask({ progress: partial(YESTERDAY) })])

    const res = await GET(req())
    const body = await res.json()

    expect(body.tasks).toHaveLength(0)
    expect(prisma.taskProgress.deleteMany).toHaveBeenCalledWith({
      where: { taskId: { in: ['t1'] } },
    })
  })

  it('keeps a stale partial live on a multi-day list and never sweeps it', async () => {
    prisma.task.findMany.mockResolvedValue([floorTask({ progress: partial(YESTERDAY) })])
    applicableChecklistsForStaff.mockResolvedValue({
      checklists: [multiDayChecklist()], departmentIds: null,
    })

    const res = await GET(req())
    const body = await res.json()

    expect(body.tasks).toHaveLength(1)
    expect(body.tasks[0].inProgress).not.toBeNull()
    expect(body.checklists[0].multiDay).toBe(true)
    expect(prisma.taskProgress.deleteMany).not.toHaveBeenCalled()
  })

  it('keeps a partial reported today on a normal list', async () => {
    prisma.task.findMany.mockResolvedValue([floorTask({ progress: partial(TODAY) })])

    const res = await GET(req())
    const body = await res.json()

    expect(body.tasks).toHaveLength(1)
    expect(body.tasks[0].inProgress).not.toBeNull()
    expect(body.tasks[0].inProgress.byName).toBe('ANN B')
    expect(prisma.taskProgress.deleteMany).not.toHaveBeenCalled()
  })

  // #146 Part A — a task completed today stays settled even after an edit
  // (schedule/list change) makes it no longer due.
  it("returns a no-longer-due task that has today's live completion", async () => {
    prisma.task.findMany.mockResolvedValue([
      floorTask({
        taskCompletions: [{
          id: 'tc1',
          outcome: 'DONE',
          note: null,
          photoUrl: null,
          completedAt: new Date('2026-11-08T09:00:00.000Z'),
          staff: { firstName: 'ANN', lastName: 'B' },
        }],
      }),
    ])

    const res = await GET(req())
    const body = await res.json()

    expect(body.tasks).toHaveLength(1)
    expect(body.tasks[0].isSettled).toBe(true)
    expect(body.tasks[0].isDone).toBe(true)
    expect(body.tasks[0].completedByName).toBe('ANN B')

    // The completion query only loads today's live rows.
    const args = prisma.task.findMany.mock.calls[0][0]
    expect(args.include.taskCompletions.where).toEqual({ scheduledDate: TODAY, deletedAt: null })
  })

  it('does not treat a soft-deleted completion as today\'s', async () => {
    // Prisma filters `deletedAt: null`, so a soft-deleted row is not returned.
    prisma.task.findMany.mockResolvedValue([floorTask({ taskCompletions: [] })])

    const res = await GET(req())
    const body = await res.json()

    expect(body.tasks).toHaveLength(0)
    const args = prisma.task.findMany.mock.calls[0][0]
    expect(args.include.taskCompletions.where.deletedAt).toBeNull()
  })

  it('never writes a TaskCompletion on the read path', async () => {
    prisma.task.findMany.mockResolvedValue([
      floorTask({
        taskCompletions: [{
          id: 'tc1',
          outcome: 'DONE',
          note: null,
          photoUrl: null,
          completedAt: new Date('2026-11-08T09:00:00.000Z'),
          staff: { firstName: 'ANN', lastName: 'B' },
        }],
      }),
    ])

    await GET(req())

    expect(prisma.taskCompletion.create).not.toHaveBeenCalled()
    expect(prisma.taskCompletion.update).not.toHaveBeenCalled()
    expect(prisma.taskCompletion.updateMany).not.toHaveBeenCalled()
    expect(prisma.taskCompletion.delete).not.toHaveBeenCalled()
    expect(prisma.taskCompletion.deleteMany).not.toHaveBeenCalled()
  })
})
