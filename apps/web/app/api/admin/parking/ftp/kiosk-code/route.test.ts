import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getServerSession, prisma, generateKioskCode, hashKioskCode, kioskCodeHint } = vi.hoisted(
  () => ({
    getServerSession: vi.fn(),
    prisma: { ftpSettings: { upsert: vi.fn() } },
    generateKioskCode: vi.fn(() => 'ABCD2345'),
    hashKioskCode: vi.fn(() => 'hashed'),
    kioskCodeHint: vi.fn(() => '45'),
  }),
)

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/parking-kiosk.server', () => ({
  generateKioskCode,
  hashKioskCode,
  kioskCodeHint,
}))

import { POST } from './route'

const ADMIN = { user: { id: 'u1', role: 'ADMIN', venueId: 'v1', availableVenueIds: ['v1', 'v2'] } }

function req(body: Record<string, unknown> = {}) {
  return new NextRequest('http://localhost/api/admin/parking/ftp/kiosk-code', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue(ADMIN)
  prisma.ftpSettings.upsert.mockResolvedValue({ id: 'f1' })
})

describe('POST /api/admin/parking/ftp/kiosk-code', () => {
  it('is ADMIN only', async () => {
    getServerSession.mockResolvedValue({
      user: { id: 'u2', role: 'MANAGER', venueId: 'v1', availableVenueIds: ['v1'] },
    })
    expect((await POST(req())).status).toBe(403)
  })

  it('hashes the code and returns it once', async () => {
    const res = await POST(req())
    const body = await res.json()
    expect(body).toEqual({ code: 'ABCD2345', hint: '45' })
    expect(prisma.ftpSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          venueId: 'v1',
          kioskCodeHash: 'hashed',
          kioskCodeHint: '45',
        }),
      }),
    )
  })

  it('uses the requested venue for an admin', async () => {
    await POST(req({ venueId: 'v2' }))
    expect(prisma.ftpSettings.upsert.mock.calls[0][0].create.venueId).toBe('v2')
  })
})
