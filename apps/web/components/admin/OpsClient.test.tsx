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

import { OpsClient } from '@/components/admin/OpsClient'

const props = { role: 'ADMIN', sessionVenueId: 'v-home' }

describe('OpsClient', () => {
  beforeEach(() => {
    mocks.push.mockClear()
    mocks.params = new URLSearchParams()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      const res = (data: unknown) => ({ ok: true, json: async () => data }) as Response
      if (url.startsWith('/api/admin/booking-tables')) return res({ tables: [], bookings: [] })
      if (url.startsWith('/api/admin/bookings')) return res([])
      if (url === '/api/admin/venues') return res([{ id: 'v1', name: 'TEST VENUE' }])
      return res([])
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the 5 tab labels', async () => {
    render(<OpsClient {...props} />)
    for (const label of ['MENU & SERVICES', 'BOOKINGS', 'ORDERS', 'CUSTOMERS', 'INVENTORY & STOCKTAKE']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
    await screen.findByText('RECIPES & MENU ITEMS')
  })

  it('defaults to the MENU tab with the RECIPES sub-tab active', async () => {
    render(<OpsClient {...props} />)
    expect(await screen.findByText('RECIPES & MENU ITEMS')).toBeTruthy()
    for (const label of ['RECIPES', 'MENUS & CATEGORIES', 'SERVICES']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
  })

  it('switching a top-level tab pushes the OPS HUB URL', async () => {
    render(<OpsClient {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'ORDERS' }))
    expect(mocks.push).toHaveBeenCalledWith('/admin/ops?tab=orders', { scroll: false })
    expect((await screen.findAllByText('ORDERS')).length).toBeGreaterThan(0)
  })

  it('switching a MENU sub-tab pushes the sub URL', async () => {
    render(<OpsClient {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'MENUS & CATEGORIES' }))
    expect(mocks.push).toHaveBeenCalledWith('/admin/ops?tab=menu&sub=menus', { scroll: false })
  })

  it('SERVICES mounts as a MENU sub-tab', async () => {
    mocks.params = new URLSearchParams('tab=menu&sub=services')
    render(<OpsClient {...props} />)
    expect(await screen.findByText('SERVICES')).toBeTruthy()
  })

  it('STOCKTAKE mounts as an INVENTORY sub-tab', async () => {
    mocks.params = new URLSearchParams('tab=inventory&sub=stocktake')
    render(<OpsClient {...props} />)
    expect(await screen.findByText('STOCKTAKES')).toBeTruthy()
  })

  it('an invalid tab param falls back to the MENU tab', async () => {
    mocks.params = new URLSearchParams('tab=bogus')
    render(<OpsClient {...props} />)
    expect(await screen.findByText('RECIPES & MENU ITEMS')).toBeTruthy()
  })

  it('mounts the BOOKINGS tab from the URL', async () => {
    mocks.params = new URLSearchParams('tab=bookings')
    render(<OpsClient {...props} />)
    expect((await screen.findAllByText('BOOKINGS')).length).toBeGreaterThan(0)
  })
})
