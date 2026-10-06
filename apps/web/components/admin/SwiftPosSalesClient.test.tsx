import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { SwiftPosSalesClient } from '@/components/admin/SwiftPosSalesClient'

vi.mock('@/components/ui/Toast', () => ({ pushToast: vi.fn() }))
vi.mock('@/lib/active-venue', () => ({ getActiveVenueId: () => 'v1' }))

const REPORT = {
  from: '2026-10-06',
  to: '2026-10-06',
  products: 3,
  mapped: 2,
  totalQty: 20,
  matchedQty: 15,
  matched: [
    { inventoryCode: 'TAP ASAHI', label: 'Asahi', qty: 12, gross: 168, net: 146, itemId: 'm1', itemName: 'ASAHI TAP', serveSummary: '400ML · KEG-ASAHI' },
  ],
  unmatched: [{ inventoryCode: 'MYSTERY', label: 'Mystery', qty: 5, gross: 40, net: 35 }],
  consumption: {
    matchedQty: 15,
    totalQty: 20,
    drawdown: [{ inventoryItemId: 'i1', name: 'KEG-ASAHI', qty: 4800, unit: 'BASE', currentQty: 3000, variance: -1800 }],
    errors: ['SOMETHING — NO SERVES'],
  },
}

function mockFetch() {
  return vi.fn((url: string) => {
    const json = (d: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(d) })
    const u = String(url)
    if (u.startsWith('/api/admin/swiftpos/sales')) return json(REPORT)
    if (u.startsWith('/api/admin/venues')) return json([{ id: 'v1', name: 'DEMO', swiftPosBaseUrl: 'http://swift:5080' }])
    return json(null)
  }) as unknown as typeof fetch
}

describe('SwiftPosSalesClient', () => {
  beforeEach(() => { globalThis.fetch = mockFetch() })
  afterEach(() => { vi.restoreAllMocks() })

  it('loads the venue URL and renders the matched/unmatched sales and drawdown', async () => {
    render(<SwiftPosSalesClient role="ADMIN" sessionVenueId="v1" />)

    // The venue's SwiftDOSnet URL pre-fills the connection field.
    await waitFor(() => expect(screen.getByDisplayValue('http://swift:5080')).toBeTruthy())

    fireEvent.click(screen.getByText('↻ RUN — PULL + DRAWDOWN'))

    await waitFor(() => expect(screen.getByText('ASAHI TAP')).toBeTruthy())
    expect(screen.getByText('MYSTERY')).toBeTruthy() // unmatched mapping gap
    expect(screen.getByText('KEG-ASAHI')).toBeTruthy() // drawdown row
    expect(screen.getByText('-1800')).toBeTruthy() // negative variance
    expect(screen.getByText('SOMETHING — NO SERVES')).toBeTruthy() // expansion problem
  })
})
