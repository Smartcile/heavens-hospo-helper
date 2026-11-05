import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getWorkerSession, workerTaskAccess, validateWorkerTaskRefs } = vi.hoisted(() => ({
  prisma: { checklist: { findUnique: vi.fn(), update: vi.fn() }, task: { count: vi.fn() } },
  getWorkerSession: vi.fn(),
  workerTaskAccess: vi.fn(),
  validateWorkerTaskRefs: vi.fn(),
}))

vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))
vi.mock('@/lib/worker-task-access.server', () => ({ workerTaskAccess }))
vi.mock('@/lib/worker-task-refs.server', () => ({ validateWorkerTaskRefs }))

import { PUT } from './route'

const req = (body: unknown) => ({ json: async () => body } as unknown as NextRequest)

beforeEach(() => {
  vi.clearAllMocks()
  getWorkerSession.mockResolvedValue({ staffId: 's1', venueId: 'v1', firstName: 'ALEX', role: 'MANAGER' })
  workerTaskAccess.mockResolvedValue({ canEditList: true })
  validateWorkerTaskRefs.mockResolvedValue(null)
  prisma.checklist.findUnique.mockResolvedValue({ id: 'c1', venueId: 'v1', deletedAt: null })
  prisma.checklist.update.mockResolvedValue({ id: 'c1' })
})

describe('PUT /api/worker/checklists/[id] schedules', () => {
  it('replaces the schedule wholesale', async () => {
    const res = await PUT(
      req({ schedules: [{ dayOfWeek: 1, fromTime: '08:00' }] }),
      { params: { id: 'c1' } },
    )

    expect(res.status).toBe(200)
    const data = prisma.checklist.update.mock.calls[0][0].data
    expect(data.schedules).toEqual({
      updateMany: { where: { deletedAt: null }, data: { deletedAt: expect.any(Date) } },
      create: [{ dayOfWeek: 1, fromTime: '08:00', toTime: null }],
    })
  })

  it('rejects an invalid day-of-week', async () => {
    const res = await PUT(
      req({ schedules: [{ dayOfWeek: 9, fromTime: '08:00' }] }),
      { params: { id: 'c1' } },
    )

    expect(res.status).toBe(400)
    expect(prisma.checklist.update).not.toHaveBeenCalled()
  })

  it('retains the worker venue check', async () => {
    prisma.checklist.findUnique.mockResolvedValue({ id: 'c1', venueId: 'other', deletedAt: null })

    const res = await PUT(req({ name: 'X' }), { params: { id: 'c1' } })

    expect(res.status).toBe(403)
    expect(prisma.checklist.update).not.toHaveBeenCalled()
  })
})
