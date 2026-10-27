import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { KitchenDocketsClient } from '@/components/admin/KitchenDocketsClient'

vi.mock('@/lib/active-venue', () => ({ getActiveVenueId: () => 'v1' }))

const PAYLOAD = {
  venueName: 'DEMO',
  minutes: 60,
  from: '2026-10-27 17:00',
  to: '2026-10-27 18:00',
  generatedAt: '2026-10-27T05:00:00.000Z',
  dockets: [
    {
      transactionId: 9001,
      tableNumber: 12,
      tableName: 'Table 12',
      booking: 'SMITH',
      covers: 4,
      clerk: '7 (Jane)',
      terminal: 'BAR',
      opened: '2026-10-27 18:03:12',
      lines: [
        { detailId: 1, addedAt: '2026-10-27 18:04:00', inventoryCode: 'STEAK', description: 'STEAK', quantity: 2, value: 60, seat: 2, clerk: 7, printGroup: 'GRILL', pluText: '', system: false, instruction: false },
        { detailId: 2, addedAt: '2026-10-27 18:04:00', inventoryCode: '', description: 'NO SAUCE', quantity: 0, value: 0, seat: null, clerk: 7, printGroup: 'GRILL', pluText: '', system: false, instruction: true },
      ],
    },
    {
      transactionId: 9002,
      tableNumber: 3,
      tableName: 'Table 3',
      booking: '',
      covers: 2,
      clerk: '4',
      terminal: 'FOH',
      opened: '2026-10-27 17:45:00',
      lines: [
        { detailId: 3, addedAt: '2026-10-27 17:46:00', inventoryCode: 'LAGER', description: 'LAGER', quantity: 1, value: 9, seat: null, clerk: 4, printGroup: 'BAR', pluText: '', system: false, instruction: false },
      ],
    },
  ],
}

let calls = 0

function mockFetch(payload: unknown = PAYLOAD) {
  return vi.fn((url: string) => {
    if (String(url).startsWith('/api/admin/swiftpos/dockets')) {
      calls++
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(payload) })
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(null) })
  }) as unknown as typeof fetch
}

describe('KitchenDocketsClient', () => {
  beforeEach(() => {
    calls = 0
    globalThis.fetch = mockFetch()
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('renders open dockets with their lines and nested instructions', async () => {
    render(<KitchenDocketsClient role="ADMIN" sessionVenueId="v1" />)

    await waitFor(() => expect(screen.getByText('SMITH')).toBeTruthy())
    expect(screen.getByText('STEAK')).toBeTruthy()
    expect(screen.getByText('NO SAUCE')).toBeTruthy()
    expect(screen.getByText('LAGER')).toBeTruthy()
    expect(screen.getByText('2×')).toBeTruthy()
    expect(screen.getByText(/4 COVERS/)).toBeTruthy()
  })

  it('re-fetches on manual refresh', async () => {
    render(<KitchenDocketsClient role="ADMIN" sessionVenueId="v1" />)
    await waitFor(() => expect(calls).toBe(1))

    fireEvent.click(screen.getByText('↻ REFRESH'))
    await waitFor(() => expect(calls).toBe(2))
  })

  it('shows the not-connected error', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'SWIFTPOS NOT CONNECTED — SET THE SWIFTDOSNET URL ON THE VENUE' }),
    })) as unknown as typeof fetch

    render(<KitchenDocketsClient role="ADMIN" sessionVenueId="v1" />)
    await waitFor(() => expect(screen.getByText(/SWIFTPOS NOT CONNECTED/)).toBeTruthy())
  })

  it('shows the SwiftDOSnet 502 message', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: false,
      status: 502,
      json: () => Promise.resolve({ error: 'COULD NOT REACH SWIFTDOSNET: SwiftDOSnet returned 500 — Kitchen dockets are unavailable' }),
    })) as unknown as typeof fetch

    render(<KitchenDocketsClient role="ADMIN" sessionVenueId="v1" />)
    await waitFor(() => expect(screen.getByText(/Kitchen dockets are unavailable/i)).toBeTruthy())
  })
})
