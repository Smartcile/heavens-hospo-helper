import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getServerSession, guardAccess, resolveScopedVenueId, reviewBreachNotice, withdrawBreachNotice } =
  vi.hoisted(() => ({
    getServerSession: vi.fn(),
    guardAccess: vi.fn(),
    resolveScopedVenueId: vi.fn(),
    reviewBreachNotice: vi.fn(),
    withdrawBreachNotice: vi.fn(),
  }))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/venue-scope', () => ({ resolveScopedVenueId }))
vi.mock('@/lib/breach-notices.server', () => ({ reviewBreachNotice, withdrawBreachNotice }))

import { POST } from './route'

function req(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/admin/breach-notices/n1/review?venueId=v1', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'm1', role: 'MANAGER', venueId: 'v1', availableVenueIds: ['v1'] } })
  guardAccess.mockResolvedValue(null)
  resolveScopedVenueId.mockReturnValue({ venueId: 'v1' })
  reviewBreachNotice.mockResolvedValue({ ok: true, notice: { id: 'n1', status: 'WAIVED' } })
  withdrawBreachNotice.mockResolvedValue({ ok: true, notice: { id: 'n1', status: 'WITHDRAWN' } })
})

describe('POST /api/admin/breach-notices/[id]/review', () => {
  it('returns the guard denial', async () => {
    const { NextResponse } = await import('next/server')
    guardAccess.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
    expect((await POST(req({ action: 'WAIVE', note: 'ok' }), { params: { id: 'n1' } })).status).toBe(403)
  })

  it('records a decision with the scoped venue and manager', async () => {
    const res = await POST(req({ action: 'WAIVE', note: 'goodwill' }), { params: { id: 'n1' } })
    expect(res.status).toBe(200)
    expect(reviewBreachNotice).toHaveBeenCalledWith({
      id: 'n1',
      venueId: 'v1',
      reviewedById: 'm1',
      action: 'WAIVE',
      note: 'goodwill',
    })
  })

  it('passes a 409 through when the notice is already closed', async () => {
    reviewBreachNotice.mockResolvedValue({ ok: false, status: 409, error: 'THIS NOTICE HAS ALREADY BEEN CLOSED' })
    const res = await POST(req({ action: 'PAID', note: 'paid' }), { params: { id: 'n1' } })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('ALREADY')
  })

  it('routes WITHDRAW to the withdraw path', async () => {
    const res = await POST(req({ action: 'WITHDRAW' }), { params: { id: 'n1' } })
    expect(res.status).toBe(200)
    expect(withdrawBreachNotice).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'n1', venueId: 'v1', allowAny: true }),
    )
  })
})
