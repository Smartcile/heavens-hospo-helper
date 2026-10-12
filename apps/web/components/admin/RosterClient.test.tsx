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
    // AVAILABLE on Monday; the Tuesday block-out leaves the rest of the day
    // free, so it reads SPLIT (not a blanket UNAVAILABLE); UNSET for the
    // casual's other days.
    expect(screen.getAllByText('AVAILABLE').length).toBeGreaterThan(0)
    expect(screen.getAllByText('SPLIT').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/FREE /).length).toBeGreaterThan(0)
    expect(screen.getAllByText('UNSET').length).toBeGreaterThan(0)
    // A pending declaration carries its PENDING chip on the grid.
    expect(screen.getAllByText('PENDING').length).toBeGreaterThan(0)
    // Legend.
    expect(screen.getByText('Unavailable')).toBeDefined()
    expect(screen.getByText('Available')).toBeDefined()
    expect(screen.getByText(/Unset \(casual\)/)).toBeDefined()
    expect(screen.getByText(/Split \(part of day\)/)).toBeDefined()
  })

  it('pins a day and floats people who are free that day to the top', async () => {
    mockFetch([[], [], availData])

    render(<RosterClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findByText(/TAYLOR REED/)
    const names = () => screen.getAllByText(/LIAM HEAVEN|TAYLOR REED/).map((el) => el.textContent ?? '')
    // Data order first: LIAM leads.
    expect(names()[0]).toContain('LIAM')

    // Pin Monday — Taylor (available that day) floats above Liam (no entry).
    const pins = screen.getAllByTitle('PIN THIS DAY — FLOAT WHO IS FREE TO THE TOP')
    fireEvent.click(pins[0])
    await waitFor(() => expect(screen.getByText('PINNED')).toBeDefined())
    expect(names()[0]).toContain('TAYLOR')
  })

  it('opens the staff editor when the name is clicked', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (url: unknown) => {
      const u = String(url)
      if (/\/api\/admin\/staff\/[^/]+$/.test(u)) {
        return {
          ok: true, json: async () => ({
            id: 'st1', firstName: 'LIAM', lastName: 'HEAVEN', email: null, role: 'STAFF', venueId: 'v1',
            departmentId: null, hourlyRate: null, employmentType: 'FULL_TIME', taxCode: null, kiwiSaverRate: null,
            studentLoan: false, swiftPosId: null, myHrId: null, loadedReportsId: null, sections: [], positions: [],
            staffVenues: [],
          }),
        } as Response
      }
      if (u.includes('/api/admin/venues') || u.includes('/api/admin/departments') || u.includes('/api/admin/sections') || u.includes('/api/admin/positions')) {
        return { ok: true, json: async () => [] } as Response
      }
      return { ok: true, json: async () => data } as Response
    })

    render(<RosterClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findByText(/LIAM HEAVEN/)
    fireEvent.click(screen.getByTitle('EDIT STAFF'))
    expect(await screen.findByText('EDIT STAFF')).toBeDefined()
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

  it('switches between the staff roster and the event roster', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (url: unknown) => {
      const u = String(url)
      if (u.includes('/api/admin/event-roster')) {
        return { ok: true, json: async () => ({ areas: [], events: [], queue: [], positions: [], lastSyncedAt: null }) } as Response
      }
      if (u.includes('/api/admin/venues') || u.includes('/api/admin/positions')) {
        return { ok: true, json: async () => [] } as Response
      }
      return { ok: true, json: async () => data } as Response
    })

    render(<RosterClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findByText(/LIAM HEAVEN/)

    fireEvent.click(screen.getByText('EVENTS'))
    expect(await screen.findByText('↻ SYNC CALENDARS')).toBeDefined()
    expect(await screen.findByText('+ NEW EVENT')).toBeDefined()
    // The same staff grid is shared — the person and their shift stay visible.
    expect(screen.getByText(/LIAM HEAVEN/)).toBeDefined()
    expect(screen.getByText(/07:00 — 16:00/)).toBeDefined()

    fireEvent.click(screen.getByText('STAFF'))
    await waitFor(() => expect(screen.queryByText('↻ SYNC CALENDARS')).toBeNull())
    expect(screen.getByText(/LIAM HEAVEN/)).toBeDefined()
  })

  it('overlays the day\'s events as chips in the day headers and opens the staffing modal', async () => {
    const eventData = {
      areas: [{ id: 'ar1', name: 'MEETING ROOM 1', colour: '#60A5FA', capacity: 12, floorPlanSlug: null, floorPlanName: null }],
      events: [
        {
          id: 'ev1', areaId: 'ar1', feedId: null, title: 'BOARD MEETING', description: null,
          location: 'MEETING ROOM 1', source: 'MANUAL',
          startsAt: `${monday}T10:00:00.000Z`, endsAt: `${monday}T12:00:00.000Z`,
          allDay: false, pax: 8, pdfPath: null, pdfUrl: null, floorPlanSlug: null, floorPlanName: null,
          staffing: [
            { id: 'sl1', positionId: 'p1', positionName: 'BARISTA', positionColour: '#60A5FA', label: null, count: 1, startTime: '09:00', endTime: '13:00', breakMinutes: 0, note: null, sortOrder: 0 },
          ],
          openShifts: [],
          shifts: [
            { id: 'shx', staffId: 'st1', staffName: 'LIAM HEAVEN', positionName: 'BARISTA', positionColour: null, date: monday, startTime: '09:00', endTime: '13:00', breakMinutes: 0, tag: 'EVENT', status: 'DRAFT', fromClaim: true },
          ],
        },
      ],
      queue: [],
      positions: [{ id: 'p1', name: 'BARISTA', colour: '#60A5FA' }],
      lastSyncedAt: null,
    }
    vi.spyOn(global, 'fetch').mockImplementation(async (url: unknown) => {
      const u = String(url)
      if (u.includes('/api/admin/event-roster')) {
        return { ok: true, json: async () => eventData } as Response
      }
      if (u.includes('/api/admin/venues') || u.includes('/api/admin/positions')) {
        return { ok: true, json: async () => [] } as Response
      }
      return { ok: true, json: async () => data } as Response
    })

    render(<RosterClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)
    await screen.findByText(/LIAM HEAVEN/)

    fireEvent.click(screen.getByText('EVENTS'))

    // Chip in Monday's header: time + title + area + pax.
    expect(await screen.findByText('10:00 BOARD MEETING')).toBeDefined()
    expect(screen.getByText(/MEETING ROOM 1 · 8 PAX/)).toBeDefined()

    fireEvent.click(screen.getByText('10:00 BOARD MEETING'))
    expect(await screen.findByText('REQUIRED STAFF')).toBeDefined()
    expect(screen.getByText('ROSTERED SHIFTS (1)')).toBeDefined()
    expect(screen.getByText('CLAIMED')).toBeDefined()
    expect(screen.getByText(/LIAM HEAVEN · 09:00–13:00/)).toBeDefined()
    // Manual events can be edited straight from the staffing modal.
    expect(screen.getByText('EDIT EVENT')).toBeDefined()
  })
})
