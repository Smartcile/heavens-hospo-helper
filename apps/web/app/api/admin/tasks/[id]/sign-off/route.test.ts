import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const {
  prisma,
  getServerSession,
  guardAccess,
  canAccess,
  loadAdminThreadTask,
  setThreadClosed,
} = vi.hoisted(() => ({
  prisma: { taskCompletion: { create: vi.fn() } },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  canAccess: vi.fn(),
  loadAdminThreadTask: vi.fn(),
  setThreadClosed: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess, canAccess }))
vi.mock('@/lib/task-comments.server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/task-comments.server')>()
  return { ...actual, loadAdminThreadTask, setThreadClosed }
})

import { POST } from './route'

const req = (body: unknown = {}) => ({ json: async () => body }) as never
const params = { params: { id: 't1' } }
const TASK = {
  id: 't1', venueId: 'v1', title: 'RESEARCH', departmentId: 'd1',
  assignedToStaffId: 's9', isThread: true, threadClosedAt: null, threadClosedById: null,
}

function session(role: string) {
  return { user: { id: 'u1', role, venueId: 'v1', availableVenueIds: ['v1'] } }
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue(session('ADMIN'))
  guardAccess.mockResolvedValue(null)
  canAccess.mockResolvedValue(false)
  loadAdminThreadTask.mockResolvedValue(TASK)
  setThreadClosed.mockResolvedValue({ isThread: true, threadClosedAt: new Date(), threadClosedById: 'u1' })
})

describe('/api/admin/tasks/[id]/sign-off', () => {
  it('requires the view grant and an existing thread', async () => {
    getServerSession.mockResolvedValueOnce(null)
    expect((await POST(req({ closed: true }), params)).status).toBe(401)

    guardAccess.mockResolvedValueOnce(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
    expect((await POST(req({ closed: true }), params)).status).toBe(403)

    loadAdminThreadTask.mockResolvedValue(null)
    expect((await POST(req({ closed: true }), params)).status).toBe(404)

    loadAdminThreadTask.mockResolvedValue({ ...TASK, isThread: false })
    expect((await POST(req({ closed: true }), params)).status).toBe(409)
  })

  it('ADMIN/MANAGER can sign off without the edit grant', async () => {
    canAccess.mockResolvedValue(false)
    const res = await POST(req({ closed: true }), params)

    expect(res.status).toBe(200)
    expect(setThreadClosed).toHaveBeenCalledWith({ taskId: 't1', closed: true, staffId: 'u1' })
    expect((await res.json()).closed).toBe(true)
  })

  it('a restricted/other role needs the edit grant', async () => {
    getServerSession.mockResolvedValue(session('STAFF'))
    canAccess.mockResolvedValue(false)
    expect((await POST(req({ closed: true }), params)).status).toBe(403)

    canAccess.mockResolvedValue(true)
    expect((await POST(req({ closed: true }), params)).status).toBe(200)
  })

  it('reopens a thread', async () => {
    setThreadClosed.mockResolvedValue({ isThread: true, threadClosedAt: null, threadClosedById: null })
    const res = await POST(req({ closed: false }), params)
    expect(res.status).toBe(200)
    expect(setThreadClosed).toHaveBeenCalledWith({ taskId: 't1', closed: false, staffId: 'u1' })
    expect((await res.json()).closed).toBe(false)
  })

  it('rejects a missing closed flag', async () => {
    expect((await POST(req({}), params)).status).toBe(400)
  })

  it('never writes a TaskCompletion', async () => {
    await POST(req({ closed: true }), params)
    expect(prisma.taskCompletion.create).not.toHaveBeenCalled()
  })
})
