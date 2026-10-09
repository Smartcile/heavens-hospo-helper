import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { RosterClient } from '@/components/admin/RosterClient'
import { keyOfDay, mondayOf, shiftDay } from '@/lib/date-nav'

// The roster grid renders the CURRENT week, so the mocked shift must land on
// this week's Monday or the block never appears (date-dependent test break).
const monday = mondayOf(keyOfDay(new Date()))

const data = {
  staff: [
    { id: 'st1', firstName: 'LIAM', lastName: 'HEAVEN', hourlyRate: 25, employmentType: 'FULL_TIME', departmentName: 'BAR', positions: [{ id: 'p1', name: 'BARISTA', colour: '#60A5FA' }] },
  ],
  shifts: [
    { id: 'sh1', staffId: 'st1', date: monday, startTime: '07:00', endTime: '16:00', breakMinutes: 30, colour: null, tag: null, status: 'PUBLISHED', positionName: 'BARISTA', positionColour: '#60A5FA' },
  ],
  blockedDays: {},
  availability: {},
  budgetedSalesByDate: { [monday]: 1000 },
  summary: { totalCost: 212.5, budgetedSales: 1000, staffingRatio: 21.25, totalPaidHours: 8.5 },
}

// A casual who has opted in on Monday and blocked Tuesday, plus a FT with no
// entries (implied available — no badge).
const availData = {
  staff: [
    { id: 'st1', firstName: 'LIAM', lastName: 'HEAVEN', hourlyRate: 25, employmentType: 'FULL_TIME', departmentName: 'BAR', positions: [] },
    { id: 'st2', firstName: 'TAYLOR', lastName: 'REED', hourlyRate: 22, employmentType: 'CASUAL', departmentName: 'FOH', positions: [] },
  ],
  shifts: [],
  blockedDays: {},
  availability: {
    st2: {
      [monday]: { id: 'a1', type: 'AVAILABLE', isAllDay: true, startTime: null, endTime: null, windows: [], status: 'APPROVED', timeOff: false, notes: null },
      [shiftDay(monday, 1)]: {
        id: 'a2', type: 'UNAVAILABLE', isAllDay: false, startTime: '09:00', endTime: '17:00',
        windows: [{ type: 'UNAVAILABLE', startTime: '09:00', endTime: '17:00' }],
        status: 'PENDING', timeOff: false, notes: 'UNI',
      },
    },
  },
  budgetedSalesByDate: {},
  summary: { totalCost: 0, budgetedSales: 0, staffingRatio: 0, totalPaidHours: 0 },
}

function mockFetch(responses: unknown[]) {
  const spy = vi.spyOn(global, 'fetch')
  let i = 0
  spy.mockImplementation(async () => {
    const r = responses[Math.min(i, responses.length - 1)]
    i += 1
    return { ok: true, json: async () => r } as Response
  })
}

describe('RosterClient', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('renders the roster grid with staff, shift blocks and summary footer', async () => {
    mockFetch([[], [], data]) // venues, positions, roster

    render(<RosterClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    expect(await screen.findByText('ROSTER EDITOR')).toBeDefined()
    await waitFor(() => {
      expect(screen.getByText(/LIAM HEAVEN/)).toBeDefined()
      expect(screen.getByText(/07:00 — 16:00/)).toBeDefined()
      expect(screen.getByText(/TOTAL COST/)).toBeDefined()
      expect(screen.getAllByText(/\$212\.50/).length).toBeGreaterThan(0)
      expect(screen.getByText(/BUDGETED SALES \(EXCL GST\)/)).toBeDefined()
      expect(screen.getByText(/STAFFING RATIO/)).toBeDefined()
      expect(screen.getByText(/21\.25%/)).toBeDefined()
      expect(screen.getByText(/TOTAL PAID HOURS/)).toBeDefined()
    })
  })

  it('shows toolbar controls: DAY/WEEK, TODAY, PRINT, PUBLISH, ANALYZE, VISUALIZE', async () => {
    mockFetch([[], [], data])

    render(<RosterClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    expect(await screen.findByText('PRINT')).toBeDefined()
    expect(screen.getByText('DAY')).toBeDefined()
    expect(screen.getByText('WEEK')).toBeDefined()
    expect(screen.getAllByText('TODAY').length).toBeGreaterThan(0)
    expect(screen.getByText('ANALYZE')).toBeDefined()
    expect(screen.getByText('VISUALIZE')).toBeDefined()
    expect(screen.getByText(/PUBLISH/)).toBeDefined()
    // Venue switching lives in the sidebar switcher — no in-page venue select.
    expect(screen.queryByText('Venue')).toBeNull()
  })

  it('uses the shared date nav and toggles compact density', async () => {
    mockFetch([[], [], data])

    render(<RosterClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    // DateNav (same control as Clocks) renders its SELECT trigger.
    expect(await screen.findByTitle('SELECT DATE')).toBeDefined()

    const compact = screen.getByText('COMPACT')
    expect(compact.className).not.toContain('bg-white')
    compact.click()
    await waitFor(() => expect(compact.className).toContain('bg-white'))
  })

  it('opens the analyze modal with per-role totals', async () => {
    mockFetch([[], [], data])

    render(<RosterClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    const analyze = await screen.findByText('ANALYZE')
    analyze.click()
    await waitFor(() => {
      expect(screen.getByText(/ROLE ANALYSIS/)).toBeDefined()
      expect(screen.getAllByText(/BARISTA/).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/8\.50HRS/).length).toBeGreaterThan(0)
    })
  })

  it('overlays availability badges on the grid and shows the legend', async () => {
    mockFetch([[], [], availData])

    render(<RosterClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await waitFor(() => {
      expect(screen.getByText(/TAYLOR REED/)).toBeDefined()
    })
    // AVAILABLE on Monday, UNAVAILABLE on Tuesday, UNSET for the casual's other days.
    expect(screen.getAllByText('AVAILABLE').length).toBeGreaterThan(0)
    expect(screen.getAllByText('UNAVAILABLE').length).toBeGreaterThan(0)
    expect(screen.getAllByText('UNSET').length).toBeGreaterThan(0)
    // A pending declaration carries its PENDING chip on the grid.
    expect(screen.getAllByText('PENDING').length).toBeGreaterThan(0)
    // Legend.
    expect(screen.getByText('Unavailable')).toBeDefined()
    expect(screen.getByText('Available')).toBeDefined()
    expect(screen.getByText(/Unset \(casual\)/)).toBeDefined()
  })

  it('groups staff under position headers and toggles the grouped view', async () => {
    const positioned = {
      ...data,
      staff: [{ ...data.staff[0], positions: [{ id: 'p1', name: 'BARISTA', colour: '#60A5FA' }] }],
    }
    mockFetch([[], [{ id: 'p1', name: 'BARISTA', colour: '#60A5FA' }], positioned])

    render(<RosterClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findByText(/LIAM HEAVEN/)
    // Group header label + the staff cell's position line + the shift block.
    expect(screen.getAllByText('BARISTA').length).toBe(3)

    fireEvent.click(screen.getByText('GROUP'))
    await waitFor(() => expect(screen.getAllByText('BARISTA').length).toBe(2))
  })
})
