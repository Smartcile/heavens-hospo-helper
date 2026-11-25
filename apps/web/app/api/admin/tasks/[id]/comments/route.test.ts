import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const {
  prisma,
  getServerSession,
  guardAccess,
  canAccess,
  loadAdminThreadTask,
  listTaskComments,
  addTaskComment,
  softDeleteTaskComment,
} = vi.hoisted(() => ({
  prisma: { taskCompletion: { create: vi.fn() } },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  canAccess: vi.fn(),
  loadAdminThreadTask: vi.fn(),
  listTaskComments: vi.fn(),
  addTaskComment: vi.fn(),
  softDeleteTaskComment: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess, canAccess }))
vi.mock('@/lib/task-comments.server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/task-comments.server')>()
  return {
    ...actual,
    loadAdminThreadTask,
    listTaskComments,
    addTaskComment,
    softDeleteTaskComment,
  }
})

import { GET, POST, DELETE } from './route'

const req = (body: unknown = {}) =>
  ({
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
    nextUrl: new URL('http://localhost/api/admin/tasks/t1/comments'),
  }) as never

const params = { params: { id: 't1' } }
const SESSION = { user: { id: 'a1', role: 'ADMIN', venueId: 'v1', availableVenueIds: ['v1'] } }
const TASK = {
  id: 't1', venueId: 'v1', title: 'RESEARCH', departmentId: 'd1',
  assignedToStaffId: null, isThread: true, threadClosedAt: null, threadClosedById: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue(SESSION)
  guardAccess.mockResolvedValue(null)
  canAccess.mockResolvedValue(false)
  loadAdminThreadTask.mockResolvedValue(TASK)
  listTaskComments.mockResolvedValue([])
  addTaskComment.mockResolvedValue({ id: 'c1', body: 'HELLO', imageUrls: [], authorId: 'a1', authorName: 'ADMIN', createdAt: new Date().toISOString(), canDelete: true })
  softDeleteTaskComment.mockResolvedValue('ok')
})

describe('/api/admin/tasks/[id]/comments', () => {
  it('requires a session and the view grant', async () => {
    getServerSession.mockResolvedValueOnce(null)
    expect((await GET(req(), params)).status).toBe(401)

    guardAccess.mockResolvedValueOnce(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
    expect((await GET(req(), params)).status).toBe(403)
  })

  it('returns 404 for a task outside the manager venue', async () => {
    loadAdminThreadTask.mockResolvedValue(null)
    const res = await GET(req(), params)
    expect(res.status).toBe(404)
  })

  it('returns comments and sign-off flags', async () => {
    listTaskComments.mockResolvedValue([{ id: 'c1' }])
    const res = await GET(req(), params)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.comments).toHaveLength(1)
    expect(body.canAdd).toBe(true)
    expect(body.canSignOff).toBe(true)
    expect(guardAccess).toHaveBeenCalledWith(SESSION, expect.anything(), 'execution.tasks.view')
  })

  it('rejects an empty body', async () => {
    const res = await POST(req({ body: '   ' }), params)
    expect(res.status).toBe(400)
    expect(addTaskComment).not.toHaveBeenCalled()
  })

  it('rejects a non-thread task and a closed thread', async () => {
    loadAdminThreadTask.mockResolvedValue({ ...TASK, isThread: false })
    expect((await POST(req({ body: 'HI' }), params)).status).toBe(409)

    loadAdminThreadTask.mockResolvedValue({ ...TASK, threadClosedAt: new Date() })
    expect((await POST(req({ body: 'HI' }), params)).status).toBe(409)
  })

  it('posts a comment WITHOUT requiring execution.tasks.edit', async () => {
    const res = await POST(req({ body: '  HELLO  ', imageUrls: ['/api/upload/a.jpg'] }), params)

    expect(res.status).toBe(201)
    expect(addTaskComment).toHaveBeenCalledWith({
      taskId: 't1', staffId: 'a1', body: 'HELLO', imageUrls: ['/api/upload/a.jpg'],
    })
    expect(guardAccess).toHaveBeenCalledWith(SESSION, expect.anything(), 'execution.tasks.view')
    expect(guardAccess).not.toHaveBeenCalledWith(SESSION, expect.anything(), 'execution.tasks.edit')
  })

  it('soft-deletes a comment (404 / 403 passthrough)', async () => {
    expect((await DELETE(req({ id: 'c1' }), params)).status).toBe(200)
    expect(softDeleteTaskComment).toHaveBeenCalledWith({
      taskId: 't1', commentId: 'c1', viewerStaffId: 'a1', canDeleteAny: true,
    })

    softDeleteTaskComment.mockResolvedValue('not_found')
    expect((await DELETE(req({ id: 'c1' }), params)).status).toBe(404)
    softDeleteTaskComment.mockResolvedValue('forbidden')
    expect((await DELETE(req({ id: 'c1' }), params)).status).toBe(403)
  })
})
