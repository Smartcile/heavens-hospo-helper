import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import { PayrollClient } from '@/components/admin/PayrollClient'

const period = { id: 'pp1', startDate: '2026-08-03', endDate: '2026-08-09', status: 'OPEN', paidAt: null, entryCount: 0 }

function mockFetch(responses: unknown[]) {
  const spy = vi.spyOn(global, 'fetch')
  let i = 0
  spy.mockImplementation(async () => {
    const r = responses[Math.min(i, responses.length - 1)]
    i += 1
    return { ok: true, json: async () => r } as Response
  })
}

describe('PayrollClient', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('renders heading, tabs and period list', async () => {
    mockFetch([[], [period], {}, [], []]) // venues, periods, settings, holidays, alt days

    render(<PayrollClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    expect(await screen.findByText('PAYROLL')).toBeDefined()
    expect(screen.getByText('PERIODS')).toBeDefined()
    expect(screen.getByText('PUBLIC HOLIDAYS')).toBeDefined()
    expect(screen.getByText('ALT DAYS')).toBeDefined()
    expect(screen.getByText('SETTINGS')).toBeDefined()
    await waitFor(() => {
      expect(screen.getByText(/2026-08-03 → 2026-08-09/)).toBeDefined()
      expect(screen.getByText('CLOSE PERIOD')).toBeDefined()
    })
  })

  it('shows an empty state when there are no periods', async () => {
    mockFetch([[], [], {}, [], []])

    render(<PayrollClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await waitFor(() => {
      expect(screen.getByText(/NO PAY PERIODS YET/)).toBeDefined()
    })
  })

  it('renders the settings tab with wage and ACC fields', async () => {
    mockFetch([[], [], { minimumWage: 23.5, accRate: 1.47, payFrequency: 'WEEKLY', kiwiSaverEmployerRate: 3, studentLoanRate: 12, holidayPayPct: 8, defaultTaxCode: 'M', overtimeEnabled: false, overtimeHoursPerWeek: 40, overtimeRate: 1.5 }, [], []])

    render(<PayrollClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    const settingsTab = await screen.findByText('SETTINGS')
    settingsTab.click()
    await waitFor(() => {
      expect(screen.getByText('Minimum Wage ($/hr)')).toBeDefined()
      expect(screen.getByText('ACC Earner Levy (%)')).toBeDefined()
      expect(screen.getByText('Casual Holiday Pay (%)')).toBeDefined()
    })
  })
})
