import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prisma, getWorkerSession } = vi.hoisted(() => ({
  prisma: { staffEvent: { findFirst: vi.fn() } },
  getWorkerSession: vi.fn(),
}))

vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))
vi.mock('@hospo-ops/db', () => ({ prisma }))

import { GET } from './route'

const params = { params: { id: 'e1' } }
const req = {} as Request

beforeEach(() => {
  vi.clearAllMocks()
  getWorkerSession.mockResolvedValue({ staffId: 's1', venueId: 'v1' })
  prisma.staffEvent.findFirst.mockResolvedValue({
    id: 'e1', venueId: 'v1', status: 'PUBLISHED', title: 'TEAM BRIEFING', description: 'Monthly briefing',
    location: 'FUNCTION ROOM', startsAt: new Date('2026-11-12T18:00:00Z'), endsAt: new Date('2026-11-12T20:00:00Z'),
    allDay: false, attendanceRequired: true, allowMaybe: true, requireDeclineReason: false,
    responseDeadline: null, notes: null, reminderSentAt: null,
    createdBy: { firstName: 'ADA', lastName: 'MANAGER' }, venue: { timezone: 'Pacific/Auckland' },
    invites: [{ id: 'i1', response: 'PENDING', respondedAt: null, reason: null, reminderSentAt: null, deletedAt: null }],
  })
})

describe('GET /api/worker/staff-events/[id]', () => {
  it('requires a worker session', async () => {
    getWorkerSession.mockResolvedValueOnce(null)
    const res = await GET(req, params)
    expect(res.status).toBe(401)
  })

  it('only reads PUBLISHED events in the worker venue', async () => {
    await GET(req, params)
    expect(prisma.staffEvent.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'e1', venueId: 'v1', status: 'PUBLISHED' }),
    }))
  })

  it('hides a draft even if someone has its UUID', async () => {
    prisma.staffEvent.findFirst.mockResolvedValueOnce(null)
    const res = await GET(req, params)
    expect(res.status).toBe(404)
  })

  it('refuses a person without a live invite', async () => {
    prisma.staffEvent.findFirst.mockResolvedValueOnce({ ...(await prisma.staffEvent.findFirst()), invites: [] })
    const res = await GET(req, params)
    expect(res.status).toBe(404)
  })

  it('returns the explicit deadline and the effective close time separately', async () => {
    const res = await GET(req, params)
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.responseDeadline).toBeNull()
    expect(data.responseClosesAt).toBe('2026-11-12T20:00:00.000Z')
    expect(data.response).toBe('PENDING')
    expect(data.icsUrl).toBe('/api/worker/staff-events/e1/ics')
  })
})
