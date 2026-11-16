import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MembersPanel } from './MembersPanel'

const fetchMock = vi.fn()

function jsonResponse(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response)
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('MembersPanel', () => {
  it('lists databases and their members', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.startsWith('/api/admin/customer-groups')) {
        return jsonResponse({
          groups: [
            {
              id: 'g1',
              venueId: 'v1',
              name: 'RAYC MEMBERS',
              slug: 'rayc-members',
              kind: 'MEMBER_DATABASE',
              description: null,
              colour: null,
              isActive: true,
              sortOrder: 0,
              areas: ['CUSTOMERS', 'BOOKINGS'],
              mapping: { typeActive: 3, statusActive: 1, typeRemoved: 9, statusRemoved: 0, exportEncoding: 'UTF8_BOM' },
              memberCount: 1,
              createdAt: '',
              updatedAt: '',
            },
          ],
        })
      }
      if (url.startsWith('/api/admin/customer-memberships')) {
        return jsonResponse({
          memberships: [
            {
              id: 'm1',
              venueId: 'v1',
              groupId: 'g1',
              groupName: 'RAYC MEMBERS',
              groupKind: 'MEMBER_DATABASE',
              customerId: null,
              customerName: null,
              membershipNumber: '101',
              firstName: 'ALICE',
              lastName: 'SMITH',
              displayName: 'ALICE SMITH',
              memberType: 'VETERAN',
              isActive: true,
              isFamily: false,
              isPrimary: true,
              familySurnames: null,
              email: 'alice@example.com',
              phone: null,
              memberInterests: null,
              company: null,
              externalId: null,
              source: 'HUBSPOT',
              giftCardId: null,
              lastImportedAt: null,
              createdAt: '',
              updatedAt: '',
            },
          ],
        })
      }
      return jsonResponse({})
    })

    render(<MembersPanel role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    expect((await screen.findAllByText('RAYC MEMBERS')).length).toBeGreaterThan(0)
    expect(await screen.findByText('ALICE SMITH')).toBeInTheDocument()
    expect(screen.getByText('101')).toBeInTheDocument()
    expect(screen.getByText('VETERAN')).toBeInTheDocument()
  })
})
