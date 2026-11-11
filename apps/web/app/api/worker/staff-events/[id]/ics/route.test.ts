import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prisma, getWorkerSession } = vi.hoisted(() => ({
  prisma: { staffEvent: { findFirst: vi.fn() } },
  getWorkerSession: vi.fn(),
}))

vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))
vi.mock('@hospo-ops/db', () => ({ prisma }))

import { GET } from './route'

const params = { params: { id: 'e1' } }
const req = new Request('http://localhost/api/worker/staff-events/e1/ics')

beforeEach(() => {
  vi.clearAllMocks()
  getWorkerSession.mockResolvedValue({ staffId: 's1', venueId: 'v1' })
  prisma.staffEvent.findFirst.mockResolvedValue({
    id: 'e1', venueId: 'v1', title: 'TEAM BRIEFING', description: 'Monthly briefing',
    location: 'FUNCTION ROOM', startsAt: new Date('2026-11-12T18:00:00Z'), endsAt: new Date('2026-11-12T20:00:00Z'),
    allDay: false, createdBy: { firstName: 'ADA', lastName: 'MANAGER' }, invites: [{ id: 'i1', deletedAt: null }],
  })
})

describe('GET /api/worker/staff-events/[id]/ics', () => {
  it('requires a worker session', async () => {
    getWorkerSession.mockResolvedValueOnce(null)
    const res = await GET(req, params)
    expect(res.status).toBe(401)
  })

  it('refuses a person without an invite', async () => {
    prisma.staffEvent.findFirst.mockResolvedValueOnce({ ...(await prisma.staffEvent.findFirst()), invites: [] })
    const res = await GET(req, params)
    expect(res.status).toBe(404)
  })

  it('only looks up PUBLISHED events, so a draft UUID is not readable', async () => {
    prisma.staffEvent.findFirst.mockResolvedValueOnce(null)
    const res = await GET(req, params)
    expect(res.status).toBe(404)
    expect(prisma.staffEvent.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'PUBLISHED', venueId: 'v1' }),
    }))
  })

  it('returns a downloadable calendar invite', async () => {
    const res = await GET(req, params)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/calendar')
    expect(res.headers.get('Content-Disposition')).toContain('team-briefing.ics')
    const body = await res.text()
    expect(body).toContain('BEGIN:VCALENDAR')
    expect(body).toContain('SUMMARY:TEAM BRIEFING')
    expect(body).toContain('ORGANIZER;CN="ADA MANAGER"')
    expect(body).toMatch(/DTSTAMP:\d{8}T\d{6}Z/)
  })
})
