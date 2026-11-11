import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getWorkerSession,
  workerMayViewAllTraining,
  workerMayAssignTraining,
  guideWarningsForVenue,
  prisma,
} = vi.hoisted(() => ({
  getWorkerSession: vi.fn(),
  workerMayViewAllTraining: vi.fn(),
  workerMayAssignTraining: vi.fn(),
  guideWarningsForVenue: vi.fn(),
  prisma: {
    staff: { findMany: vi.fn() },
    guide: { findMany: vi.fn() },
    guideFolder: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))
vi.mock('@/lib/worker-guide-access', () => ({
  workerMayViewAllTraining,
  workerMayAssignTraining,
}))
vi.mock('@/lib/guide-warnings.server', () => ({ guideWarningsForVenue }))
vi.mock('@hospo-ops/db', () => ({ prisma }))

import { GET } from './route'

const payload = {
  venueName: 'MAIN',
  date: '2026-11-12',
  warnings: [],
  folders: [],
  staff: [{ id: 's1', name: 'SMITH, JANE' }],
  guides: [],
  summary: { total: 0, critical: 0, warning: 0 },
}

beforeEach(() => {
  vi.clearAllMocks()
  getWorkerSession.mockResolvedValue({ staffId: 's1', venueId: 'v1', firstName: 'JANE', role: 'STAFF' })
  workerMayViewAllTraining.mockResolvedValue(false)
  workerMayAssignTraining.mockResolvedValue(false)
  guideWarningsForVenue.mockResolvedValue(payload)
  prisma.staff.findMany.mockResolvedValue([
    { id: 's1', firstName: 'JANE', lastName: 'SMITH' },
    { id: 's2', firstName: 'ANN', lastName: 'LEE' },
  ])
  prisma.guide.findMany.mockResolvedValue([{ id: 'g1', title: 'COFFEE', folderId: 'f1' }])
  prisma.guideFolder.findMany.mockResolvedValue([{ id: 'f1', name: 'BAR', sortOrder: 0 }])
})

describe('GET /api/worker/guide-warnings', () => {
  it('requires a worker session', async () => {
    getWorkerSession.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('narrows an ordinary worker to their own warnings', async () => {
    const res = await GET()
    expect(guideWarningsForVenue).toHaveBeenCalledWith('v1', { staffId: 's1' })
    expect(await res.json()).toMatchObject({ canViewAll: false, canAssign: false })
    expect(prisma.staff.findMany).not.toHaveBeenCalled()
  })

  it('gives a manager the whole venue plus picker options', async () => {
    workerMayViewAllTraining.mockResolvedValue(true)
    workerMayAssignTraining.mockResolvedValue(true)
    const res = await GET()
    expect(guideWarningsForVenue).toHaveBeenCalledWith('v1', {})
    const body = await res.json()
    expect(body).toMatchObject({
      canViewAll: true,
      canAssign: true,
      retrainOptions: {
        staff: [
          { id: 's1', name: 'SMITH, JANE' },
          { id: 's2', name: 'LEE, ANN' },
        ],
        guides: [{ id: 'g1', title: 'COFFEE', folderId: 'f1' }],
      },
    })
  })
})
