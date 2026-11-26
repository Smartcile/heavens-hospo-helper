import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prisma, getWorkerSession } = vi.hoisted(() => ({
  prisma: {
    tipsPeriod: { findMany: vi.fn() },
    tipsShareNote: { findMany: vi.fn() },
  },
  getWorkerSession: vi.fn(),
}))

vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))

import { NextRequest } from 'next/server'
import { GET } from './route'

const req = (url = 'http://localhost/api/worker/tips') => ({ nextUrl: new URL(url) } as NextRequest)

const period = () => ({
  id: 'p1',
  venueId: 'v1',
  label: 'FEB',
  fromDate: new Date('2026-02-01T00:00:00.000Z'),
  toDate: new Date('2026-02-28T00:00:00.000Z'),
  cashCounts: {},
  posTotal: 100,
  notes: null,
  fullyIssuedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  shares: [
    {
      id: 'r1',
      staffId: 's1',
      name: 'ALEX CHEN',
      hours: 5,
      shareWeight: 1,
      sortOrder: 0,
      status: 'APPROVED',
      approvalNote: null,
      issueNote: null,
      approvedAt: null,
      issuedAt: null,
      deletedAt: null,
    },
  ],
})

beforeEach(() => {
  vi.clearAllMocks()
  getWorkerSession.mockResolvedValue({ staffId: 's1', venueId: 'v1', role: 'MANAGER' })
  prisma.tipsPeriod.findMany.mockResolvedValue([period()])
})

describe('GET /api/worker/tips', () => {
  it('refuses floor staff', async () => {
    getWorkerSession.mockResolvedValue({ staffId: 's1', venueId: 'v1', role: 'STAFF' })
    const res = await GET(req())
    expect(res.status).toBe(403)
    expect(prisma.tipsPeriod.findMany).not.toHaveBeenCalled()
  })

  it('returns only the signed-in venue with derived amounts', async () => {
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.periods[0].shares[0]).toMatchObject({ name: 'ALEX CHEN', amount: 100, status: 'APPROVED' })
    expect(prisma.tipsPeriod.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ venueId: 'v1' }) }),
    )
  })

  it('?status=1 is status-only for the dashboard tile', async () => {
    const res = await GET(req('http://localhost/api/worker/tips?status=1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.periods[0].progress).toMatchObject({ total: 1, approved: 1 })
    expect(body.periods[0].shares).toBeUndefined()
    const text = JSON.stringify(body)
    expect(text).not.toContain('amount')
    expect(text).not.toContain('poolTotal')
    expect(text).not.toContain('posTotal')
  })

  it('omits notes by default and attaches the thread only with ?notes=1', async () => {
    const plain = await (await GET(req())).json()
    expect(plain.periods[0].shares[0].notes).toBeUndefined()
    expect(prisma.tipsShareNote.findMany).not.toHaveBeenCalled()

    prisma.tipsShareNote.findMany.mockResolvedValue([
      {
        id: 'n1',
        body: 'CHECKED IN CASH',
        source: 'MANAGER',
        createdAt: new Date('2026-11-12T03:00:00.000Z'),
        tipsShareId: 'r1',
      },
    ])

    const body = await (await GET(req('http://localhost/api/worker/tips?notes=1'))).json()
    expect(prisma.tipsShareNote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tipsShareId: { in: ['r1'] }, deletedAt: null }),
      }),
    )
    expect(body.periods[0].shares[0].notes[0]).toMatchObject({
      id: 'n1',
      body: 'CHECKED IN CASH',
      createdAt: '2026-11-12T03:00:00.000Z',
    })
  })
})
