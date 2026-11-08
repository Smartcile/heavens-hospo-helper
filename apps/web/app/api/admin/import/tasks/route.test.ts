import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess } = vi.hoisted(() => ({
  prisma: {
    department: { findMany: vi.fn() },
    section: { findMany: vi.fn() },
    checklist: { findMany: vi.fn() },
    task: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    checklistTask: { findFirst: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn(),
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))

import { GET, POST } from './route'

const getReq = (url = 'http://localhost/api/admin/import/tasks') =>
  ({ nextUrl: new URL(url) } as unknown as NextRequest)
const postReq = (body: unknown) => ({ json: async () => body } as unknown as NextRequest)

function row(overrides: Record<string, unknown> = {}) {
  return {
    action: 'CREATE',
    values: {
      title: 'WIPE BENCHES',
      descriptionHtml: '<p>Wipe</p>',
      departmentName: 'KITCHEN',
      sectionName: 'PREP',
      checklistName: 'OPENING',
      completionType: 'TICK',
      scheduleType: 'DAILY',
      scheduleDays: [],
      monthlyOption: null,
      monthlyDay: null,
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1' } })
  guardAccess.mockResolvedValue(null)
  prisma.department.findMany.mockResolvedValue([{ id: 'd1', name: 'KITCHEN' }])
  prisma.section.findMany.mockResolvedValue([{ id: 's1', name: 'PREP', departmentId: 'd1' }])
  prisma.checklist.findMany.mockResolvedValue([{ id: 'c1', name: 'OPENING' }])
  prisma.task.findMany.mockResolvedValue([{ id: 't9', title: 'SWEEP FLOOR' }])
  prisma.task.findFirst.mockImplementation(async (args: { where?: { id?: string; title?: string } }) => {
    if (args.where?.id) return { id: args.where.id }
    if (args.where?.title) return null
    return { sortOrder: 2 }
  })
  prisma.task.create.mockResolvedValue({ id: 'new1' })
  prisma.task.update.mockResolvedValue({ id: 't1' })
  prisma.checklistTask.findFirst.mockResolvedValue({ sortOrder: 4 })
  prisma.checklistTask.upsert.mockResolvedValue({})
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma))
})

describe('GET /api/admin/import/tasks', () => {
  it('returns venue-scoped refs and existing tasks', async () => {
    const res = await GET(getReq())
    const body = await res.json()
    expect(prisma.department.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ venueId: 'v1' }) }))
    expect(body.departments).toEqual([{ id: 'd1', name: 'KITCHEN' }])
    expect(body.sections[0]).toEqual({ id: 's1', name: 'PREP', departmentId: 'd1' })
    expect(body.tasks).toEqual([{ id: 't9', name: 'SWEEP FLOOR' }])
  })

  it('locks a MANAGER to their own venue', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'MANAGER', venueId: 'vm' } })
    await GET(getReq('http://localhost/api/admin/import/tasks?venueId=other'))
    expect(prisma.department.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ venueId: 'vm' }) }))
  })
})

describe('POST /api/admin/import/tasks', () => {
  it('creates a DRAFT task with resolved refs and a checklist link', async () => {
    const res = await POST(postReq({ rows: [row()] }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.created).toBe(1)
    const data = prisma.task.create.mock.calls[0][0].data
    expect(data).toMatchObject({
      venueId: 'v1',
      title: 'WIPE BENCHES',
      status: 'DRAFT',
      isActive: true,
      departmentId: 'd1',
      sectionId: 's1',
      completionType: 'TICK',
      scheduleType: 'DAILY',
      sortOrder: 3,
      sections: { create: [{ sectionId: 's1' }] },
    })
    expect(prisma.checklistTask.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ checklistId: 'c1', taskId: 'new1', sortOrder: 5 }),
    }))
  })

  it('skips a row whose department is unknown', async () => {
    const bad = row({ values: { ...row().values, departmentName: 'NOWHERE' } })
    const res = await POST(postReq({ rows: [bad] }))
    const body = await res.json()
    expect(body.created).toBe(0)
    expect(body.skipped).toBe(1)
    expect(prisma.task.create).not.toHaveBeenCalled()
  })

  it('skips a weekly task with no days', async () => {
    const bad = row({ values: { ...row().values, scheduleType: 'WEEKLY', scheduleDays: [] } })
    const res = await POST(postReq({ rows: [bad] }))
    const body = await res.json()
    expect(body.skipped).toBe(1)
    expect(prisma.task.create).not.toHaveBeenCalled()
  })

  it('updates a task without forcing it back to DRAFT', async () => {
    const res = await POST(postReq({ rows: [row({ action: 'UPDATE', targetId: 't1' })] }))
    const body = await res.json()
    expect(body.updated).toBe(1)
    const data = prisma.task.update.mock.calls[0][0].data
    expect(data.status).toBeUndefined()
    expect(prisma.task.create).not.toHaveBeenCalled()
  })

  it('requires edit permission for an UPDATE row', async () => {
    guardAccess.mockImplementation(async (_s: unknown, _r: unknown, key: string) =>
      key === 'execution.tasks.edit' ? { status: 403 } : null)
    const res = await POST(postReq({ rows: [row({ action: 'UPDATE', targetId: 't1' })] }))
    expect(res.status).toBe(403)
    expect(prisma.task.update).not.toHaveBeenCalled()
  })

  it('locks a MANAGER import to their own venue', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'MANAGER', venueId: 'vm' } })
    await POST(postReq({ venueId: 'other', rows: [row()] }))
    expect(prisma.department.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ venueId: 'vm' }) }))
    expect(prisma.task.create.mock.calls[0][0].data.venueId).toBe('vm')
  })

  it('rejects an empty payload', async () => {
    const res = await POST(postReq({ rows: [] }))
    expect(res.status).toBe(400)
  })
})
