import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getWorkerSession, workerBreachAccess, prisma } = vi.hoisted(() => ({
  getWorkerSession: vi.fn(),
  workerBreachAccess: vi.fn(),
  prisma: { breachNotice: { findFirst: vi.fn() } },
}))

vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))
vi.mock('@/lib/worker-breach-access', () => ({ workerBreachAccess }))
vi.mock('@hospo-ops/db', () => ({ prisma }))

import { GET } from './route'

const req = new NextRequest('http://localhost/api/worker/breach-notices/n1')

beforeEach(() => {
  vi.clearAllMocks()
  getWorkerSession.mockResolvedValue({ staffId: 's1', venueId: 'v1', role: 'STAFF' })
  workerBreachAccess.mockResolvedValue({ allowed: true, venueWide: false, canReview: false, canSubmitClient: false })
})

describe('GET /api/worker/breach-notices/[id]', () => {
  it('404s another person’s row for floor staff', async () => {
    prisma.breachNotice.findFirst.mockResolvedValue(null)
    const res = await GET(req, { params: { id: 'n1' } })
    expect(res.status).toBe(404)
    expect(prisma.breachNotice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'n1', venueId: 'v1', submittedById: 's1' }),
      }),
    )
  })

  it('lets a manager read any venue row', async () => {
    workerBreachAccess.mockResolvedValue({ allowed: true, venueWide: true, canReview: true, canSubmitClient: true })
    prisma.breachNotice.findFirst.mockResolvedValue({
      id: 'n1',
      numberplate: 'ABC123',
      submittedBy: { firstName: 'Alex', lastName: 'Smith' },
      subjectStaff: null,
      reviewedBy: null,
    })
    const res = await GET(req, { params: { id: 'n1' } })
    expect(res.status).toBe(200)
    expect((await res.json()).submittedByName).toBe('Alex Smith')
    expect(prisma.breachNotice.findFirst.mock.calls[0][0].where.submittedById).toBeUndefined()
  })
})
