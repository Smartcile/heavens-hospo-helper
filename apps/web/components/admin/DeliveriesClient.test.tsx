import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}))

import { DeliveriesClient } from '@/components/admin/DeliveriesClient'

const payload = {
  deliveries: [
    {
      id: 'dl1',
      supplierId: 's1',
      supplierName: 'BIDFOOD',
      deliveredAt: '2026-08-13T07:30:00Z',
      vehicleTemp: 4.5,
      vehicleVerdict: 'PASS',
      invoiceRef: 'INV-9',
      notes: null,
      receivedBy: { id: 'st1', firstName: 'ALEX', lastName: 'CHEN' },
      supplier: { id: 's1', name: 'BIDFOOD' },
      items: [
        { id: 'di1', inventoryItemId: 'i1', itemName: 'MILK', storageType: 'CHILLED', qty: 10, unit: 'L', temp: 4.2, verdict: 'PASS', disposition: 'ACCEPTED', note: null },
        { id: 'di2', inventoryItemId: 'i2', itemName: 'CHICKEN', storageType: 'FROZEN', qty: 5, unit: 'KG', temp: -12, verdict: 'FAIL', disposition: 'REJECTED', note: 'THAWED' },
      ],
    },
  ],
  catalog: [
    { id: 'i1', name: 'MILK', storageType: 'CHILLED', unit: 'L' },
    { id: 'i2', name: 'CHICKEN', storageType: 'FROZEN', unit: 'KG' },
  ],
  suppliers: [{ id: 's1', name: 'BIDFOOD' }],
}

function mockRoutes(routes: Record<string, unknown>) {
  return vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    const hit = Object.entries(routes).find(([key]) => url.includes(key))?.[1]
    return {
      ok: true,
      json: async () => hit ?? [],
    } as Response
  })
}

describe('DeliveriesClient', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('renders the delivery list with per-line verdicts', async () => {
    mockRoutes({ deliveries: payload })

    render(<DeliveriesClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    expect(await screen.findByText('DELIVERIES')).toBeDefined()
    expect(screen.getByText('BIDFOOD')).toBeDefined()
    expect(screen.getAllByText('PASS').length).toBeGreaterThan(0)
    expect(screen.getAllByText('FAIL').length).toBeGreaterThan(0)
    expect(screen.getByText(/1 FAILED LINE/)).toBeDefined() // failed-line alert link
    expect(screen.getByText('REJECTED')).toBeDefined()
    expect(screen.getByText('THAWED')).toBeDefined()
  })

  it('POSTs a new delivery with verdicts computed for each line', async () => {
    const fetchMock = mockRoutes({ deliveries: payload })

    render(<DeliveriesClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findByText('DELIVERIES')
    fireEvent.click(screen.getByText('+ NEW DELIVERY'))

    // Supplier + vehicle temp
    const supplierSelect = screen.getAllByRole('combobox')[0]
    fireEvent.change(supplierSelect, { target: { value: 's1' } })
    const vehicle = screen.getByLabelText('VEHICLE TEMP (°C)') as HTMLInputElement
    fireEvent.change(vehicle, { target: { value: '4' } })

    // Add a product line
    const search = screen.getByPlaceholderText('SEARCH INVENTORY…') as HTMLInputElement
    fireEvent.change(search, { target: { value: 'MILK' } })
    const milkButtons = await screen.findAllByText('MILK')
    fireEvent.click(milkButtons[milkButtons.length - 1]) // the dropdown result (list behind the modal also matches)

    // Fill temp on the new line (the last line block)
    const tempInputs = screen.getAllByLabelText('TEMP °C')
    fireEvent.change(tempInputs[tempInputs.length - 1], { target: { value: '6' } })

    fireEvent.click(screen.getByText('RECORD DELIVERY'))
    await waitFor(() => {
      const post = fetchMock.mock.calls.find((c) => c[0] === '/api/admin/deliveries' && c[1]?.method === 'POST')
      expect(post).toBeDefined()
      const body = JSON.parse(post![1].body as string)
      expect(body.supplierId).toBe('s1')
      expect(body.vehicleTemp).toBe(4)
      expect(body.items).toHaveLength(1)
      expect(body.items[0].inventoryItemId).toBe('i1')
      expect(body.items[0].temp).toBe(6)
    })
  })
})
