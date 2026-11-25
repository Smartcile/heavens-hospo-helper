import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getServerSession, resolveScopedVenueId, typeFindMany, typeFindFirst, typeCreate, hashAdminPin } =
  vi.hoisted(() => ({
    getServerSession: vi.fn(),
    resolveScopedVenueId: vi.fn(),
    typeFindMany: vi.fn(),
    typeFindFirst: vi.fn(),
    typeCreate: vi.fn(),
    hashAdminPin: vi.fn(),
  }))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/venue-scope', () => ({ resolveScopedVenueId }))
vi.mock('@/lib/ftp-credentials.server', () => ({ hashAdminPin }))
vi.mock('@hospo-ops/db', () => ({
  prisma: {
    ftpParkingType: {
      findMany: typeFindMany,
      findFirst: typeFindFirst,
      create: typeCreate,
    },
    ftpClaim: { findMany: vi.fn().mockResolvedValue([]) },
    venue: { findUnique: vi.fn().mockResolvedValue({ timezone: 'Pacific/Auckland' }) },
  },
}))

import { GET, POST } from './route'

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1',
    venueId: 'v1',
    name: 'RAYC',
    windowLabel: '4 HOURS',
    durationMinutes: 240,
    claimUrl: 'https://vpermit.com.au/tld/ClaimableEvents/Claim?code=12345',
    claimCode: '12345',
    contactName: 'TEST MEMBER',
    contactEmail: 'test@example.com',
    contactPhone: null,
    logPlates: true,
    plateRemovalRequiresPin: false,
    adminPinEnabled: false,
    adminPinHash: null,
    adminPinHint: null,
    healthCheckMode: 'BROWSER',
    healthPlate: 'STELLA',
    lastCheckAt: null,
    lastCheckOk: null,
    lastCheckMessage: null,
    sortOrder: 0,
    isActive: true,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  }
}

function req(body?: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/admin/parking/ftp/types', {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}

const VALID = {
  name: 'RAYC',
  claimUrl: 'https://vpermit.com.au/tld/ClaimableEvents/Claim?code=12345',
  contactName: 'Test Member',
  contactEmail: 'test@example.com',
  isActive: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { role: 'ADMIN' } })
  resolveScopedVenueId.mockReturnValue({ venueId: 'v1' })
  typeFindMany.mockResolvedValue([row({ _count: { members: 2, claims: 5 } })])
  typeFindFirst.mockResolvedValue(null)
  typeCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
    row({ ...data, id: 'created' }),
  )
  hashAdminPin.mockResolvedValue('hashed-pin')
})

describe('/api/admin/parking/ftp/types', () => {
  it('lists types with counts', async () => {
    const res = await GET(req())
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.types[0]).toMatchObject({ name: 'RAYC', memberCount: 2, claimCount: 5 })
  })

  it('rejects an invalid type', async () => {
    const res = await POST(req({ ...VALID, name: '' }))
    expect(res.status).toBe(422)
  })

  it('rejects a duplicate name', async () => {
    typeFindFirst.mockResolvedValue({ id: 'other' })
    const res = await POST(req(VALID))
    expect(res.status).toBe(409)
  })

  it('hashes an admin PIN and creates the type', async () => {
    const res = await POST(req({ ...VALID, adminPinEnabled: true, adminPin: '1234' }))
    expect(res.status).toBe(201)
    expect(hashAdminPin).toHaveBeenCalledWith('1234')
    const data = typeCreate.mock.calls[0][0].data
    expect(data).toMatchObject({
      venueId: 'v1',
      name: 'RAYC',
      adminPinEnabled: true,
      adminPinHash: 'hashed-pin',
      adminPinHint: '34',
    })
  })

  it('rejects plate-removal PIN when no admin PIN is supplied', async () => {
    const res = await POST(
      req({ ...VALID, plateRemovalRequiresPin: true, adminPinEnabled: true }),
    )
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({
      error: 'SET AN ADMIN PIN BEFORE REQUIRING IT FOR PLATE REMOVAL',
    })
    expect(typeCreate).not.toHaveBeenCalled()
  })

  it('rejects plate-removal PIN when the admin PIN switch is off', async () => {
    const res = await POST(req({ ...VALID, plateRemovalRequiresPin: true }))
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({
      error: 'SET AN ADMIN PIN BEFORE REQUIRING IT FOR PLATE REMOVAL',
    })
  })

  it('accepts plate-removal PIN with an admin PIN', async () => {
    const res = await POST(
      req({
        ...VALID,
        plateRemovalRequiresPin: true,
        adminPinEnabled: true,
        adminPin: '1234',
      }),
    )
    expect(res.status).toBe(201)
    expect(typeCreate.mock.calls[0][0].data).toMatchObject({
      plateRemovalRequiresPin: true,
      adminPinEnabled: true,
      adminPinHash: 'hashed-pin',
    })
  })
})
