import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { PositionsPanel } from '@/components/admin/PositionsPanel'

const POSITIONS = [
  { id: 'p1', name: 'BARTENDER', colour: null, departmentId: 'd1', department: { id: 'd1', name: 'FOH' }, _count: { staff: 3 } },
  { id: 'p2', name: 'DUTY MANAGER', colour: null, departmentId: null, department: null, _count: { staff: 1 } },
]
const DEPARTMENTS = [{ id: 'd1', name: 'FOH', venueId: 'v1' }]

function mockFetch(positions = POSITIONS) {
  return vi.fn((url: string) => {
    if (url.startsWith('/api/admin/positions')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(positions) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(DEPARTMENTS) })
  }) as unknown as typeof fetch
}

describe('PositionsPanel', () => {
  beforeEach(() => { globalThis.fetch = mockFetch() })
  afterEach(() => { vi.restoreAllMocks() })

  it('lists positions with their department and staff count', async () => {
    render(<PositionsPanel venueId="v1" />)
    await waitFor(() => expect(screen.getByText('BARTENDER')).toBeTruthy())
    expect(screen.getByText(/FOH · 3 STAFF/)).toBeTruthy()
  })

  // A role like DUTY MANAGER deliberately has no department — it spans all of
  // them — and must not render as though it were unassigned by mistake.
  it('shows ALL DEPARTMENTS for a position with no department', async () => {
    render(<PositionsPanel venueId="v1" />)
    await waitFor(() => expect(screen.getByText('DUTY MANAGER')).toBeTruthy())
    expect(screen.getByText(/ALL DEPARTMENTS · 1 STAFF/)).toBeTruthy()
  })

  it('shows an empty state when there are no positions', async () => {
    globalThis.fetch = mockFetch([])
    render(<PositionsPanel venueId="v1" />)
    await waitFor(() => expect(screen.getByText('NO POSITIONS YET.')).toBeTruthy())
  })

  it('does not POST when the name is blank', async () => {
    render(<PositionsPanel venueId="v1" />)
    await waitFor(() => expect(screen.getByText('BARTENDER')).toBeTruthy())
    fireEvent.click(screen.getByText('+ ADD'))
    const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
    expect(calls.some((c) => (c[1] as { method?: string } | undefined)?.method === 'POST')).toBe(false)
  })

  it('POSTs the new position with the active venue', async () => {
    render(<PositionsPanel venueId="v1" />)
    await waitFor(() => expect(screen.getByText('BARTENDER')).toBeTruthy())

    fireEvent.change(screen.getByPlaceholderText('BARTENDER'), { target: { value: 'BARISTA' } })
    fireEvent.click(screen.getByText('+ ADD'))

    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
      const post = calls.find((c) => (c[1] as { method?: string } | undefined)?.method === 'POST')
      expect(post).toBeTruthy()
      expect(JSON.parse((post![1] as { body: string }).body)).toMatchObject({
        name: 'BARISTA',
        venueId: 'v1',
      })
    })
  })
})
