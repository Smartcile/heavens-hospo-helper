import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getServerSession, guardAccess, resolveScopedVenueId, loadExistingForGroup } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  resolveScopedVenueId: vi.fn(),
  loadExistingForGroup: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/venue-scope', () => ({ resolveScopedVenueId }))
vi.mock('@/lib/customer-memberships.server', () => ({ loadExistingForGroup }))

import { POST } from './route'

function requestWithForm(form: FormData): NextRequest {
  return {
    formData: async () => form,
    nextUrl: new URL('http://localhost/api/admin/customer-memberships/import/preview'),
  } as unknown as NextRequest
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1', availableVenueIds: ['v1'] } })
  guardAccess.mockResolvedValue(null)
  resolveScopedVenueId.mockReturnValue({ venueId: 'v1' })
  loadExistingForGroup.mockResolvedValue({ existing: {}, previousPrimaryName: {} })
})

describe('POST /api/admin/customer-memberships/import/preview', () => {
  it('parses the uploaded CSV without writing anything', async () => {
    const form = new FormData()
    form.append('venueId', 'v1')
    form.append('groupId', 'g1')
    form.append(
      'file',
      new File(
        ['First Name,Last Name,Membership Number ,Member Status\nALICE,SMITH,101,Current\nBOB,JONES,102,Resigned'],
        'members.csv',
        { type: 'text/csv' },
      ),
    )
    const res = await POST(requestWithForm(form))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.preview.rows).toHaveLength(2)
    expect(body.preview.rows[0].firstName).toBe('Alice')
    expect(body.preview.rows[1].isActive).toBe(false)
    expect(loadExistingForGroup).toHaveBeenCalledWith('v1', 'g1')
  })

  it('rejects a request without a file', async () => {
    const form = new FormData()
    form.append('venueId', 'v1')
    form.append('groupId', 'g1')
    const res = await POST(requestWithForm(form))
    expect(res.status).toBe(400)
  })
})
