import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getServerSession, resolveScopedVenueId, findFirst, update, hashAdminPin, generateAdminPin } =
  vi.hoisted(() => ({
    getServerSession: vi.fn(),
    resolveScopedVenueId: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    hashAdminPin: vi.fn(),
    generateAdminPin: vi.fn(),
  }))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/venue-scope', () => ({ resolveScopedVenueId }))
vi.mock('@hospo-ops/db', () => ({
  prisma: { ftpParkingType: { findFirst, update } },
}))
vi.mock('@/lib/ftp-credentials.server', () => ({ hashAdminPin, generateAdminPin }))

import { POST } from './route'

function req(body: Record<string, unknown> = {}) {
  return new NextRequest(
    'http://localhost/api/admin/parking/ftp/types/t1/guest-pin',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { role: 'ADMIN' } })
  resolveScopedVenueId.mockReturnValue({ venueId: 'v1' })
  findFirst.mockResolvedValue({ id: 't1' })
  update.mockResolvedValue({})
  hashAdminPin.mockResolvedValue('hashed')
  generateAdminPin.mockReturnValue('654321')
})

describe('POST /api/admin/parking/ftp/types/[id]/guest-pin', () => {
  it('is admin only', async () => {
    getServerSession.mockResolvedValue({ user: { role: 'MANAGER' } })
    expect((await POST(req(), { params: { id: 't1' } })).status).toBe(403)
  })

  it('404s for another venue', async () => {
    findFirst.mockResolvedValue(null)
    expect((await POST(req(), { params: { id: 't1' } })).status).toBe(404)
  })

  it('rejects a bad PIN', async () => {
    expect((await POST(req({ pin: '12' }), { params: { id: 't1' } })).status).toBe(422)
  })

  it('sets a supplied PIN and returns it once', async () => {
    const res = await POST(req({ pin: '1234' }), { params: { id: 't1' } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ pin: '1234', hint: '34' })
    expect(update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { guestEntryPinHash: 'hashed', guestEntryPinHint: '34' },
    })
  })

  it('generates a PIN when blank', async () => {
    const res = await POST(req(), { params: { id: 't1' } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ pin: '654321', hint: '21' })
    expect(generateAdminPin).toHaveBeenCalledWith(6)
  })
})
