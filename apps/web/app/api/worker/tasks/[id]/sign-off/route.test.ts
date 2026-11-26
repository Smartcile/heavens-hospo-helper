import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  prisma,
  getWorkerSession,
  workerTaskAccess,
  loadWorkerThreadTask,
  setThreadClosed,
} = vi.hoisted(() => ({
  prisma: { taskCompletion: { create: vi.fn() } },
  getWorkerSession: vi.fn(),
  workerTaskAccess: vi.fn(),
  loadWorkerThreadTask: vi.fn(),
  setThreadClosed: vi.fn(),
}))

vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))
vi.mock('@/lib/worker-task-access.server', () => ({ workerTaskAccess }))
vi.mock('@/lib/task-comments.server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/task-comments.server')>()
  return { ...actual, loadWorkerThreadTask, setThreadClosed }
})

import { POST } from './route'

const req = (body: unknown = {}) => ({ json: async () => body }) as never
const params = { params: { id: 't1' } }
const SESSION = { staffId: 's1', venueId: 'v1', departmentId: 'd1', firstName: 'ANN' }
const TASK = {
  id: 't1', venueId: 'v1', title: 'RESEARCH', departmentId: 'd1',
  assignedToStaffId: 's2', isThread: true, threadClosedAt: null, threadClosedById: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  getWorkerSession.mockResolvedValue(SESSION)
  workerTaskAccess.mockResolvedValue({ canEditTask: false })
  loadWorkerThreadTask.mockResolvedValue(TASK)
  setThreadClosed.mockResolvedValue({ isThread: true, threadClosedAt: new Date(), threadClosedById: 's1' })
})

describe('/api/worker/tasks/[id]/sign-off', () => {
  it('requires a session and a visible thread', async () => {
    getWorkerSession.mockResolvedValueOnce(null)
    expect((await POST(req({ closed: true }), params)).status).toBe(401)

    loadWorkerThreadTask.mockResolvedValue(null)
    expect((await POST(req({ closed: true }), params)).status).toBe(404)

    loadWorkerThreadTask.mockResolvedValue({ ...TASK, isThread: false })
    expect((await POST(req({ closed: true }), params)).status).toBe(409)
  })

  it('lets the ASSIGNEE sign off', async () => {
    loadWorkerThreadTask.mockResolvedValue({ ...TASK, assignedToStaffId: 's1' })
    const res = await POST(req({ closed: true }), params)

    expect(res.status).toBe(200)
    expect(setThreadClosed).toHaveBeenCalledWith({ taskId: 't1', closed: true, staffId: 's1' })
  })

  it('forbids a non-assignee floor worker without the edit grant', async () => {
    const res = await POST(req({ closed: true }), params)
    expect(res.status).toBe(403)
    expect(setThreadClosed).not.toHaveBeenCalled()
  })

  it('allows a worker with execution.tasks.edit or a MANAGER', async () => {
    workerTaskAccess.mockResolvedValue({ canEditTask: true })
    expect((await POST(req({ closed: true }), params)).status).toBe(200)

    workerTaskAccess.mockResolvedValue({ canEditTask: false })
    getWorkerSession.mockResolvedValue({ ...SESSION, role: 'MANAGER' })
    expect((await POST(req({ closed: true }), params)).status).toBe(200)
  })

  it('reopens a thread', async () => {
    loadWorkerThreadTask.mockResolvedValue({ ...TASK, assignedToStaffId: 's1' })
    setThreadClosed.mockResolvedValue({ isThread: true, threadClosedAt: null, threadClosedById: null })
    const res = await POST(req({ closed: false }), params)
    expect(res.status).toBe(200)
    expect(setThreadClosed).toHaveBeenCalledWith({ taskId: 't1', closed: false, staffId: 's1' })
    expect((await res.json()).closed).toBe(false)
  })

  it('never writes a TaskCompletion', async () => {
    loadWorkerThreadTask.mockResolvedValue({ ...TASK, assignedToStaffId: 's1' })
    await POST(req({ closed: true }), params)
    expect(prisma.taskCompletion.create).not.toHaveBeenCalled()
  })
})
