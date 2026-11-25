import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  getServerSession,
  resolveScopedVenueId,
  typeFindFirst,
  typeUpdate,
  hashAdminPin,
} = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  resolveScopedVenueId: vi.fn(),
  typeFindFirst: vi.fn(),
  typeUpdate: vi.fn(),
  hashAdminPin: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/venue-scope', () => ({ resolveScopedVenueId }))
vi.mock('@/lib/ftp-credentials.server', () => ({ hashAdminPin }))
vi.mock('@hospo-ops/db', () => ({
  prisma: {
    ftpParkingType: { findFirst: typeFindFirst, update: typeUpdate },
  },
}))

import { PUT } from './route'

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1',
    venueId: 'v1',
    name: 'RAYC',
    windowLabel: '4 HOURS',
    durationMinutes: 240,
    claimUrl: 'https://vpermit.com.au/tld/ClaimableEvents/Claim?code=12345',
    claimCode: '12345',
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    useContactEmail: true,
    useContactPhone: true,
    logPlates: true,
    plateRemovalRequiresPin: false,
    showOnKiosk: true,
    adminPinEnabled: false,
    adminPinHash: null,
    adminPinHint: null,
    guestEntryEnabled: false,
    guestEntryLabel: null,
    guestEntryPinHash: null,
    guestEntryPinHint: null,
    guestPlateLimitEnabled: false,
    guestPlateLimit: null,
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

const VALID = {
  name: 'RAYC',
  claimUrl: 'https://vpermit.com.au/tld/ClaimableEvents/Claim?code=12345',
  isActive: true,
}

function req(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/admin/parking/ftp/types/t1', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function setLoaded(overrides: Record<string, unknown> = {}) {
  typeFindFirst.mockReset()
  typeFindFirst.mockResolvedValueOnce(row(overrides)).mockResolvedValueOnce(null)
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { role: 'ADMIN' } })
  resolveScopedVenueId.mockReturnValue({ venueId: 'v1' })
  setLoaded()
  hashAdminPin.mockResolvedValue('hashed-pin')
  typeUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
    row({ ...data, id: 't1' }),
  )
})

describe('PUT /api/admin/parking/ftp/types/[id]', () => {
  it('rejects plate-removal PIN without an admin PIN', async () => {
    const res = await PUT(
      req({ ...VALID, plateRemovalRequiresPin: true, adminPinEnabled: true }),
      { params: { id: 't1' } },
    )
    expect(res?.status).toBe(422)
    expect(await res!.json()).toEqual({
      error: 'SET AN ADMIN PIN BEFORE REQUIRING IT FOR PLATE REMOVAL',
    })
    expect(typeUpdate).not.toHaveBeenCalled()
  })

  it('rejects plate-removal PIN when the admin PIN is disabled', async () => {
    setLoaded({ adminPinHash: 'hash', adminPinEnabled: true })
    const res = await PUT(req({ ...VALID, plateRemovalRequiresPin: true }), {
      params: { id: 't1' },
    })
    expect(res?.status).toBe(422)
    expect(await res!.json()).toEqual({
      error: 'SET AN ADMIN PIN BEFORE REQUIRING IT FOR PLATE REMOVAL',
    })
  })

  it('accepts plate-removal PIN with an existing admin PIN enabled', async () => {
    setLoaded({ adminPinHash: 'hash', adminPinEnabled: true })
    const res = await PUT(
      req({ ...VALID, plateRemovalRequiresPin: true, adminPinEnabled: true }),
      { params: { id: 't1' } },
    )
    expect(res?.status).toBe(200)
    expect(typeUpdate.mock.calls[0][0].data).toMatchObject({
      plateRemovalRequiresPin: true,
      adminPinEnabled: true,
    })
  })

  it('hashes a new admin PIN before allowing plate-removal PIN', async () => {
    const res = await PUT(
      req({
        ...VALID,
        plateRemovalRequiresPin: true,
        adminPinEnabled: true,
        adminPin: '1234',
      }),
      { params: { id: 't1' } },
    )
    expect(res?.status).toBe(200)
    expect(hashAdminPin).toHaveBeenCalledWith('1234')
    expect(typeUpdate.mock.calls[0][0].data).toMatchObject({
      plateRemovalRequiresPin: true,
      adminPinHash: 'hashed-pin',
    })
  })
})
