import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getServerSession, guardAccess, resolveScopedVenueId, exportMembershipsCsv } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  resolveScopedVenueId: vi.fn(),
  exportMembershipsCsv: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/venue-scope', () => ({ resolveScopedVenueId }))
vi.mock('@/lib/customer-memberships.server', () => ({ exportMembershipsCsv }))

import { GET } from './route'

const getReq = (url: string) => ({ url, nextUrl: new URL(url) } as unknown as NextRequest)

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1', availableVenueIds: ['v1'] } })
  guardAccess.mockResolvedValue(null)
  resolveScopedVenueId.mockReturnValue({ venueId: 'v1' })
  exportMembershipsCsv.mockResolvedValue({
    csv: 'First Name,Last Name\r\nAlice,Smith',
    filename: 'rayc-members-2026-11-16.csv',
    encoding: 'UTF8_BOM',
    groupName: 'RAYC MEMBERS',
  })
})

describe('GET /api/admin/customer-memberships/export', () => {
  it('returns a UTF-8 BOM CSV attachment', async () => {
    const res = await GET(getReq('http://localhost/api/admin/customer-memberships/export?groupId=g1&status=active'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(res.headers.get('content-disposition')).toContain('rayc-members-2026-11-16.csv')
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf])
    expect(new TextDecoder().decode(bytes)).toContain('Alice,Smith')
    expect(exportMembershipsCsv).toHaveBeenCalledWith('v1', 'g1', 'active')
  })

  it('requires a group', async () => {
    const res = await GET(getReq('http://localhost/api/admin/customer-memberships/export'))
    expect(res.status).toBe(422)
  })
})
