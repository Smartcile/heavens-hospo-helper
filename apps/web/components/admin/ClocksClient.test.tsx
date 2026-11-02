import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}))

import { ClocksClient } from '@/components/admin/ClocksClient'

const row = {
  id: 'tc1',
  staffId: 's1',
  clockIn: '2026-08-10T09:00:00Z',
  clockOut: '2026-08-10T17:00:00Z',
  isActive: false,
  geoValid: true,
  note: null,
  breaksMinutes: 30,
  approvalStatus: 'PENDING',
  rejectedReason: null,
  source: 'WORKER',
  staff: {
    firstName: 'LIAM',
    lastName: 'HEAVEN',
    hourlyRate: 25,
    department: { name: 'BAR' },
    positions: [{ position: { id: 'p1', name: 'BARISTA', colour: '#60A5FA' } }],
  },
}

function mockFetch(routes: Record<string, unknown>) {
  return vi.spyOn(global, 'fetch').mockImplementation(async (url: unknown) => {
    const u = String(url)
    const hit = Object.entries(routes).find(([key]) => u.includes(key))
    return { ok: true, json: async () => (hit ? hit[1] : []) } as Response
  })
}

const routes = (clocks: unknown, positions: unknown = []) => ({
  '/api/admin/staff': [],
  '/api/admin/positions': positions,
  '/api/admin/timeclock?': clocks,
})

describe('ClocksClient', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('renders the STAFF CLOCKS table with row data', async () => {
    mockFetch(routes([row]))

    render(<ClocksClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    expect(await screen.findByText('STAFF CLOCKS')).toBeDefined()
    await waitFor(() => {
      expect(screen.getByText(/LIAM HEAVEN/)).toBeDefined()
      // The group header and the row's ROLE cell both print the position.
      expect(screen.getAllByText(/BARISTA/).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/30M/).length).toBeGreaterThan(0) // breaks + worked
      expect(screen.getByText(/\$25\.00/)).toBeDefined() // rate
      expect(screen.getByText(/PENDING/)).toBeDefined()
    })
  })

  it('shows APPROVED badge and hides approve/reject for approved rows', async () => {
    mockFetch(routes([{ ...row, approvalStatus: 'APPROVED' }]))

    render(<ClocksClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await waitFor(() => {
      expect(screen.getByText(/APPROVED/)).toBeDefined()
      expect(screen.queryByText('APPROVE')).toBeNull()
    })
  })

  it('has ADD CLOCK, VIEW EDITS, SHOW DELETED and GROUP controls', async () => {
    mockFetch(routes([]))

    render(<ClocksClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    expect(await screen.findByText('+ ADD CLOCK')).toBeDefined()
    expect(screen.getByText('VIEW EDITS')).toBeDefined()
    expect(screen.getByText('SHOW DELETED CLOCKS')).toBeDefined()
    expect(screen.getByText('GROUP')).toBeDefined()
    // Venue switching lives in the sidebar switcher — no in-page venue select.
    expect(screen.queryByText('Venue')).toBeNull()
  })

  it('renders TOTAL ROWS footer', async () => {
    mockFetch(routes([row, { ...row, id: 'tc2' }]))

    render(<ClocksClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await waitFor(() => {
      expect(screen.getByText(/TOTAL ROWS: 2/)).toBeDefined()
    })
  })

  it('groups clock sessions under position headers and toggles the grouped view', async () => {
    mockFetch(routes([row, { ...row, id: 'tc2' }], [{ id: 'p1', name: 'BARISTA', colour: '#60A5FA' }]))

    render(<ClocksClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText(/LIAM HEAVEN/)
    // Group header + two ROLE cells.
    expect(screen.getAllByText('BARISTA').length).toBe(3)

    fireEvent.click(screen.getByText('GROUP'))
    await waitFor(() => expect(screen.getAllByText('BARISTA').length).toBe(2))
  })
})
