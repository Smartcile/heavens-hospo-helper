import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  getWorkerSession: vi.fn(),
  clearWorkerSessionCookie: vi.fn(),
  createWorkerSession: vi.fn(),
  setWorkerSessionCookie: vi.fn(),
  venueFindFirst: vi.fn(),
  staffFindFirst: vi.fn(),
}))

vi.mock('@/lib/worker-session', () => ({
  getWorkerSession: mocks.getWorkerSession,
  clearWorkerSessionCookie: mocks.clearWorkerSessionCookie,
  createWorkerSession: mocks.createWorkerSession,
  setWorkerSessionCookie: mocks.setWorkerSessionCookie,
}))

vi.mock('@hospo-ops/db', () => ({
  prisma: {
    venue: { findFirst: mocks.venueFindFirst },
    staff: { findFirst: mocks.staffFindFirst },
  },
}))

import { GET as getSession } from './route'
import { POST as refreshSession } from './refresh/route'

type StaffRow = {
  id: string
  venueId: string
  departmentId: string | null
  firstName: string
  role: string
  isActive: boolean
  deletedAt: Date | null
  staffVenues: { venueId: string }[]
}

let staffRow: StaffRow | null = null

function setStaff(overrides: Partial<StaffRow> = {}) {
  staffRow = {
    id: 'staff-1',
    venueId: 'venue-1',
    departmentId: 'dept-1',
    firstName: 'TAYLOR',
    role: 'STAFF',
    isActive: true,
    deletedAt: null,
    staffVenues: [],
    ...overrides,
  }
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    staffId: 'staff-1',
    venueId: 'venue-1',
    departmentId: 'dept-1',
    firstName: 'TAYLOR',
    role: 'MANAGER',
    expiresAt: Date.now() - 1,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  setStaff()
  mocks.getWorkerSession.mockResolvedValue(session())
  mocks.createWorkerSession.mockResolvedValue('new-token')
  mocks.venueFindFirst.mockResolvedValue({
    isActive: true,
    workerSessionTimeoutMinutes: 30,
  })

  // Minimal in-memory evaluation of the route's staff query so the four
  // negative cases (inactive / deleted / wrong venue / shared venue) really
  // exercise the where clause rather than a blanket null.
  mocks.staffFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
    if (!staffRow || staffRow.id !== where.id) return null
    if (where.deletedAt === null && staffRow.deletedAt !== null) return null
    if (where.isActive === true && !staffRow.isActive) return null

    const or = (where.OR ?? []) as Record<string, unknown>[]
    const home = or.find((c) => 'venueId' in c)?.venueId
    const homeVenue = typeof home === 'string' ? home : undefined
    const shared = or.find((c) => 'staffVenues' in c)?.staffVenues as
      | { some?: { venueId?: string } }
      | undefined
    const sharedVenue = shared?.some?.venueId
    const linked =
      (homeVenue !== undefined && staffRow.venueId === homeVenue) ||
      (sharedVenue !== undefined && staffRow.staffVenues.some((v) => v.venueId === sharedVenue))

    return linked ? staffRow : null
  })
})

describe.each([
  ['GET /api/worker/session', () => getSession()],
  ['POST /api/worker/session/refresh', () => refreshSession()],
])('%s staff re-validation', (_name, call) => {
  it('returns 401 for an inactive staff member', async () => {
    setStaff({ isActive: false })
    const res = await call()
    expect(res.status).toBe(401)
    expect(mocks.clearWorkerSessionCookie).toHaveBeenCalled()
    expect(mocks.createWorkerSession).not.toHaveBeenCalled()
  })

  it('returns 401 for a deleted staff member', async () => {
    setStaff({ deletedAt: new Date() })
    const res = await call()
    expect(res.status).toBe(401)
    expect(mocks.clearWorkerSessionCookie).toHaveBeenCalled()
    expect(mocks.createWorkerSession).not.toHaveBeenCalled()
  })

  it('returns 401 when the staff member has no link to the session venue', async () => {
    setStaff({ venueId: 'venue-2', staffVenues: [] })
    const res = await call()
    expect(res.status).toBe(401)
    expect(mocks.clearWorkerSessionCookie).toHaveBeenCalled()
    expect(mocks.createWorkerSession).not.toHaveBeenCalled()
  })

  it('accepts a staff member linked through StaffVenue', async () => {
    setStaff({ venueId: 'venue-2', staffVenues: [{ venueId: 'venue-1' }] })
    const res = await call()
    expect(res.status).toBe(200)
    expect(mocks.clearWorkerSessionCookie).not.toHaveBeenCalled()
  })
})

describe('POST /api/worker/session/refresh re-mint', () => {
  it('re-mints with the current staff role and department so a demotion sticks', async () => {
    setStaff({ role: 'STAFF', departmentId: 'dept-2', firstName: 'NEW NAME' })
    mocks.getWorkerSession.mockResolvedValue(
      session({ role: 'MANAGER', departmentId: 'dept-1', firstName: 'TAYLOR' })
    )

    const res = await refreshSession()
    expect(res.status).toBe(200)

    expect(mocks.createWorkerSession).toHaveBeenCalledWith(
      {
        staffId: 'staff-1',
        venueId: 'venue-1',
        departmentId: 'dept-2',
        firstName: 'NEW NAME',
        role: 'STAFF',
      },
      30
    )
    expect(mocks.setWorkerSessionCookie).toHaveBeenCalledWith('new-token', 30)
    const body = await res.json()
    expect(body.refreshed).toBe(true)
  })

  it('does not mint a new token while the current one is still fresh', async () => {
    mocks.getWorkerSession.mockResolvedValue(session({ expiresAt: Date.now() + 30 * 60_000 }))

    const res = await refreshSession()
    expect(res.status).toBe(200)
    expect(mocks.createWorkerSession).not.toHaveBeenCalled()
    const body = await res.json()
    expect(body.refreshed).toBe(false)
  })
})
