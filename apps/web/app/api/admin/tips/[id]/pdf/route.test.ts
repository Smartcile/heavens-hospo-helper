import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  prisma,
  getServerSession,
  guardAccess,
  getManagerVenueId,
  buildTipsPeriodPayload,
  generateTipsPdf,
  tipsPdfToBuffer,
} = vi.hoisted(() => ({
  prisma: { tipsPeriod: { findFirst: vi.fn() } },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  getManagerVenueId: vi.fn(),
  buildTipsPeriodPayload: vi.fn(),
  generateTipsPdf: vi.fn(),
  tipsPdfToBuffer: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/venue-scope', () => ({ getManagerVenueId }))
vi.mock('@/lib/tips.server', () => ({ buildTipsPeriodPayload }))
vi.mock('@/lib/tips-pdf', () => ({ generateTipsPdf, tipsPdfToBuffer }))

import { GET } from './route'

const req = (url = 'http://localhost/api/admin/tips/p1/pdf') =>
  ({ nextUrl: new URL(url) } as unknown as NextRequest)
const params = { params: { id: 'p1' } }

const payload = {
  poolTotal: 100,
  shares: [
    {
      id: 'r1',
      staffId: 's1',
      name: 'ZOE BAR',
      departmentName: 'BAR',
      hours: 2,
      shareWeight: 1,
      amount: 50,
      status: 'PLANNED',
      approvalNote: null,
      issueNote: null,
    },
    {
      id: 'r2',
      staffId: 's2',
      name: 'ALEX CHEN',
      departmentName: 'KITCHEN',
      hours: 1,
      shareWeight: 1,
      amount: 50,
      status: 'PLANNED',
      approvalNote: null,
      issueNote: null,
    },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1' } })
  guardAccess.mockResolvedValue(null)
  getManagerVenueId.mockReturnValue(null)
  prisma.tipsPeriod.findFirst.mockResolvedValue({
    id: 'p1',
    venueId: 'v1',
    label: 'FEBRUARY "2026"',
    fromDate: new Date('2026-02-01T00:00:00.000Z'),
    toDate: new Date('2026-02-28T00:00:00.000Z'),
    cashCounts: {},
    posTotal: 0,
    notes: null,
    fullyIssuedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    venue: { name: 'Demo Venue' },
    shares: [],
  })
  buildTipsPeriodPayload.mockReturnValue(payload)
  generateTipsPdf.mockReturnValue({})
  tipsPdfToBuffer.mockReturnValue(new ArrayBuffer(8))
})

describe('GET /api/admin/tips/[id]/pdf', () => {
  it('sanitises the period label in Content-Disposition', async () => {
    const res = await GET(req(), params)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="Tips - FEBRUARY 2026.pdf"',
    )
  })

  it('uses inline when requested', async () => {
    const res = await GET(req('http://localhost/api/admin/tips/p1/pdf?inline=1'), params)
    expect(res.headers.get('Content-Disposition')).toMatch(/^inline;/)
  })
})

describe('GET /api/admin/tips/[id]/pdf ordering', () => {
  it('reorders the rendered rows to match the on-screen sort', async () => {
    await GET(req('http://localhost/api/admin/tips/p1/pdf?sort=name&dir=asc'), params)

    const rendered = generateTipsPdf.mock.calls[0][0]
    expect(rendered.shares.map((s: { name: string }) => s.name)).toEqual(['ALEX CHEN', 'ZOE BAR'])
    expect(rendered.shares[0].department).toBe('KITCHEN')
  })

  it('keeps the saved order when no sort is supplied', async () => {
    await GET(req(), params)
    const rendered = generateTipsPdf.mock.calls[0][0]
    expect(rendered.shares.map((s: { name: string }) => s.name)).toEqual(['ZOE BAR', 'ALEX CHEN'])
  })

  it('ignores an unknown sort value and keeps the saved order', async () => {
    await GET(req('http://localhost/api/admin/tips/p1/pdf?sort=bogus&dir=desc'), params)
    const rendered = generateTipsPdf.mock.calls[0][0]
    expect(rendered.shares.map((s: { name: string }) => s.name)).toEqual(['ZOE BAR', 'ALEX CHEN'])
  })

  it('sorts by department with manual people last', async () => {
    buildTipsPeriodPayload.mockReturnValue({
      ...payload,
      shares: [
        { ...payload.shares[0], id: 'r0', name: 'MANUAL', departmentName: null },
        payload.shares[0],
        payload.shares[1],
      ],
    })
    await GET(req('http://localhost/api/admin/tips/p1/pdf?sort=department&dir=asc'), params)
    const rendered = generateTipsPdf.mock.calls[0][0]
    expect(rendered.shares.map((s: { name: string }) => s.name)).toEqual(['ZOE BAR', 'ALEX CHEN', 'MANUAL'])
  })
})
