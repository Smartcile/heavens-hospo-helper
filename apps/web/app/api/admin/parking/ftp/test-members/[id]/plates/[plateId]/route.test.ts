import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  getServerSession,
  resolveScopedVenueId,
  memberFindFirst,
  applyMemberPlateAction,
  removeMemberPlate,
} = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  resolveScopedVenueId: vi.fn(),
  memberFindFirst: vi.fn(),
  applyMemberPlateAction: vi.fn(),
  removeMemberPlate: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/venue-scope', () => ({ resolveScopedVenueId }))
vi.mock('@/lib/ftp-member-plates.server', () => ({
  applyMemberPlateAction,
  removeMemberPlate,
}))
vi.mock('@hospo-ops/db', () => ({
  prisma: { member: { findFirst: memberFindFirst } },
}))

import { DELETE, PATCH } from './route'

function req(method: 'PATCH' | 'DELETE', body?: Record<string, unknown>) {
  return new NextRequest(
    'http://localhost/api/admin/parking/ftp/test-members/m1/plates/p1',
    {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  )
}

const PARAMS = { params: { id: 'm1', plateId: 'p1' } }
const PLATES = [{ id: 'p2', plate: 'XYZ789', isDefault: true }]

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { role: 'ADMIN' } })
  resolveScopedVenueId.mockReturnValue({ venueId: 'v1' })
  memberFindFirst.mockResolvedValue({ id: 'm1' })
  applyMemberPlateAction.mockResolvedValue({ ok: true, plates: PLATES })
  removeMemberPlate.mockResolvedValue({ ok: true })
})

describe('PATCH/DELETE /api/admin/parking/ftp/test-members/[id]/plates/[plateId]', () => {
  it('requires a session', async () => {
    getServerSession.mockResolvedValue(null)
    const res = await PATCH(req('PATCH', { action: 'SET_DEFAULT' }), PARAMS)
    expect(res?.status).toBe(401)
  })

  it('refuses a member outside the scoped venue', async () => {
    memberFindFirst.mockResolvedValue(null)
    const res = await PATCH(req('PATCH', { action: 'SET_DEFAULT' }), PARAMS)
    expect(res?.status).toBe(404)
    expect(applyMemberPlateAction).not.toHaveBeenCalled()
  })

  it('sets a plate as the default through the shared helper', async () => {
    const res = await PATCH(req('PATCH', { action: 'SET_DEFAULT' }), PARAMS)
    expect(res?.status).toBe(200)
    expect(await res!.json()).toEqual({ ok: true, plates: PLATES })
    expect(applyMemberPlateAction).toHaveBeenCalledWith({
      venueId: 'v1',
      memberId: 'm1',
      plateId: 'p1',
      action: 'SET_DEFAULT',
    })
  })

  it('returns 404 for an unknown plate on PATCH', async () => {
    applyMemberPlateAction.mockResolvedValue({
      ok: false,
      reason: 'NOT_FOUND',
      plates: [],
    })
    const res = await PATCH(req('PATCH', { action: 'REMOVE' }), PARAMS)
    expect(res?.status).toBe(404)
    expect(applyMemberPlateAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'REMOVE' }),
    )
  })

  it('removes (retires) a plate through the shared helper', async () => {
    const res = await DELETE(req('DELETE'), PARAMS)
    expect(res?.status).toBe(200)
    expect(await res!.json()).toEqual({ ok: true })
    expect(removeMemberPlate).toHaveBeenCalledWith({
      venueId: 'v1',
      memberId: 'm1',
      plateId: 'p1',
    })
  })

  it('returns 404 for an unknown plate on DELETE', async () => {
    removeMemberPlate.mockResolvedValue({ ok: false, reason: 'NOT_FOUND' })
    const res = await DELETE(req('DELETE'), PARAMS)
    expect(res?.status).toBe(404)
  })
})
