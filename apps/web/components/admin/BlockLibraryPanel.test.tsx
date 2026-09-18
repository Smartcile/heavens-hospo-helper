import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { BlockLibraryPanel } from '@/components/admin/BlockLibraryPanel'

const CUSTOM = [
  {
    id: 'd1',
    key: 'BAR_TAB',
    label: 'BAR TAB',
    group: 'CUSTOM',
    description: 'BAR TAB DETAILS',
    defaultConfig: { limit: 0 },
    fields: [{ key: 'limit', label: 'LIMIT', kind: 'number' }],
    sortOrder: 0,
    isActive: true,
  },
]

function mockFetch(defs = CUSTOM) {
  return vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === 'POST' || init?.method === 'PUT') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    }
    if (String(url).startsWith('/api/admin/beo-block-defs')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(defs) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
  }) as unknown as typeof fetch
}

describe('BlockLibraryPanel', () => {
  beforeEach(() => { globalThis.fetch = mockFetch() })
  afterEach(() => { vi.restoreAllMocks() })

  it('lists custom defs and the built-in library', async () => {
    render(<BlockLibraryPanel sessionVenueId="v1" />)
    await waitFor(() => expect(screen.getByText('BAR TAB')).toBeTruthy())
    expect(screen.getByText('BAR_TAB')).toBeTruthy()
    expect(screen.getByText('BUILT-IN BLOCKS')).toBeTruthy()
    expect(screen.getAllByText('BUILT-IN').length).toBeGreaterThan(0)
  })

  it('shows an empty state when there are no custom defs', async () => {
    globalThis.fetch = mockFetch([])
    render(<BlockLibraryPanel sessionVenueId="v1" />)
    await waitFor(() => expect(screen.getByText('NO CUSTOM BLOCKS YET.')).toBeTruthy())
  })

  it('POSTs a new custom def with an auto-derived key and field defaults', async () => {
    render(<BlockLibraryPanel sessionVenueId="v1" />)
    await waitFor(() => expect(screen.getByText('BAR TAB')).toBeTruthy())

    fireEvent.click(screen.getByText('+ NEW BLOCK'))
    fireEvent.change(screen.getByPlaceholderText('BAR TAB'), { target: { value: 'BAR TAB' } })
    fireEvent.change(screen.getByPlaceholderText('TAB TOTAL'), { target: { value: 'TAB TOTAL' } })
    fireEvent.click(screen.getByText('SAVE BLOCK'))

    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
      const post = calls.find((c) => (c[1] as { method?: string } | undefined)?.method === 'POST')
      expect(post).toBeTruthy()
      expect(JSON.parse((post![1] as { body: string }).body)).toMatchObject({
        venueId: 'v1',
        key: 'BAR_TAB',
        label: 'BAR TAB',
        defaultConfig: { tabTotal: '' },
      })
    })
  })

  it('pre-fills the editor when editing a custom def', async () => {
    render(<BlockLibraryPanel sessionVenueId="v1" />)
    await waitFor(() => expect(screen.getByText('BAR TAB')).toBeTruthy())

    fireEvent.click(screen.getByText('EDIT'))
    expect((screen.getByPlaceholderText('BAR TAB') as HTMLInputElement).value).toBe('BAR TAB')
    expect((screen.getByPlaceholderText('BAR_TAB') as HTMLInputElement).value).toBe('BAR_TAB')
  })
})
