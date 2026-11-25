import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  getServerSession,
  resolveScopedVenueId,
  memberFindFirst,
  memberUpdate,
  typeFindFirst,
} = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  resolveScopedVenueId: vi.fn(),
  memberFindFirst: vi.fn(),
  memberUpdate: vi.fn(),
  typeFindFirst: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/venue-scope', () => ({ resolveScopedVenueId }))
vi.mock('@hospo-ops/db', () => ({
  Prisma: {},
  prisma: {
    member: { findFirst: memberFindFirst, update: memberUpdate },
    ftpParkingType: { findFirst: typeFindFirst },
  },
}))

import { PUT } from './route'

const ROW = {
  id: 'm1',
  venueId: 'v1',
  membershipNumber: '12345',
  firstName: 'TEST',
  lastName: 'MEMBER',
  email: null,
  phone: null,
  parkingTypeId: 't1',
  isActive: true,
  isTest: false,
  savePlates: true,
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  parkingType: { id: 't1', name: 'RAYC' },
  plates: [],
}

const VALID = {
  membershipNumber: '12345',
  firstName: 'Test',
  lastName: 'Member',
  parkingTypeId: 't1',
}

function req(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/admin/parking/ftp/test-members/m1', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { role: 'ADMIN' } })
  resolveScopedVenueId.mockReturnValue({ venueId: 'v1' })
  memberFindFirst
    .mockResolvedValueOnce(ROW)
    .mockResolvedValueOnce(null)
  typeFindFirst.mockResolvedValue({ id: 't1' })
  memberUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...ROW,
    ...data,
  }))
})

describe('PUT /api/admin/parking/ftp/test-members/[id]', () => {
  it('persists an explicit savePlates preference', async () => {
    const res = await PUT(req({ ...VALID, savePlates: false }), {
      params: { id: 'm1' },
    })
    expect(res?.status).toBe(200)
    expect(memberUpdate.mock.calls[0][0].data).toMatchObject({ savePlates: false })
  })

  it('leaves savePlates untouched when the caller omits it', async () => {
    const res = await PUT(req(VALID), { params: { id: 'm1' } })
    expect(res?.status).toBe(200)
    expect(memberUpdate.mock.calls[0][0].data).not.toHaveProperty('savePlates')
  })
})
