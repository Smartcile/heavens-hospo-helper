import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  prisma,
  getServerSession,
  guardAccess,
  parentLinkError,
  nextSubtaskOrder,
  hasLiveSubtasks,
  softDeleteTask,
  linkedItemError,
} = vi.hoisted(() => ({
  prisma: {
    task: { findUnique: vi.fn(), update: vi.fn() },
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  parentLinkError: vi.fn(),
  nextSubtaskOrder: vi.fn(),
  hasLiveSubtasks: vi.fn(),
  softDeleteTask: vi.fn(),
  linkedItemError: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/retrain', () => ({ postRetrainNotice: vi.fn() }))
vi.mock('@/lib/task-subtasks.server', () => ({
  parentLinkError,
  nextSubtaskOrder,
  hasLiveSubtasks,
  softDeleteTask,
}))
vi.mock('@/lib/task-linked-item.server', () => ({
  linkedItemSelect: {},
  linkedItemError,
}))

import { GET, PUT, DELETE } from './route'

const req = (body: unknown = {}) =>
  ({
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
  }) as unknown as NextRequest

const SESSION = { user: { id: 'st1', role: 'ADMIN', venueId: 'v1' } }

describe('/api/admin/tasks/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getServerSession.mockResolvedValue(SESSION)
    guardAccess.mockResolvedValue(null)
    prisma.task.findUnique.mockResolvedValue({ id: 't1', venueId: 'v1', parentTaskId: null })
    prisma.task.update.mockResolvedValue({ id: 't1' })
    parentLinkError.mockResolvedValue(null)
    nextSubtaskOrder.mockResolvedValue(2)
    hasLiveSubtasks.mockResolvedValue(false)
    linkedItemError.mockResolvedValue(null)
  })

  it('GET returns the parent title and children', async () => {
    prisma.task.findUnique.mockResolvedValue({
      id: 't1', title: 'NEWSPAPERS', venueId: 'v1', departmentId: null, sectionId: null,
      assignedToStaffId: null, completionType: 'TICK', scheduleType: 'DAILY', scheduleDays: [],
      customCron: null, intervalMonths: 1, monthlyOption: null, monthlyDay: null, isActive: true,
      status: 'ACTIVE', hsCategory: null, linkedItemId: null, readingUnit: null, readingMin: null,
      readingMax: null, criticalMin: null, criticalMax: null, allowedOutcomes: [],
      overrideOutcomes: false, requireOutcomeReason: false, parentTaskId: null, subtaskOrder: 0,
      sections: [], requiredTraining: [], taskGuides: [],
      parent: null,
      linkedItem: {
        id: 'i1', name: 'SPRAY BOTTLE', unit: 'EA', storageNotes: null, deletedAt: null,
        storageLocations: [
          { notes: 'TOP SHELF', section: { name: 'UNDER SINK', department: { name: 'BAR' } } },
        ],
      },
      subtasks: [{ id: 'c1', title: 'THROW OUT PAPERS', isActive: true, subtaskOrder: 0 }],
    })

    const res = await GET(req(), { params: { id: 't1' } })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.subtasks).toHaveLength(1)
    expect(body.subtasks[0].title).toBe('THROW OUT PAPERS')
    expect(body.parentTitle).toBeNull()
    expect(body.linkedItem.name).toBe('SPRAY BOTTLE')
    expect(body.linkedItem.storageLocations[0].section.department.name).toBe('BAR')
  })

  it('PUT rejects a linked item from another venue', async () => {
    linkedItemError.mockResolvedValue('LINKED ITEM IS NOT IN THIS VENUE')

    const res = await PUT(req({ linkedItemId: 'other-venue-item' }), { params: { id: 't1' } })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'LINKED ITEM IS NOT IN THIS VENUE' })
    expect(prisma.task.update).not.toHaveBeenCalled()
  })

  it('PUT sanitises a rich-text description and saves the linked item', async () => {
    const res = await PUT(
      req({ description: '<script>alert(1)</script><p>SPRAY <strong>BOTTLE</strong></p>', linkedItemId: 'i1' }),
      { params: { id: 't1' } },
    )

    expect(res.status).toBe(200)
    expect(prisma.task.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: {
        description: '<p>SPRAY <strong>BOTTLE</strong></p>',
        linkedItemId: 'i1',
      },
    })
  })

  it('PUT rejects a cross-venue parent', async () => {
    parentLinkError.mockResolvedValue('PARENT TASK MUST BE IN THE SAME VENUE')

    const res = await PUT(req({ parentTaskId: 'p9' }), { params: { id: 't1' } })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'PARENT TASK MUST BE IN THE SAME VENUE' })
    expect(prisma.task.update).not.toHaveBeenCalled()
  })

  it('PUT rejects a task as its own parent', async () => {
    hasLiveSubtasks.mockResolvedValue(false)
    parentLinkError.mockResolvedValue('A TASK CANNOT BE ITS OWN PARENT')

    const res = await PUT(req({ parentTaskId: 't1' }), { params: { id: 't1' } })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'A TASK CANNOT BE ITS OWN PARENT' })
  })

  it('PUT rejects depth > 1 when the task already has children', async () => {
    hasLiveSubtasks.mockResolvedValue(true)
    parentLinkError.mockResolvedValue('A TASK WITH SUBTASKS CANNOT BECOME A SUBTASK')

    const res = await PUT(req({ parentTaskId: 'p1' }), { params: { id: 't1' } })

    expect(res.status).toBe(400)
    expect(hasLiveSubtasks).toHaveBeenCalledWith('t1')
    expect(await res.json()).toEqual({ error: 'A TASK WITH SUBTASKS CANNOT BECOME A SUBTASK' })
  })

  it('PUT saves a valid parent with the next subtask order', async () => {
    prisma.task.findUnique.mockResolvedValue({ id: 't1', venueId: 'v1', parentTaskId: null })

    const res = await PUT(req({ parentTaskId: 'p1' }), { params: { id: 't1' } })

    expect(res.status).toBe(200)
    expect(parentLinkError).toHaveBeenCalledWith({
      parentTaskId: 'p1', taskId: 't1', taskVenueId: 'v1', childHasSubtasks: false,
    })
    expect(prisma.task.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { parentTaskId: 'p1', subtaskOrder: 2 },
    })
  })

  it('DELETE soft-deletes the parent and unparents its children', async () => {
    const res = await DELETE(req(), { params: { id: 'p1' } })

    expect(res.status).toBe(200)
    expect(softDeleteTask).toHaveBeenCalledWith('p1', true)
  })
})
