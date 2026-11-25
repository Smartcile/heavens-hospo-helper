import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from 'next-auth'
import type { WorkerSession } from '@hospo-ops/types'

const { prisma } = vi.hoisted(() => ({
  prisma: {
    task: { findFirst: vi.fn(), update: vi.fn() },
    departmentLink: { findMany: vi.fn() },
    taskComment: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('@hospo-ops/db', () => ({ prisma }))

import {
  addTaskComment,
  adminCanSignOff,
  listTaskComments,
  loadAdminThreadTask,
  loadWorkerThreadTask,
  normaliseImageUrls,
  setThreadClosed,
  softDeleteTaskComment,
  validateTaskCommentInput,
  workerCanSignOff,
} from '@/lib/task-comments.server'

const workerSession = {
  staffId: 's1', venueId: 'v1', departmentId: 'd1', firstName: 'ANN',
} as unknown as WorkerSession

const adminSession = {
  user: { id: 'a1', role: 'ADMIN', venueId: 'v1', availableVenueIds: ['v1', 'v2'] },
} as unknown as Session

const managerSession = {
  user: { id: 'm1', role: 'MANAGER', venueId: 'v1', availableVenueIds: ['v1'] },
} as unknown as Session

const task = {
  id: 't1', venueId: 'v1', title: 'RESEARCH', departmentId: 'd1',
  assignedToStaffId: null, isThread: true, threadClosedAt: null, threadClosedById: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  prisma.departmentLink.findMany.mockResolvedValue([{ toDepartmentId: 'd2' }])
  prisma.task.findFirst.mockResolvedValue(task)
  prisma.taskComment.findMany.mockResolvedValue([])
  prisma.taskComment.findFirst.mockResolvedValue({ id: 'c1', staffId: 's1' })
  prisma.taskComment.update.mockResolvedValue({})
  prisma.taskComment.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'c9', ...data, createdAt: new Date('2026-11-25T10:00:00.000Z'),
    staff: { firstName: 'ANN', lastName: 'B' },
  }))
  prisma.task.update.mockResolvedValue({ isThread: true, threadClosedAt: new Date(), threadClosedById: 'a1' })
})

describe('normaliseImageUrls', () => {
  it('keeps upload/remote URLs, drops junk, dedupes and caps', () => {
    expect(normaliseImageUrls([
      '/api/upload/a.jpg', '/api/upload/a.jpg', 'javascript:alert(1)', 'https://x.test/b.png', '  /api/upload/c.png  ',
    ])).toEqual(['/api/upload/a.jpg', 'https://x.test/b.png', '/api/upload/c.png'])
    expect(normaliseImageUrls('nope')).toEqual([])
  })

  it('caps the list at ten images', () => {
    const many = Array.from({ length: 15 }, (_, i) => `/api/upload/${i}.jpg`)
    expect(normaliseImageUrls(many)).toHaveLength(10)
  })
})

describe('validateTaskCommentInput', () => {
  it('rejects an empty or whitespace-only body', () => {
    expect(validateTaskCommentInput({ body: '   ' })).toEqual({ ok: false, error: 'COMMENT CANNOT BE EMPTY' })
    expect(validateTaskCommentInput({ body: 42 })).toEqual({ ok: false, error: 'COMMENT CANNOT BE EMPTY' })
  })

  it('rejects a body over 500 characters', () => {
    const result = validateTaskCommentInput({ body: 'x'.repeat(501) })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('500')
  })

  it('trims a valid body and filters images', () => {
    expect(validateTaskCommentInput({
      body: '  HELLO  ', imageUrls: ['/api/upload/a.jpg', 'bad'],
    })).toEqual({ ok: true, body: 'HELLO', imageUrls: ['/api/upload/a.jpg'] })
  })
})

describe('loadWorkerThreadTask', () => {
  it('returns an assigned task in the worker venue', async () => {
    prisma.task.findFirst.mockResolvedValue({ ...task, assignedToStaffId: 's1' })
    await expect(loadWorkerThreadTask(workerSession, 't1')).resolves.toMatchObject({ id: 't1' })
  })

  it('returns a task in the worker department or a linked department', async () => {
    await expect(loadWorkerThreadTask(workerSession, 't1')).resolves.toMatchObject({ id: 't1' })
    prisma.task.findFirst.mockResolvedValue({ ...task, departmentId: 'd2' })
    await expect(loadWorkerThreadTask(workerSession, 't1')).resolves.toMatchObject({ id: 't1' })
  })

  it('returns null for another venue or an unrelated department', async () => {
    prisma.task.findFirst.mockResolvedValue({ ...task, venueId: 'v2' })
    await expect(loadWorkerThreadTask(workerSession, 't1')).resolves.toBeNull()

    prisma.task.findFirst.mockResolvedValue({ ...task, departmentId: 'other' })
    await expect(loadWorkerThreadTask(workerSession, 't1')).resolves.toBeNull()
  })

  it('shows the whole venue when the worker has no department', async () => {
    prisma.task.findFirst.mockResolvedValue({ ...task, departmentId: 'other' })
    const noDept = { ...workerSession, departmentId: null } as unknown as WorkerSession
    await expect(loadWorkerThreadTask(noDept, 't1')).resolves.toMatchObject({ id: 't1' })
  })
})

