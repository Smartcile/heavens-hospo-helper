import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess, resolveScopedVenueId, bcrypt } = vi.hoisted(() => ({
  prisma: {
    venue: { findUnique: vi.fn() },
    staff: { findMany: vi.fn(), update: vi.fn(), create: vi.fn() },
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  resolveScopedVenueId: vi.fn(),
  bcrypt: { hash: vi.fn(), compare: vi.fn() },
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('bcryptjs', () => ({ default: bcrypt }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/venue-scope', () => ({ resolveScopedVenueId }))
vi.mock('@/lib/swiftpos.server', () => ({ fetchLookups: vi.fn() }))

import { POST } from './route'

const req = (body: unknown) => ({ json: async () => body } as unknown as NextRequest)

const target = {
  id: 's1',
  firstName: 'BEA',
  lastName: 'HORAN',
  swiftPosId: null,
  isActive: true,
  pin: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1' } })
  guardAccess.mockResolvedValue(null)
  resolveScopedVenueId.mockReturnValue({ venueId: 'v1' })
  prisma.venue.findUnique.mockResolvedValue({ id: 'v1' })
  prisma.staff.findMany.mockResolvedValue([target])
  prisma.staff.update.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({ id: 's1', ...data }),
  )
  bcrypt.hash.mockResolvedValue('hashed-pin')
  bcrypt.compare.mockResolvedValue(false)
})

describe('POST /api/admin/swiftpos/staff LINK', () => {
  it('sets the worker PIN from the clerk id when the staff has no PIN', async () => {
    const res = await POST(req({ action: 'LINK', clerkId: '15', staffId: 's1' }))

    expect(prisma.staff.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { swiftPosId: '15', pin: 'hashed-pin' } }),
    )
    expect(await res.json()).toMatchObject({ ok: true, pinSet: true })
  })

  it('keeps an existing PIN (even when it matches the clerk id)', async () => {
    prisma.staff.findMany.mockResolvedValue([{ ...target, pin: 'existing-hash' }])
    bcrypt.compare.mockResolvedValue(true)

    const res = await POST(req({ action: 'LINK', clerkId: '15', staffId: 's1' }))

    expect(prisma.staff.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { swiftPosId: '15' } }),
    )
    expect(await res.json()).toMatchObject({
      pinSet: false,
      pinWarning: 'PIN ALREADY SET FROM CLERK ID',
    })
  })

  it('links without a PIN when another staff member already uses it', async () => {
    prisma.staff.findMany.mockResolvedValue([
      target,
      { id: 's2', firstName: 'SAM', lastName: 'WILSON', swiftPosId: null, isActive: true, pin: 'other-hash' },
    ])
    bcrypt.compare.mockImplementation(
      async (plain: string, hash: string) => plain === '15' && hash === 'other-hash',
    )

    const res = await POST(req({ action: 'LINK', clerkId: '15', staffId: 's1' }))

    expect(prisma.staff.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { swiftPosId: '15' } }),
    )
    expect(await res.json()).toMatchObject({
      pinSet: false,
      pinWarning: 'NO PIN SET — PIN 15 IS ALREADY IN USE BY SAM WILSON',
    })
  })
})
