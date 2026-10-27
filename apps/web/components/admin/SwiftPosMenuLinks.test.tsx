import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { SwiftPosMenuLinks } from '@/components/admin/SwiftPosMenuLinks'
import { pushToast } from '@/components/ui/Toast'

vi.mock('@/components/ui/Toast', () => ({ pushToast: vi.fn() }))

const product = (inventoryCode: string, description: string, category: string, linked: { id: string; name: string }[] = []) => ({
  inventoryCode,
  description,
  category,
  printGroupName: 'BAR',
  masterGroupName: 'BEVERAGE',
  active: true,
  discontinued: false,
  price: 12,
  linked,
})

const PAYLOAD = {
  venueName: 'DEMO',
  baseUrl: 'http://swift:5080',
  total: 4,
  truncated: false,
  rows: [
    product('TAP ASAHI', 'Asahi', 'BEER', [{ id: 'm1', name: 'ASAHI TAP' }]),
    product('BTL HEINEKEN', 'Heineken', 'BEER'),
    product('DUP', 'Duplicated', 'WINE', [{ id: 'm4', name: 'DUP ONE' }, { id: 'm5', name: 'DUP TWO' }]),
    product('UNMAPPED', 'Nothing local', 'WINE'),
  ],
  orphans: [{ code: 'GONE', items: [{ id: 'm3', name: 'GONE PRODUCT' }] }],
  duplicates: [{ code: 'DUP', items: [{ id: 'm4', name: 'DUP ONE' }, { id: 'm5', name: 'DUP TWO' }] }],
  linkedCount: 2,
  unlinkedCount: 2,
  menuItems: [
    { id: 'm1', name: 'ASAHI TAP', swiftPosId: 'TAP ASAHI' },
    { id: 'm2', name: 'HEINEKEN', swiftPosId: null },
    { id: 'm3', name: 'GONE PRODUCT', swiftPosId: 'GONE' },
    { id: 'm4', name: 'DUP ONE', swiftPosId: 'DUP' },
    { id: 'm5', name: 'DUP TWO', swiftPosId: 'DUP' },
  ],
}

let puts: Record<string, unknown>[] = []

function mockFetch() {
  return vi.fn((url: string, init?: RequestInit) => {
    const json = (d: unknown, status = 200) =>
      Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(d) })
    if (String(url).startsWith('/api/admin/swiftpos/menu-links') && init?.method === 'PUT') {
      puts.push(JSON.parse(String(init.body)))
      return json({ ok: true })
    }
    if (String(url).startsWith('/api/admin/swiftpos/menu-links')) return json(PAYLOAD)
    return json(null)
  }) as unknown as typeof fetch
}

describe('SwiftPosMenuLinks', () => {
  beforeEach(() => {
    puts = []
    vi.mocked(pushToast).mockClear()
    globalThis.fetch = mockFetch()
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('groups products by category, shows counts, duplicates and orphans', async () => {
    render(<SwiftPosMenuLinks venueId="v1" />)

    await waitFor(() => expect(screen.getByText('SWIFTPOS MENU LINKS')).toBeTruthy())
    expect(screen.getByText(/▾ BEER/)).toBeTruthy()
    expect(screen.getByText(/▾ WINE/)).toBeTruthy()
    expect(screen.getByText('ASAHI TAP')).toBeTruthy()
    expect(screen.getByText(/DUPLICATE ×2/)).toBeTruthy()
    expect(screen.getByText('DUPLICATE CODES (1)')).toBeTruthy()
    expect(screen.getByText('ORPHAN CODES (1)')).toBeTruthy()
    expect(screen.getAllByText(/GONE/).length).toBeGreaterThan(0)
  })

  it('links an unlinked SwiftPOS product to a local product', async () => {
    render(<SwiftPosMenuLinks venueId="v1" />)
    await waitFor(() => expect(screen.getByLabelText('LOCAL PRODUCT FOR BTL HEINEKEN')).toBeTruthy())

    fireEvent.change(screen.getByLabelText('LOCAL PRODUCT FOR BTL HEINEKEN'), { target: { value: 'm2' } })
    fireEvent.click(screen.getByLabelText('LINK BTL HEINEKEN'))

    await waitFor(() => expect(puts).toHaveLength(1))
    expect(puts[0]).toEqual({ venueId: 'v1', menuItemId: 'm2', swiftPosId: 'BTL HEINEKEN' })
  })

  it('unlinks an existing code', async () => {
    render(<SwiftPosMenuLinks venueId="v1" />)
    await waitFor(() => expect(screen.getByLabelText('UNLINK TAP ASAHI FROM ASAHI TAP')).toBeTruthy())

    fireEvent.click(screen.getByLabelText('UNLINK TAP ASAHI FROM ASAHI TAP'))
    await waitFor(() => expect(puts).toHaveLength(1))
    expect(puts[0]).toEqual({ venueId: 'v1', menuItemId: 'm1', swiftPosId: null })
  })

  it('shows the not-connected error instead of a product list', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'SWIFTPOS NOT CONNECTED — SET THE SWIFTDOSNET URL ON THE VENUE' }),
    })) as unknown as typeof fetch

    render(<SwiftPosMenuLinks venueId="v1" />)
    await waitFor(() => expect(screen.getByText(/SWIFTPOS NOT CONNECTED/)).toBeTruthy())
    expect(screen.queryByText('SWIFTPOS MENU LINKS')).toBeTruthy()
  })

  it('asks for a venue instead of fetching when none is selected', () => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch

    render(<SwiftPosMenuLinks venueId="" />)
    expect(screen.getByText('SELECT A VENUE.')).toBeTruthy()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('hides orphans when the catalogue is truncated', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ...PAYLOAD, truncated: true, orphans: [], orphansSuppressed: true }),
    })) as unknown as typeof fetch

    render(<SwiftPosMenuLinks venueId="v1" />)
    await waitFor(() => expect(screen.getByText('ORPHAN CODES (HIDDEN)')).toBeTruthy())
    expect(screen.getByText(/CATALOGUE IS TRUNCATED/)).toBeTruthy()
    expect(screen.getByText('HIDDEN.')).toBeTruthy()
  })

  it('clears the busy state when the link request fails on the network', async () => {
    const base = mockFetch()
    globalThis.fetch = vi.fn((url: string, init?: RequestInit) => {
      if (String(url).startsWith('/api/admin/swiftpos/menu-links') && init?.method === 'PUT') {
        return Promise.reject(new Error('network down'))
      }
      return base(url, init)
    }) as unknown as typeof fetch

    render(<SwiftPosMenuLinks venueId="v1" />)
    await waitFor(() => expect(screen.getByLabelText('LOCAL PRODUCT FOR BTL HEINEKEN')).toBeTruthy())

    fireEvent.change(screen.getByLabelText('LOCAL PRODUCT FOR BTL HEINEKEN'), { target: { value: 'm2' } })
    fireEvent.click(screen.getByLabelText('LINK BTL HEINEKEN'))

    await waitFor(() => expect(pushToast).toHaveBeenCalledWith('COULD NOT REACH THE SERVER', 'error'))
    expect(screen.queryByText('LOADING')).toBeNull()
  })
})
