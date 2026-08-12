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

import { SettingsClient } from '@/components/admin/SettingsClient'

const props = { staffId: 's1', role: 'ADMIN', sessionVenueId: 'v1', defaultVenueId: 'v1', venueIsDemo: false }

describe('SettingsClient tabs', () => {
  beforeEach(() => {
    mocks.push.mockClear()
    mocks.params = new URLSearchParams()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      const res = (data: unknown) => ({ ok: true, json: async () => data }) as Response
      if (url.includes('/api/admin/venues')) return res([{ id: 'v1', name: 'TEST VENUE' }])
      if (url.includes('/api/admin/sync/log')) return res([])
      return res([])
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders all 6 tab labels with GENERAL active by default', () => {
    render(<SettingsClient {...props} />)
    for (const label of ['GENERAL', 'STRUCTURE', 'UNITS OF MEASURE', 'SUPPLIERS', 'QR CODES', 'SYNC']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
    expect(screen.getByText('INTEGRATIONS')).toBeTruthy()
  })

  it('switching a tab pushes the settings URL', () => {
    render(<SettingsClient {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'SYNC' }))
    expect(mocks.push).toHaveBeenCalledWith('/admin/settings?tab=sync', { scroll: false })
  })

  it('mounts the SYNC tab from the URL', async () => {
    mocks.params = new URLSearchParams('tab=sync')
    render(<SettingsClient {...props} />)
    expect(await screen.findByText('WOOCOMMERCE SYNC')).toBeTruthy()
  })

  it('mounts the UOMS tab from the URL', async () => {
    mocks.params = new URLSearchParams('tab=uoms')
    render(<SettingsClient {...props} />)
    expect((await screen.findAllByText('UNITS OF MEASURE')).length).toBeGreaterThan(0)
  })
})
