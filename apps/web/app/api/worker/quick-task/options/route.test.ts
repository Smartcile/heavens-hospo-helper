import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prisma, getWorkerSession } = vi.hoisted(() => ({
  prisma: {
    department: { findMany: vi.fn() },
    section: { findMany: vi.fn() },
    staff: { findMany: vi.fn() },
  },
  getWorkerSession: vi.fn(),
}))

vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))

import { GET } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  getWorkerSession.mockResolvedValue({ staffId: 's1', venueId: 'v1', departmentId: 'd1', firstName: 'ANN' })
  prisma.department.findMany.mockResolvedValue([{ id: 'd1', name: 'KITCHEN' }])
  prisma.section.findMany.mockResolvedValue([{ id: 'sec1', name: 'BAR', departmentId: 'd1' }])
  prisma.staff.findMany.mockResolvedValue([{ id: 's2', firstName: 'SAM', lastName: 'LEE' }])
})

describe('GET /api/worker/quick-task/options', () => {
  it('requires a worker session', async () => {
    getWorkerSession.mockResolvedValue(null)

    const res = await GET()

    expect(res.status).toBe(401)
    expect(prisma.department.findMany).not.toHaveBeenCalled()
  })

  it('returns only own-venue departments, sections and assignees', async () => {
    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.departments).toEqual([{ id: 'd1', name: 'KITCHEN' }])
    expect(body.sections).toEqual([{ id: 'sec1', name: 'BAR', departmentId: 'd1' }])
    expect(body.assignees).toEqual([{ id: 's2', name: 'SAM LEE' }])

    expect(prisma.department.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { venueId: 'v1', deletedAt: null } }),
    )
    expect(prisma.section.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { venueId: 'v1', deletedAt: null } }),
    )
    expect(prisma.staff.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { venueId: 'v1', deletedAt: null, isActive: true } }),
    )
  })
})
