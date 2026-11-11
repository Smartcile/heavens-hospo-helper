import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { getServerSession, guardAccess, canAccess, guideWarningsForVenue } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  canAccess: vi.fn(),
  guideWarningsForVenue: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/permissions', () => ({ guardAccess, canAccess }))
vi.mock('@/lib/guide-warnings.server', () => ({ guideWarningsForVenue }))

import { GET } from './route'

const payload = {
  venueName: 'MAIN',
  date: '2026-11-12',
  warnings: [],
  folders: [],
  staff: [],
  guides: [],
  summary: { total: 0, critical: 0, warning: 0 },
}

function request(url = 'http://localhost/api/admin/guide-warnings') {
  return new NextRequest(url)
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1' } })
  guardAccess.mockResolvedValue(null)
  canAccess.mockResolvedValue(true)
  guideWarningsForVenue.mockResolvedValue(payload)
})

describe('GET /api/admin/guide-warnings', () => {
  it('returns 401 without a session', async () => {
    getServerSession.mockResolvedValue(null)
    const res = await GET(request())
    expect(res.status).toBe(401)
  })

  it('returns the perm guard response unchanged', async () => {
    guardAccess.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
    const res = await GET(request())
    expect(res.status).toBe(403)
    expect(guideWarningsForVenue).not.toHaveBeenCalled()
  })

  it('forces a manager onto their own venue', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'MANAGER', venueId: 'v1' } })
    await GET(request('http://localhost/api/admin/guide-warnings?venueId=v2'))
    expect(guideWarningsForVenue).toHaveBeenCalledWith('v1')
  })

  it('lets an admin read the requested venue and reports the action grants', async () => {
    const res = await GET(request('http://localhost/api/admin/guide-warnings?venueId=v2'))
    expect(guideWarningsForVenue).toHaveBeenCalledWith('v2')
    expect(await res.json()).toMatchObject({
      canAssign: true,
      canSignOff: true,
      venueName: 'MAIN',
    })
  })

  it('hides both action grants when the manager lacks them', async () => {
    canAccess.mockResolvedValue(false)
    const res = await GET(request())
    expect(await res.json()).toMatchObject({ canAssign: false, canSignOff: false })
  })

  it('404s when the venue does not exist', async () => {
    guideWarningsForVenue.mockResolvedValue(null)
    const res = await GET(request())
    expect(res.status).toBe(404)
  })
})
