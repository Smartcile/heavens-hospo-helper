import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

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

  it('renders all 8 tab labels with GENERAL active by default', () => {
    render(<SettingsClient {...props} />)
    for (const label of ['GENERAL', 'STRUCTURE', 'FLOOR PLANS', 'UNITS OF MEASURE', 'SUPPLIERS', 'QR CODES', 'SYNC', 'FILES']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
    expect(screen.getByText('INTEGRATIONS')).toBeTruthy()
  })

  it('hides the admin-only FILES tab from managers', () => {
    mocks.params = new URLSearchParams('tab=files')
    render(<SettingsClient {...props} role="MANAGER" />)
    expect(screen.queryByRole('button', { name: 'FILES' })).toBeNull()
    // A manager landing on ?tab=files falls back to the GENERAL tab.
    expect(screen.getByText('INTEGRATIONS')).toBeTruthy()
  })

  it('hides FLOOR PLANS from restricted managers without the floorplans grant', () => {
    mocks.params = new URLSearchParams('tab=floorplans')
    render(<SettingsClient {...props} role="MANAGER" grantedAreas={['compliance']} />)
    expect(screen.queryByRole('button', { name: 'FLOOR PLANS' })).toBeNull()
    // Landing on ?tab=floorplans falls back to GENERAL.
    expect(screen.getByText('INTEGRATIONS')).toBeTruthy()
  })

  it('shows FLOOR PLANS to a restricted manager who holds the grant', () => {
    mocks.params = new URLSearchParams('tab=floorplans')
    render(<SettingsClient {...props} role="MANAGER" grantedAreas={['floorplans']} />)
    expect(screen.getByRole('button', { name: 'FLOOR PLANS' })).toBeTruthy()
    expect(screen.getByText('TO-SCALE VENUE LAYOUT EDITOR')).toBeTruthy()
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

  it('shows plugin-managed credentials read-only until MANUAL OVERRIDE, then saves the takeover', async () => {
    vi.mocked(global.fetch).mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const res = (data: unknown) => ({ ok: true, json: async () => data }) as Response
        if (url.includes('/api/admin/venues')) return res([{ id: 'v1', name: 'TEST VENUE' }])
        if (url.includes('/api/admin/settings/woocommerce')) {
          const base = {
            wcStoreUrl: 'https://shop.example.co.nz',
            wcConsumerKey: '••••ck_1234',
            wcConsumerSecret: '••••cs_5678',
            wcWebhookSecret: '••••whsec_9',
            wcActive: true,
            lastSyncAt: null,
            metaFieldMap: {},
            metaFieldDefaults: {},
          }
          if (init?.method === 'PUT') {
            const body = JSON.parse(String(init.body))
            return res({ ...base, managedByPlugin: body.managedByPlugin ?? true, pairedAt: null })
          }
          return res({ ...base, managedByPlugin: true, pairedAt: '2026-09-01T00:00:00.000Z' })
        }
        return res([])
      },
    )

    render(<SettingsClient {...props} />)

    expect(await screen.findByText('MANAGED BY PLUGIN')).toBeTruthy()
    const storeUrl = screen.getByPlaceholderText('https://yourshop.co.nz') as HTMLInputElement
    expect(storeUrl.disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'MANUAL OVERRIDE' }))
    expect(screen.getByPlaceholderText('https://yourshop.co.nz')).toHaveProperty('disabled', false)

    fireEvent.click(screen.getByRole('button', { name: 'SAVE & TAKE OVER' }))
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/settings/woocommerce'),
        expect.objectContaining({
          method: 'PUT',
          body: expect.stringContaining('"managedByPlugin":false'),
        }),
      )
    })
  })
})
