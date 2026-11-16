import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ParkingMembersPanel } from './ParkingMembersPanel'

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

describe('ParkingMembersPanel', () => {
  it('lists real and test parking members', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        members: [
          {
            id: 'm1',
            membershipNumber: '12345',
            firstName: 'JANE',
            lastName: 'DOE',
            email: 'jane@example.com',
            phone: null,
            parkingTypeId: 't1',
            parkingTypeName: 'RAYC',
            isActive: true,
            isTest: false,
            notes: null,
            createdAt: '2026-11-16T00:00:00.000Z',
            plates: [{ id: 'p1', plate: 'ABC123', isDefault: true, createdAt: '2026-11-16' }],
          },
          {
            id: 'm2',
            membershipNumber: '54321',
            firstName: 'TEST',
            lastName: 'USER',
            email: null,
            phone: null,
            parkingTypeId: 't1',
            parkingTypeName: 'RAYC',
            isActive: false,
            isTest: true,
            notes: null,
            createdAt: '2026-11-16T00:00:00.000Z',
            plates: [],
          },
        ],
        types: [{ id: 't1', name: 'RAYC', isActive: true }],
        timezone: 'Pacific/Auckland',
      }),
    )

    render(<ParkingMembersPanel role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    expect(await screen.findByText(/12345 · JANE DOE/)).toBeInTheDocument()
    expect(screen.getByText(/54321 · TEST USER/)).toBeInTheDocument()
    expect(screen.getByText('TEST')).toBeInTheDocument()
    expect(screen.getByText(/ABC123/)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/parking/ftp/test-members?venueId=v1')
  })
})
