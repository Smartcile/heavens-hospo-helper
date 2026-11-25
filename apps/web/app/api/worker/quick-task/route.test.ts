import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prisma, getWorkerSession, validateWorkerTaskRefs } = vi.hoisted(() => ({
  prisma: {
    task: { create: vi.fn() },
    staff: { count: vi.fn() },
    section: { findUnique: vi.fn() },
    checklist: { findFirst: vi.fn() },
    checklistTask: { findFirst: vi.fn(), create: vi.fn() },
  },
  getWorkerSession: vi.fn(),
  validateWorkerTaskRefs: vi.fn(),
}))

vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))
vi.mock('@/lib/worker-task-refs.server', () => ({ validateWorkerTaskRefs }))

import { POST } from './route'

const req = (body: unknown = {}) =>
  ({ json: async () => body }) as unknown as Request

beforeEach(() => {
  vi.clearAllMocks()
  getWorkerSession.mockResolvedValue({
    staffId: 's1', venueId: 'v1', departmentId: 'd1', firstName: 'ANN',
  })
  validateWorkerTaskRefs.mockResolvedValue(null)
  prisma.staff.count.mockResolvedValue(1)
  prisma.section.findUnique.mockResolvedValue({ departmentId: 'sec-dept' })
  prisma.task.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 't1', ...data }))
  prisma.checklist.findFirst.mockResolvedValue(null)
  prisma.checklistTask.findFirst.mockResolvedValue(null)
  prisma.checklistTask.create.mockResolvedValue({})
})

describe('POST /api/worker/quick-task', () => {
  it('rejects a department or section outside the venue', async () => {
    validateWorkerTaskRefs.mockResolvedValue('SECTION IS NOT IN THIS VENUE')

    const res = await POST(req({ title: 'MOP', sectionId: 'other' }))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'SECTION IS NOT IN THIS VENUE' })
    expect(prisma.task.create).not.toHaveBeenCalled()
  })

  it('rejects an assignee outside the venue', async () => {
    prisma.staff.count.mockResolvedValue(0)

    const res = await POST(req({ title: 'MOP', assignedToStaffId: 'other' }))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'ASSIGNEE IS NOT IN THIS VENUE' })
    expect(prisma.task.create).not.toHaveBeenCalled()
  })

  it('rejects an invalid due date', async () => {
    const res = await POST(req({ title: 'MOP', dueDate: '2026-02-31' }))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'INVALID DUE DATE' })
    expect(prisma.task.create).not.toHaveBeenCalled()
  })

  it('creates a one-off task with the assignee, department and section', async () => {
    const res = await POST(req({
      title: 'research high chairs',
      departmentId: 'd2',
      sectionId: 'sec2',
      assignedToStaffId: 's2',
      dueDate: '2026-11-25',
      rolloverEnabled: true,
    }))

    expect(res.status).toBe(201)
    const data = prisma.task.create.mock.calls[0][0].data
    expect(data).toMatchObject({
      title: 'RESEARCH HIGH CHAIRS',
      venueId: 'v1',
      // A section always implies its department, overriding the posted one.
      departmentId: 'sec-dept',
      sectionId: 'sec2',
      assignedToStaffId: 's2',
      isOneOff: true,
      rolloverEnabled: true,
    })
    expect((data.dueDate as Date).toISOString()).toBe('2026-11-25T00:00:00.000Z')
  })

  it('derives the department from the section when both are supplied', async () => {
    prisma.section.findUnique.mockResolvedValue({ departmentId: 'section-dept' })

    const res = await POST(req({
      title: 'MOP',
      departmentId: 'wrong-dept',
      sectionId: 'sec2',
    }))

    expect(res.status).toBe(201)
    expect(prisma.section.findUnique).toHaveBeenCalledWith({
      where: { id: 'sec2' },
      select: { departmentId: true },
    })
    expect(prisma.task.create.mock.calls[0][0].data.departmentId).toBe('section-dept')
  })

  it('auto-adds an UNASSIGNED quick task to SIDE WORK', async () => {
    prisma.checklist.findFirst.mockResolvedValue({ id: 'cl1' })

    const res = await POST(req({ title: 'MOP' }))
    const body = await res.json()

    expect(body.addedToList).toBe(true)
    expect(prisma.checklistTask.create).toHaveBeenCalled()
  })

  it('never auto-adds an ASSIGNED custom task to a shared list', async () => {
    prisma.checklist.findFirst.mockResolvedValue({ id: 'cl1' })

    const res = await POST(req({ title: 'MOP', assignedToStaffId: 's2' }))
    const body = await res.json()

    expect(body.addedToList).toBe(false)
    expect(prisma.checklist.findFirst).not.toHaveBeenCalled()
    expect(prisma.checklistTask.create).not.toHaveBeenCalled()
  })
})
