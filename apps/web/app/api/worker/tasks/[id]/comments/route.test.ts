import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getWorkerSession,
  workerTaskAccess,
  loadWorkerThreadTask,
  listTaskComments,
  addTaskComment,
  softDeleteTaskComment,
} = vi.hoisted(() => ({
  getWorkerSession: vi.fn(),
  workerTaskAccess: vi.fn(),
  loadWorkerThreadTask: vi.fn(),
  listTaskComments: vi.fn(),
  addTaskComment: vi.fn(),
  softDeleteTaskComment: vi.fn(),
}))

vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))
vi.mock('@/lib/worker-task-access.server', () => ({ workerTaskAccess }))
vi.mock('@/lib/task-comments.server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/task-comments.server')>()
  return {
    ...actual,
    loadWorkerThreadTask,
    listTaskComments,
    addTaskComment,
    softDeleteTaskComment,
  }
})

import { GET, POST, DELETE } from './route'

const req = (body: unknown = {}) =>
  ({ json: async () => body }) as never

const params = { params: { id: 't1' } }
const SESSION = { staffId: 's1', venueId: 'v1', departmentId: 'd1', firstName: 'ANN' }
const TASK = {
  id: 't1', venueId: 'v1', title: 'RESEARCH', departmentId: 'd1',
  assignedToStaffId: null, isThread: true, threadClosedAt: null, threadClosedById: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  getWorkerSession.mockResolvedValue(SESSION)
  workerTaskAccess.mockResolvedValue({ canEditTask: false })
  loadWorkerThreadTask.mockResolvedValue(TASK)
  listTaskComments.mockResolvedValue([])
  addTaskComment.mockResolvedValue({ id: 'c1', body: 'HELLO', imageUrls: [], authorId: 's1', authorName: 'ANN B', createdAt: new Date().toISOString(), canDelete: true })
  softDeleteTaskComment.mockResolvedValue('ok')
})

describe('/api/worker/tasks/[id]/comments', () => {
  it('requires a worker session', async () => {
    getWorkerSession.mockResolvedValue(null)
    expect((await GET(req(), params)).status).toBe(401)
  })

  it('returns 404 when the task is not visible to the worker', async () => {
    loadWorkerThreadTask.mockResolvedValue(null)
    expect((await GET(req(), params)).status).toBe(404)
  })

  it('returns comments and canSignOff for the assignee', async () => {
    loadWorkerThreadTask.mockResolvedValue({ ...TASK, assignedToStaffId: 's1' })
    listTaskComments.mockResolvedValue([{ id: 'c1' }])

    const res = await GET(req(), params)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.comments).toHaveLength(1)
    expect(body.canSignOff).toBe(true)
    expect(body.canDeleteAny).toBe(false)
  })

  it('rejects a non-thread task and a closed thread', async () => {
    loadWorkerThreadTask.mockResolvedValue({ ...TASK, isThread: false })
    expect((await POST(req({ body: 'HI' }), params)).status).toBe(409)

    loadWorkerThreadTask.mockResolvedValue({ ...TASK, threadClosedAt: new Date() })
    expect((await POST(req({ body: 'HI' }), params)).status).toBe(409)
  })

  it('lets a floor worker reply WITHOUT execution.tasks.edit', async () => {
    const res = await POST(req({ body: 'HELLO', imageUrls: ['/api/upload/a.jpg'] }), params)

    expect(res.status).toBe(201)
    expect(addTaskComment).toHaveBeenCalledWith({
      taskId: 't1', staffId: 's1', body: 'HELLO', imageUrls: ['/api/upload/a.jpg'],
    })
  })

  it('soft-deletes own comments and returns 403 for another author', async () => {
    expect((await DELETE(req({ id: 'c1' }), params)).status).toBe(200)
    expect(softDeleteTaskComment).toHaveBeenCalledWith({
      taskId: 't1', commentId: 'c1', viewerStaffId: 's1', canDeleteAny: false,
    })

    softDeleteTaskComment.mockResolvedValue('forbidden')
    expect((await DELETE(req({ id: 'c1' }), params)).status).toBe(403)
    softDeleteTaskComment.mockResolvedValue('not_found')
    expect((await DELETE(req({ id: 'c1' }), params)).status).toBe(404)
  })
})
