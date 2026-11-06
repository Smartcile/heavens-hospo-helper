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
  })
})
