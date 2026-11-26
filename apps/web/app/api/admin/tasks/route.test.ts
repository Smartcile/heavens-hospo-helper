import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  prisma,
  getServerSession,
  guardAccess,
  parentLinkError,
  nextSubtaskOrder,
  syncTaskLists,
} = vi.hoisted(() => ({
  prisma: {
    task: { findFirst: vi.fn(), create: vi.fn() },
    checklist: { count: vi.fn() },
    staff: { count: vi.fn() },
    inventoryItem: { findFirst: vi.fn() },
    trainingModule: { updateMany: vi.fn() },
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  parentLinkError: vi.fn(),
  nextSubtaskOrder: vi.fn(),
  syncTaskLists: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/task-subtasks.server', () => ({ parentLinkError, nextSubtaskOrder }))
vi.mock('@/lib/task-lists.server', () => ({ syncTaskLists }))

import { POST } from './route'

const req = (body: unknown = {}) =>
  ({
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
  }) as unknown as NextRequest

const SESSION = { user: { id: 'st1', role: 'ADMIN', venueId: 'v1' } }

describe('/api/admin/tasks POST', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getServerSession.mockResolvedValue(SESSION)
    guardAccess.mockResolvedValue(null)
    parentLinkError.mockResolvedValue(null)
    nextSubtaskOrder.mockResolvedValue(0)
    prisma.task.findFirst.mockResolvedValue(null)
    prisma.staff.count.mockResolvedValue(1)
    prisma.inventoryItem.findFirst.mockResolvedValue({ id: 'i1' })
    prisma.task.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 't1', ...data }))
  })

  it('rejects a linked item from another venue', async () => {
    prisma.inventoryItem.findFirst.mockResolvedValue(null)

    const res = await POST(req({ title: 'SPRAY BOTTLES', venueId: 'v1', linkedItemId: 'other' }))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'LINKED ITEM IS NOT IN THIS VENUE' })
    expect(prisma.task.create).not.toHaveBeenCalled()
  })

  it('sanitises the description and writes the linked item', async () => {
    const res = await POST(
      req({
        title: 'SPRAY BOTTLES',
        venueId: 'v1',
        linkedItemId: 'i1',
        description: '<script>alert(1)</script><ul><li>Chocolate Powder</li></ul>',
      }),
    )

    expect(res.status).toBe(201)
    expect(prisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          description: '<ul><li>Chocolate Powder</li></ul>',
          linkedItemId: 'i1',
        }),
      }),
    )
    // #166 depends on the created row coming back with its id.
    expect((await res.json()).id).toBe('t1')
  })

  it('accepts the one-off fields (#145)', async () => {
    const res = await POST(req({
      title: 'research high chairs',
      venueId: 'v1',
      isOneOff: true,
      dueDate: '2026-11-25',
      rolloverEnabled: true,
    }))

    expect(res.status).toBe(201)
    const data = prisma.task.create.mock.calls[0][0].data
    expect(data.isOneOff).toBe(true)
    expect(data.rolloverEnabled).toBe(true)
    expect((data.dueDate as Date).toISOString()).toBe('2026-11-25T00:00:00.000Z')
  })

  it('rejects an invalid one-off due date', async () => {
    const res = await POST(req({ title: 'MOP', venueId: 'v1', isOneOff: true, dueDate: '2026-02-31' }))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'INVALID DUE DATE' })
    expect(prisma.task.create).not.toHaveBeenCalled()
  })

  it('still validates the assignee venue', async () => {
    prisma.staff.count.mockResolvedValue(0)

    const res = await POST(req({ title: 'MOP', venueId: 'v1', assignedToStaffId: 'other' }))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'ASSIGNEE IS NOT IN THIS VENUE' })
    expect(prisma.task.create).not.toHaveBeenCalled()
  })
})
