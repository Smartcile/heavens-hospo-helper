import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  getServerSession,
  resolveScopedVenueId,
  memberFindMany,
  memberFindFirst,
  memberCreate,
  memberUpdate,
  typeFindFirst,
  typeFindMany,
} = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  resolveScopedVenueId: vi.fn(),
  memberFindMany: vi.fn(),
  memberFindFirst: vi.fn(),
  memberCreate: vi.fn(),
  memberUpdate: vi.fn(),
  typeFindFirst: vi.fn(),
  typeFindMany: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/venue-scope', () => ({ resolveScopedVenueId }))
vi.mock('@hospo-ops/db', () => ({
  prisma: {
    member: {
      findMany: memberFindMany,
      findFirst: memberFindFirst,
      create: memberCreate,
      update: memberUpdate,
    },
    ftpParkingType: { findFirst: typeFindFirst, findMany: typeFindMany },
    venue: { findUnique: vi.fn().mockResolvedValue({ timezone: 'Pacific/Auckland' }) },
  },
}))

import { GET, POST } from './route'

function member(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    venueId: 'v1',
    membershipNumber: '12345',
    firstName: 'TEST',
    lastName: 'MEMBER',
    email: 'test@example.com',
    phone: null,
    parkingTypeId: 't1',
    isActive: true,
    isTest: true,
    savePlates: true,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    parkingType: { id: 't1', name: 'RAYC' },
    plates: [],
    ...overrides,
  }
}

function req(body?: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/admin/parking/ftp/test-members', {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}

const VALID = {
  membershipNumber: '12345',
  firstName: 'Test',
  lastName: 'Member',
  email: 'test@example.com',
  parkingTypeId: 't1',
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { role: 'ADMIN' } })
  resolveScopedVenueId.mockReturnValue({ venueId: 'v1' })
  memberFindMany.mockResolvedValue([member()])
  memberFindFirst.mockResolvedValue(null)
  typeFindFirst.mockResolvedValue({ id: 't1', name: 'RAYC' })
  typeFindMany.mockResolvedValue([{ id: 't1', name: 'RAYC', isActive: true }])
  memberCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
    member({ ...data, id: 'created' }),
  )
  memberUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
    member({ ...data, id: 'revived' }),
  )
})

describe('/api/admin/parking/ftp/test-members', () => {
  it('lists test members and parking types', async () => {
    const res = await GET(req())
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.members[0]).toMatchObject({ membershipNumber: '12345' })
    expect(body.types).toEqual([{ id: 't1', name: 'RAYC', isActive: true }])
  })

  it('rejects an invalid membership number', async () => {
    const res = await POST(req({ ...VALID, membershipNumber: '1' }))
    expect(res.status).toBe(422)
  })

  it('rejects an existing active membership number', async () => {
    memberFindFirst.mockResolvedValue(member())
    const res = await POST(req(VALID))
    expect(res.status).toBe(409)
  })

  it('creates a real member by default', async () => {
    const res = await POST(req(VALID))
    expect(res.status).toBe(201)
    const data = memberCreate.mock.calls[0][0].data
    expect(data).toMatchObject({
      venueId: 'v1',
      membershipNumber: '12345',
      firstName: 'TEST',
      lastName: 'MEMBER',
      parkingTypeId: 't1',
      isTest: false,
      isActive: true,
    })
  })

  it('keeps the explicit test flag', async () => {
    const res = await POST(req({ ...VALID, isTest: true }))
    expect(res.status).toBe(201)
    expect(memberCreate.mock.calls[0][0].data).toMatchObject({ isTest: true })
  })

  it('leaves plate saving to the DB default unless supplied', async () => {
    await POST(req(VALID))
    expect(memberCreate.mock.calls[0][0].data).not.toHaveProperty('savePlates')

    memberCreate.mockClear()
    await POST(req({ ...VALID, savePlates: false }))
    expect(memberCreate.mock.calls[0][0].data).toMatchObject({ savePlates: false })
  })

  it('does not re-enable plate saving when reviving a member without the field', async () => {
    memberFindFirst.mockResolvedValue(
      member({ id: 'revived', deletedAt: new Date(), savePlates: false }),
    )
    const res = await POST(req(VALID))
    expect(res.status).toBe(201)
    expect(memberUpdate).toHaveBeenCalled()
    expect(memberUpdate.mock.calls[0][0].data).not.toHaveProperty('savePlates')
  })

  it('applies an explicit savePlates when reviving', async () => {
    memberFindFirst.mockResolvedValue(
      member({ id: 'revived', deletedAt: new Date(), savePlates: false }),
    )
    const res = await POST(req({ ...VALID, savePlates: true }))
    expect(res.status).toBe(201)
    expect(memberUpdate.mock.calls[0][0].data).toMatchObject({ savePlates: true })
  })

  it('returns savePlates in the member view', async () => {
    const res = await GET(req())
    const body = await res.json()
    expect(body.members[0]).toMatchObject({ savePlates: true })
  })
})
