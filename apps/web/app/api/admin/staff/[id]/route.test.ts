import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess, dismissPendingSectionWorkForGrant } = vi.hoisted(() => ({
  prisma: {
    staff: { findFirst: vi.fn(), update: vi.fn() },
    staffVenue: { deleteMany: vi.fn(), createMany: vi.fn() },
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  dismissPendingSectionWorkForGrant: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/section-work.server', () => ({ dismissPendingSectionWorkForGrant }))

import { PUT } from '@/app/api/admin/staff/[id]/route'

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin/staff/s1', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const params = { params: { id: 's1' } }

beforeEach(() => {
  vi.clearAllMocks()
  guardAccess.mockResolvedValue(null)
  getServerSession.mockResolvedValue({
    user: { id: 'm1', role: 'MANAGER', venueId: 'v1', availableVenueIds: ['v1'] },
  })
  prisma.staff.update.mockResolvedValue({ id: 's1' })
  dismissPendingSectionWorkForGrant.mockResolvedValue(1)
})

describe('PUT /api/admin/staff/[id]', () => {
  it('dismisses a matching PENDING section review when a manager grants it manually', async () => {
    const res = await PUT(request({ firstName: 'JANE', lastName: 'SMITH', sectionIds: ['sec1'] }), params)
    expect(res.status).toBe(200)
    expect(dismissPendingSectionWorkForGrant).toHaveBeenCalledWith('s1', ['sec1'], 'm1')
  })

  it('does not touch reviews when the sections field is absent', async () => {
    await PUT(request({ firstName: 'JANE' }), params)
    expect(dismissPendingSectionWorkForGrant).not.toHaveBeenCalled()
  })
})