describe('loadAdminThreadTask', () => {
  it('ADMIN can load any existing task', async () => {
    await expect(loadAdminThreadTask(adminSession, 't1')).resolves.toMatchObject({ id: 't1' })
  })

  it('MANAGER is limited to accessible venues', async () => {
    await expect(loadAdminThreadTask(managerSession, 't1')).resolves.toMatchObject({ id: 't1' })
    prisma.task.findFirst.mockResolvedValue({ ...task, venueId: 'v9' })
    await expect(loadAdminThreadTask(managerSession, 't1')).resolves.toBeNull()
  })

  it('returns null when the task is missing', async () => {
    prisma.task.findFirst.mockResolvedValue(null)
    await expect(loadAdminThreadTask(adminSession, 't1')).resolves.toBeNull()
  })
})

describe('listTaskComments', () => {
  it('returns oldest-first rows with author names and delete rules', async () => {
    prisma.taskComment.findMany.mockResolvedValue([
      { id: 'c1', body: 'ONE', imageUrls: ['/api/upload/a.jpg'], staffId: 's1', createdAt: new Date('2026-11-25T09:00:00Z'), staff: { firstName: 'ANN', lastName: 'B' } },
      { id: 'c2', body: 'TWO', imageUrls: [], staffId: 's2', createdAt: new Date('2026-11-25T10:00:00Z'), staff: { firstName: 'SAM', lastName: 'LEE' } },
    ])

    const rows = await listTaskComments('t1', { viewerStaffId: 's1', canDeleteAny: false })

    expect(prisma.taskComment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { taskId: 't1', deletedAt: null },
      orderBy: [{ createdAt: 'asc' }],
    }))
    expect(rows.map((r) => r.body)).toEqual(['ONE', 'TWO'])
    expect(rows[0].canDelete).toBe(true)
    expect(rows[1].canDelete).toBe(false)
    expect(rows[1].authorName).toBe('SAM LEE')
  })

  it('lets a manager delete any comment', async () => {
    prisma.taskComment.findMany.mockResolvedValue([
      { id: 'c2', body: 'TWO', imageUrls: [], staffId: 's2', createdAt: new Date(), staff: { firstName: 'SAM', lastName: 'LEE' } },
    ])
    const rows = await listTaskComments('t1', { viewerStaffId: 's1', canDeleteAny: true })
    expect(rows[0].canDelete).toBe(true)
  })
})

describe('addTaskComment', () => {
  it('stores the body and image URLs', async () => {
    const created = await addTaskComment({ taskId: 't1', staffId: 's1', body: 'HELLO', imageUrls: ['/api/upload/a.jpg'] })
    expect(prisma.taskComment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { taskId: 't1', staffId: 's1', body: 'HELLO', imageUrls: ['/api/upload/a.jpg'] },
    }))
    expect(created.body).toBe('HELLO')
  })
})

describe('softDeleteTaskComment', () => {
  it('returns not_found for a missing or already-deleted comment', async () => {
    prisma.taskComment.findFirst.mockResolvedValue(null)
    await expect(softDeleteTaskComment({ taskId: 't1', commentId: 'c1', viewerStaffId: 's1', canDeleteAny: false }))
      .resolves.toBe('not_found')
  })

  it('forbids deleting someone else\u2019s comment without the any-delete right', async () => {
    prisma.taskComment.findFirst.mockResolvedValue({ id: 'c1', staffId: 's2' })
    await expect(softDeleteTaskComment({ taskId: 't1', commentId: 'c1', viewerStaffId: 's1', canDeleteAny: false }))
      .resolves.toBe('forbidden')
    expect(prisma.taskComment.update).not.toHaveBeenCalled()
  })

  it('soft-deletes (never hard-deletes), own or any', async () => {
    await expect(softDeleteTaskComment({ taskId: 't1', commentId: 'c1', viewerStaffId: 's1', canDeleteAny: false }))
      .resolves.toBe('ok')
    expect(prisma.taskComment.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { deletedAt: expect.any(Date) },
    })
  })
})

describe('setThreadClosed', () => {
  it('stamps the sign-off and clears it on reopen', async () => {
    await setThreadClosed({ taskId: 't1', closed: true, staffId: 'a1' })
    expect(prisma.task.update).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: 't1' },
      data: { threadClosedAt: expect.any(Date), threadClosedById: 'a1' },
    }))
    await setThreadClosed({ taskId: 't1', closed: false, staffId: 'a1' })
    expect(prisma.task.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: { threadClosedAt: null, threadClosedById: null },
    }))
  })
})

describe('sign-off permission', () => {
  it('worker: assignee, ADMIN/MANAGER or the edit grant', () => {
    expect(workerCanSignOff(workerSession, { assignedToStaffId: 's1' }, false)).toBe(true)
    expect(workerCanSignOff(workerSession, { assignedToStaffId: 's2' }, false)).toBe(false)
    expect(workerCanSignOff(workerSession, { assignedToStaffId: 's2' }, true)).toBe(true)
    expect(workerCanSignOff({ ...workerSession, role: 'MANAGER' } as unknown as WorkerSession, { assignedToStaffId: 's2' }, false)).toBe(true)
  })

  it('admin: ADMIN/MANAGER or the edit grant', () => {
    expect(adminCanSignOff(adminSession, false)).toBe(true)
    expect(adminCanSignOff(managerSession, false)).toBe(true)
    expect(adminCanSignOff({ user: { role: 'STAFF' } } as unknown as Session, false)).toBe(false)
    expect(adminCanSignOff({ user: { role: 'STAFF' } } as unknown as Session, true)).toBe(true)
  })
})
