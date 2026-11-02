import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}))

import { WorkerDeliveriesClient } from '@/components/worker/WorkerDeliveriesClient'

const payload = {
  deliveries: [
    {
      id: 'dl1',
      supplierName: 'BIDFOOD',
      deliveredAt: '2026-08-13T07:30:00Z',
      vehicleTemp: 4.5,
      vehicleVerdict: 'PASS',
      receivedBy: { id: 'st1', firstName: 'ALEX', lastName: 'CHEN' },
      items: [
        { id: 'di1', itemName: 'MILK', storageType: 'CHILLED', qty: 10, unit: 'L', temp: 4.2, verdict: 'PASS', disposition: 'ACCEPTED' },
        { id: 'di2', itemName: 'CHICKEN', storageType: 'FROZEN', qty: 5, unit: 'KG', temp: -12, verdict: 'FAIL', disposition: 'REJECTED' },
      ],
    },
  ],
  catalog: [
    { id: 'i1', name: 'MILK', storageType: 'CHILLED', unit: 'L' },
    { id: 'i2', name: 'CHICKEN', storageType: 'FROZEN', unit: 'KG' },
  ],
  suppliers: [{ id: 's1', name: 'BIDFOOD' }],
  firstName: 'ALEX',
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

describe('WorkerDeliveriesClient', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('lists recent deliveries with PASS/FAIL verdicts', async () => {
    mockRoutes({ deliveries: payload })

    render(<WorkerDeliveriesClient />)

    expect(await screen.findByText('DELIVERIES')).toBeDefined()
    expect(screen.getByText('BIDFOOD')).toBeDefined()
    expect(screen.getByText(/1 FAILED/)).toBeDefined()
    expect(screen.getAllByText('PASS').length).toBeGreaterThan(0)
    expect(screen.getAllByText('FAIL').length).toBeGreaterThan(0)
  })

  it('POSTs the receipt with product, temp and verdict fields', async () => {
    const fetchMock = mockRoutes({ deliveries: payload })

    render(<WorkerDeliveriesClient />)

    await screen.findByText('DELIVERIES')
    fireEvent.click(screen.getByText('+ RECEIVE'))

    // Supplier
    const combos = screen.getAllByRole('combobox')
    fireEvent.change(combos[0], { target: { value: 's1' } })

    // Add a product line
    const search = screen.getByPlaceholderText('SEARCH PRODUCTS…') as HTMLInputElement
    fireEvent.change(search, { target: { value: 'CHICKEN' } })
    const hits = await screen.findAllByText('CHICKEN')
    fireEvent.click(hits[hits.length - 1]) // the dropdown result (the list behind the modal also matches)

    // Set its temp (the line inputs are placeholder-driven on mobile)
    const tempInputs = screen.getAllByPlaceholderText('TEMP °C')
    fireEvent.change(tempInputs[tempInputs.length - 1], { target: { value: '-12' } })

    fireEvent.click(screen.getByText('RECORD DELIVERY'))
    await waitFor(() => {
      const post = fetchMock.mock.calls.find((c) => c[0] === '/api/worker/deliveries' && c[1]?.method === 'POST')
      expect(post).toBeDefined()
      const body = JSON.parse(post![1].body as string)
      expect(body.supplierId).toBe('s1')
      expect(body.items).toHaveLength(1)
      expect(body.items[0].inventoryItemId).toBe('i2')
      expect(body.items[0].temp).toBe(-12)
      expect(body.items[0].storageType).toBe('FROZEN')
    })
  })
})
