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

  it('defaults to the MENU area with the RECIPES fine tab active — areas are not buttons', async () => {
    render(<OpsClient {...props} />)
    expect(await screen.findByText('RECIPES & MENU ITEMS')).toBeTruthy()
    for (const label of ['RECIPES', 'MENUS & CATEGORIES', 'SERVICES']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
    // The five areas moved to the sidebar — none of them render as top-bar buttons.
    for (const label of ['MENU & SERVICES', 'BOOKINGS', 'ORDERS', 'CUSTOMERS', 'INVENTORY & STOCKTAKE']) {
      expect(screen.queryByRole('button', { name: label })).toBeNull()
    }
  })

  it('clicking a MENU fine tab pushes the area URL with that sub', async () => {
    render(<OpsClient {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'MENUS & CATEGORIES' }))
    expect(mocks.push).toHaveBeenCalledWith('/admin/ops?tab=menu&sub=menus', { scroll: false })
  })

  it('clicking a BOOKINGS fine tab pushes the bookings sub URL', async () => {
    mocks.params = new URLSearchParams('tab=bookings')
    render(<OpsClient {...props} />)
    for (const label of ['DIARY', 'TABLE', 'DELETED']) {
      expect(await screen.findByRole('button', { name: label })).toBeTruthy()
    }
    fireEvent.click(screen.getByRole('button', { name: 'DIARY' }))
    expect(mocks.push).toHaveBeenCalledWith('/admin/ops?tab=bookings&sub=diary', { scroll: false })
  })

  it('SERVICES mounts as a MENU fine tab', async () => {
    mocks.params = new URLSearchParams('tab=menu&sub=services')
    render(<OpsClient {...props} />)
    expect(await screen.findByText('SERVICES')).toBeTruthy()
  })

  it('STOCKTAKE mounts as an INVENTORY fine tab', async () => {
    mocks.params = new URLSearchParams('tab=inventory&sub=stocktake')
    render(<OpsClient {...props} />)
    expect(await screen.findByText('STOCKTAKES')).toBeTruthy()
  })

  it('an invalid area param falls back to the MENU area', async () => {
    mocks.params = new URLSearchParams('tab=bogus')
    render(<OpsClient {...props} />)
    expect(await screen.findByText('RECIPES & MENU ITEMS')).toBeTruthy()
  })

  it('CUSTOMERS is a leaf — it renders without a top tab bar', async () => {
    mocks.params = new URLSearchParams('tab=customers')
    render(<OpsClient {...props} />)
    expect(await screen.findByText('CUSTOMERS')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'RECIPES' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'DIARY' })).toBeNull()
  })
})
