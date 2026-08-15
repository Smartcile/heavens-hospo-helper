import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

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
    positions: [{ position: { name: 'BARISTA', colour: '#60A5FA' } }],
  },
}

function mockFetch(data: unknown, ok = true) {
  return vi.spyOn(global, 'fetch').mockResolvedValue({
    ok,
    json: async () => data,
  } as Response)
}

describe('ClocksClient', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('renders the STAFF CLOCKS table with row data', async () => {
    mockFetch([]) // staff
    mockFetch([row]) // clocks

    render(<ClocksClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    expect(await screen.findByText('STAFF CLOCKS')).toBeDefined()
    await waitFor(() => {
      expect(screen.getByText(/LIAM HEAVEN/)).toBeDefined()
      expect(screen.getByText(/BARISTA/)).toBeDefined()
      expect(screen.getAllByText(/30M/).length).toBeGreaterThan(0) // breaks + worked
      expect(screen.getByText(/\$25\.00/)).toBeDefined() // rate
      expect(screen.getByText(/PENDING/)).toBeDefined()
    })
  })

  it('shows APPROVED badge and hides approve/reject for approved rows', async () => {
    mockFetch([])
    mockFetch([{ ...row, approvalStatus: 'APPROVED' }])

    render(<ClocksClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await waitFor(() => {
      expect(screen.getByText(/APPROVED/)).toBeDefined()
      expect(screen.queryByText('APPROVE')).toBeNull()
    })
  })

  it('has ADD CLOCK, VIEW EDITS and SHOW DELETED controls', async () => {
    mockFetch([])
    mockFetch([])

    render(<ClocksClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    expect(await screen.findByText('+ ADD CLOCK')).toBeDefined()
    expect(screen.getByText('VIEW EDITS')).toBeDefined()
    expect(screen.getByText('SHOW DELETED CLOCKS')).toBeDefined()
    // Venue switching lives in the sidebar switcher — no in-page venue select.
    expect(screen.queryByText('Venue')).toBeNull()
  })

  it('renders TOTAL ROWS footer', async () => {
    mockFetch([])
    mockFetch([row, { ...row, id: 'tc2' }])

    render(<ClocksClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await waitFor(() => {
      expect(screen.getByText(/TOTAL ROWS: 2/)).toBeDefined()
    })
  })
})
