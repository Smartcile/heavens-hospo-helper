import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
            savePlates: true,
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
            savePlates: false,
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
    expect(screen.getByText('NOT SAVED')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/parking/ftp/test-members?venueId=v1')
  })

  it('saves the SAVE NUMBER PLATES toggle from the member form', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        members: [
          {
            id: 'm1',
            membershipNumber: '12345',
            firstName: 'JANE',
            lastName: 'DOE',
            email: null,
            phone: null,
            parkingTypeId: 't1',
            parkingTypeName: 'RAYC',
            isActive: true,
            isTest: false,
            savePlates: false,
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
    await screen.findByText(/12345 · JANE DOE/)

    fireEvent.click(screen.getByRole('button', { name: 'EDIT' }))
    const checkbox = screen.getByRole('checkbox', { name: 'SAVE NUMBER PLATES' })
    expect(checkbox).not.toBeChecked()

    fireEvent.click(checkbox)
    fireEvent.click(screen.getByRole('button', { name: 'SAVE MEMBER' }))

    await waitFor(() => {
      const put = fetchMock.mock.calls.find((call) => call[1]?.method === 'PUT')
      expect(put).toBeTruthy()
      expect(JSON.parse(String(put?.[1]?.body))).toMatchObject({ savePlates: true })
    })
  })

  it('sets a saved plate as the default from the member row', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        members: [
          {
            id: 'm1',
            membershipNumber: '12345',
            firstName: 'JANE',
            lastName: 'DOE',
            email: null,
            phone: null,
            parkingTypeId: 't1',
            parkingTypeName: 'RAYC',
            isActive: true,
            isTest: false,
            savePlates: true,
            notes: null,
            createdAt: '2026-11-16T00:00:00.000Z',
            plates: [
              { id: 'p1', plate: 'ABC123', isDefault: true, createdAt: '2026-11-16' },
              { id: 'p2', plate: 'XYZ789', isDefault: false, createdAt: '2026-11-17' },
            ],
          },
        ],
        types: [{ id: 't1', name: 'RAYC', isActive: true }],
        timezone: 'Pacific/Auckland',
      }),
    )

    render(<ParkingMembersPanel role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)
    await screen.findByText(/ABC123/)

    fireEvent.click(screen.getByRole('button', { name: 'Set plate XYZ789 as default' }))

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find((call) => call[1]?.method === 'PATCH')
      expect(patch).toBeTruthy()
      expect(String(patch?.[0])).toBe(
        '/api/admin/parking/ftp/test-members/m1/plates/p2?venueId=v1',
      )
      expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ action: 'SET_DEFAULT' })
    })
  })
})
