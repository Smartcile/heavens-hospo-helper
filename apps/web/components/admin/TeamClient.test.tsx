import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  params: new URLSearchParams(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => mocks.params,
}))

import { TeamClient } from '@/components/admin/TeamClient'

const props = { role: 'ADMIN', sessionVenueId: 'v-home' }

describe('TeamClient', () => {
  beforeEach(() => {
    mocks.push.mockClear()
    mocks.params = new URLSearchParams()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      const res = (data: unknown) => ({ ok: true, json: async () => data }) as Response
      if (url.startsWith('/api/admin/roster')) {
        return res({ staff: [], shifts: [], blockedDays: {}, budgetedSalesByDate: {}, summary: { totalCost: 0, budgetedSales: 0, staffingRatio: 0, totalPaidHours: 0 } })
      }
      if (url === '/api/admin/venues') return res([{ id: 'v1', name: 'TEST VENUE' }])
      return res([])
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the 4 tab labels', () => {
    render(<TeamClient {...props} />)
    for (const label of ['STAFF', 'ROSTER', 'CLOCKS', 'PAYROLL']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
  })

  it('defaults to the STAFF tab', async () => {
    render(<TeamClient {...props} />)
    expect((await screen.findAllByText('STAFF')).length).toBeGreaterThan(0)
  })

  it('switching tabs pushes the team URL', async () => {
    render(<TeamClient {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'PAYROLL' }))
    expect(mocks.push).toHaveBeenCalledWith('/admin/team?tab=payroll', { scroll: false })
  })

  it('mounts the CLOCKS tab from the URL', async () => {
    mocks.params = new URLSearchParams('tab=clocks')
    render(<TeamClient {...props} />)
    expect(await screen.findByText('STAFF CLOCKS')).toBeTruthy()
  })

  it('mounts the ROSTER tab from the URL', async () => {
    mocks.params = new URLSearchParams('tab=roster')
    render(<TeamClient {...props} />)
    expect(await screen.findByText('ROSTER')).toBeTruthy()
  })

  it('mounts the PAYROLL tab from the URL', async () => {
    mocks.params = new URLSearchParams('tab=payroll')
    render(<TeamClient {...props} />)
    expect((await screen.findAllByText('PAYROLL')).length).toBeGreaterThan(0)
  })
})
