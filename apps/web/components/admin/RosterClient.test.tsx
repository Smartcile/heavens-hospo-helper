import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { RosterClient } from '@/components/admin/RosterClient'

const data = {
  staff: [
    { id: 'st1', firstName: 'LIAM', lastName: 'HEAVEN', hourlyRate: 25, employmentType: 'FULL_TIME', departmentName: 'BAR', positions: [{ id: 'p1', name: 'BARISTA', colour: '#60A5FA' }] },
  ],
  shifts: [
    { id: 'sh1', staffId: 'st1', date: '2026-08-10', startTime: '07:00', endTime: '16:00', breakMinutes: 30, colour: null, tag: null, status: 'PUBLISHED', positionName: 'BARISTA', positionColour: '#60A5FA' },
  ],
  blockedDays: {},
  budgetedSalesByDate: { '2026-08-10': 1000 },
  summary: { totalCost: 212.5, budgetedSales: 1000, staffingRatio: 21.25, totalPaidHours: 8.5 },
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
})
