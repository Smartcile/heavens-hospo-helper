import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { PantryBibleClient } from '@/components/admin/PantryBibleClient'

const REFS = [
  { id: 'r1', name: 'FLOUR - 00', densityGramsPerMl: 0.528, weightPerUnitGrams: null, notes: '1 CUP ≈ 132G', isBuiltIn: true, venueId: null },
  { id: 'r2', name: 'HOUSE SPICE MIX', densityGramsPerMl: null, weightPerUnitGrams: 12, notes: null, isBuiltIn: false, venueId: 'v1' },
]

let deleted: string | null = null

function mockFetch() {
  vi.spyOn(global, 'fetch').mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('/api/admin/ingredient-references') && (init?.method ?? 'GET') === 'DELETE') {
      deleted = new URL(url, 'http://localhost').searchParams.get('id')
      return Promise.resolve({ ok: true, json: async () => ({ success: true }) } as Response)
    }
    if (url.includes('/api/admin/ingredient-references')) {
      return Promise.resolve({ ok: true, json: async () => REFS } as Response)
    }
    return Promise.resolve({ ok: true, json: async () => [] } as Response)
  })
}

describe('PantryBibleClient', () => {
  afterEach(() => {
    deleted = null
    vi.restoreAllMocks()
  })

  it('lists references with their density values and built-in/custom badges', async () => {
    mockFetch()
    render(<PantryBibleClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)
    expect(await screen.findByText('FLOUR - 00')).toBeTruthy()
    expect(screen.getAllByText('1 CUP ≈ 132G').length).toBeGreaterThan(0)
    expect(screen.getByText('BUILT-IN')).toBeTruthy()
    expect(screen.getByText('HOUSE SPICE MIX')).toBeTruthy()
    expect(screen.getByText('1 EA ≈ 12G')).toBeTruthy()
    expect(screen.getByText('CUSTOM')).toBeTruthy()
  })

  it('filters the list by search', async () => {
    mockFetch()
    render(<PantryBibleClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)
    await screen.findByText('FLOUR - 00')
    fireEvent.change(screen.getByPlaceholderText('SEARCH LIBRARY...'), { target: { value: 'spice' } })
    expect(screen.queryByText('FLOUR - 00')).toBeNull()
    expect(screen.getByText('HOUSE SPICE MIX')).toBeTruthy()
  })

  it('deletes only venue-owned references', async () => {
    mockFetch()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<PantryBibleClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)
    await screen.findByText('FLOUR - 00')

    expect(screen.queryByLabelText('Delete FLOUR - 00')).toBeNull()
    fireEvent.click(screen.getByLabelText('Delete HOUSE SPICE MIX'))
    await waitFor(() => expect(deleted).toBe('r2'))
  })
})
