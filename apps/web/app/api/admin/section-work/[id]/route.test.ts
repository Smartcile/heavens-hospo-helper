import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess, reviewSectionWork } = vi.hoisted(() => ({
  prisma: {
    sectionWorkReview: { findFirst: vi.fn() },
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  reviewSectionWork: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/section-work.server', () => ({ reviewSectionWork }))

import { POST } from '@/app/api/admin/section-work/[id]/route'

function request(body: unknown = { action: 'CONFIRM' }, cookieVenueId?: string): NextRequest {
  return new NextRequest('http://localhost/api/admin/section-work/r1', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookieVenueId ? { cookie: `admin-active-venue=${cookieVenueId}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

const params = { params: { id: 'r1' } }

function session(role: 'ADMIN' | 'MANAGER', venueId: string, availableVenueIds = [venueId]) {
  return { user: { id: 'u1', role, venueId, availableVenueIds } }
}

beforeEach(() => {
  vi.clearAllMocks()
  guardAccess.mockResolvedValue(null)
  getServerSession.mockResolvedValue(session('MANAGER', 'v1'))
  prisma.sectionWorkReview.findFirst.mockResolvedValue({ venueId: 'v1' })
  reviewSectionWork.mockResolvedValue({ ok: true, review: { id: 'r1', status: 'CONFIRMED' } })
})

describe('POST /api/admin/section-work/[id]', () => {
  it('rejects a manager acting on another venue\'s review', async () => {
    prisma.sectionWorkReview.findFirst.mockResolvedValue({ venueId: 'v2' })
    const res = await POST(request(), params)
    expect(res.status).toBe(403)
    expect(reviewSectionWork).not.toHaveBeenCalled()
  })

  it('respects the ADMIN active venue (cookie) rather than any venue', async () => {
    getServerSession.mockResolvedValue(session('ADMIN', 'v1', ['v1', 'v2']))
    prisma.sectionWorkReview.findFirst.mockResolvedValue({ venueId: 'v2' })
    const res = await POST(request(undefined, 'v1'), params)
    expect(res.status).toBe(403)
    expect(reviewSectionWork).not.toHaveBeenCalled()
  })

  it('allows an ADMIN acting inside their active venue', async () => {
    getServerSession.mockResolvedValue(session('ADMIN', 'v1', ['v1', 'v2']))
    prisma.sectionWorkReview.findFirst.mockResolvedValue({ venueId: 'v2' })
    const res = await POST(request(undefined, 'v2'), params)
    expect(res.status).toBe(200)
    expect(reviewSectionWork).toHaveBeenCalledWith(
      expect.objectContaining({ reviewId: 'r1', action: 'CONFIRM', reviewerId: 'u1' }),
    )
  })

  it('surfaces a permission denial instead of silently succeeding', async () => {
    const { NextResponse } = await import('next/server')
    guardAccess.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
    const res = await POST(request(), params)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Forbidden' })
    expect(reviewSectionWork).not.toHaveBeenCalled()
  })

  it('surfaces an invalid state transition as a 409', async () => {
    reviewSectionWork.mockResolvedValue({
      ok: false,
      status: 409,
      error: 'Cannot DISMISS a CONFIRMED review',
    })
    const res = await POST(request({ action: 'DISMISS' }), params)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'Cannot DISMISS a CONFIRMED review' })
  })

  it('rejects an unknown action', async () => {
    const res = await POST(request({ action: 'APPROVE' }), params)
    expect(res.status).toBe(400)
    expect(reviewSectionWork).not.toHaveBeenCalled()
  })
})
