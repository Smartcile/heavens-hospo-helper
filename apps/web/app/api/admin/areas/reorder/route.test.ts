import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess } = vi.hoisted(() => ({
  prisma: {
    area: { findMany: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))

import { POST } from '@/app/api/admin/areas/reorder/route'

function request(order: string[]): NextRequest {
  return new NextRequest('http://localhost/api/admin/areas/reorder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  guardAccess.mockResolvedValue(null)
  getServerSession.mockResolvedValue({
    user: { id: 'm1', role: 'MANAGER', venueId: 'v1', availableVenueIds: ['v1'] },
  })
  prisma.$transaction.mockResolvedValue([])
})

describe('POST /api/admin/areas/reorder', () => {
  it('reorders this venue’s own rooms', async () => {
    prisma.area.findMany.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }])
    const res = await POST(request(['a2', 'a1']))
    expect(res.status).toBe(200)
  })

  it('rejects a room owned by another venue (shared rooms are owner-only)', async () => {
    prisma.area.findMany.mockResolvedValue([{ id: 'a1' }])
    const res = await POST(request(['a1', 'shared-from-v2']))
    expect(res.status).toBe(403)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})
