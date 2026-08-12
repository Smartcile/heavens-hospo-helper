import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { InventoryClient } from './InventoryClient'

const CATEGORY = { id: 'c-food', name: 'FOOD', isBuiltIn: false, venueId: null, tab: 'FOOD', showDeepFields: true, showEquipmentFields: false }
const FLOUR = {
  id: 'i-flour',
  name: 'FLOUR - 00',
  categoryId: 'c-food',
  unit: 'EA',
  defaultParLevel: 0,
  totalQty: 0,
  placedCount: 0,
  category: { id: 'c-food', name: 'FOOD', tab: 'FOOD' },
  densityGramsPerMl: null,
  weightPerUnitGrams: null,
}
const REFS = [{ id: 'r1', name: 'FLOUR - 00', densityGramsPerMl: 0.528, weightPerUnitGrams: null, notes: '1 CUP ≈ 132G', isBuiltIn: true }]

let putBody: any = null

function mockFetch() {
  vi.spyOn(global, 'fetch').mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (url.includes('/api/admin/inventory/categories')) {
      return Promise.resolve({ ok: true, json: async () => [CATEGORY] } as Response)
    }
    if (url.includes('/api/admin/ingredient-references')) {
      return Promise.resolve({ ok: true, json: async () => REFS } as Response)
    }
    if (url.includes('/api/admin/stock/hierarchy')) {
      return Promise.resolve({ ok: true, json: async () => ({ sections: [] }) } as Response)
    }
    if (url.includes('/api/admin/inventory/') && method === 'PUT') {
      putBody = JSON.parse(String(init?.body))
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
    }
    if (url.includes('/api/admin/inventory')) {
      return Promise.resolve({ ok: true, json: async () => [FLOUR] } as Response)
    }
    return Promise.resolve({ ok: true, json: async () => [] } as Response)
  })
}

describe('InventoryClient — density capture', () => {
  beforeEach(() => {
    putBody = null
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockFetch()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function openFlourModal() {
    render(<InventoryClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'FOOD' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'FOOD' }))
    await waitFor(() => expect(screen.getAllByText(/^FLOUR - 00/).length).toBeGreaterThan(0))
    // The FOOD item row carries the CUSTOM badge; the pantry box row carries PANTRY BIBLE.
    const nameEl = screen.getAllByText(/^FLOUR - 00/).find((el) => el.textContent?.includes('CUSTOM'))
    const row = nameEl?.closest('div')?.parentElement
    expect(row).toBeTruthy()
    const edit = within(row as HTMLElement).getByRole('button', { name: 'EDIT' })
    fireEvent.click(edit)
    await waitFor(() => expect(screen.getByText('DENSITY — CONVERTS VOLUME ↔ WEIGHT')).toBeTruthy())
  }

  it('auto-suggests a known ingredient density and applies it on click', async () => {
    await openFlourModal()
    await waitFor(() => expect(screen.getByText(/KNOWN: FLOUR - 00/)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'APPLY DENSITY?' }))
    expect((screen.getByPlaceholderText('e.g. 0.528') as HTMLInputElement).value).toBe('0.528')
  })

  it('converts a "1 CUP = X G" weight to g/mL and saves it', async () => {
    await openFlourModal()
    fireEvent.change(screen.getByPlaceholderText('e.g. 132'), { target: { value: '132' } })
    await waitFor(() => expect(screen.getAllByText(/1 CUP ≈ 132G/).length).toBeGreaterThan(0))

    fireEvent.click(screen.getByRole('button', { name: 'SAVE' }))

    await waitFor(() => expect(putBody).toBeTruthy())
    expect(putBody.densityGramsPerMl).toBeCloseTo(0.528, 3)
    expect(putBody.weightPerUnitGrams).toBeNull()
  })
})
