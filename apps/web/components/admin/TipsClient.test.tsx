import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { TipsClient } from '@/components/admin/TipsClient'

const PERIOD = {
  id: 't1',
  venueId: 'v1',
  label: 'FEBRUARY 2026',
  fromDate: '2026-02-01T00:00:00.000Z',
  toDate: '2026-02-28T00:00:00.000Z',
  cashCounts: {},
  posTotal: 1000,
  shares: [
    { name: 'LIAM', hours: 705, shareWeight: 1 },
    { name: 'SHAYLA', hours: 634, shareWeight: 1 },
  ],
  notes: null,
}

const json = (data: unknown) =>
  Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response)

function mockFetch(periods: unknown[] = [PERIOD]) {
  return vi.fn((url: string, init?: RequestInit) => {
    if (url.startsWith('/api/admin/tips')) {
      const method = init?.method ?? 'GET'
      if (method === 'POST') return json({ ...PERIOD, id: 'new1' })
      if (method === 'PUT') return json(periods[0])
      if (method === 'DELETE') return json({ success: true })
      return json(periods)
    }
    return json([])
  }) as unknown as typeof fetch
}

function methodCalls(method: string) {
  const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
  return calls.filter((c) => ((c[1] as RequestInit | undefined)?.method ?? 'GET') === method)
}

describe('TipsClient', () => {
  beforeEach(() => {
    globalThis.fetch = mockFetch()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders a period total and the per-share readout', async () => {
    render(<TipsClient venueId="v1" />)
    await waitFor(() => expect(screen.getByText('FEBRUARY 2026')).toBeTruthy())

    // Total accrued tips = cash (0) + POS (1000), shown in the editor.
    expect(screen.getAllByText('$1,000.00').length).toBeGreaterThan(0)
    // Two full shares split $1000 → $500.00 each.
    expect(screen.getByText('$500.00 EACH')).toBeTruthy()
    expect(screen.getByText(/2 × 1 SHARE/)).toBeTruthy()
  })

  it('adds a staff row to the breakdown', async () => {
    render(<TipsClient venueId="v1" />)
    await waitFor(() => expect(screen.getByText('FEBRUARY 2026')).toBeTruthy())

    fireEvent.click(screen.getByText('+ ADD STAFF'))
    expect(screen.getByLabelText('Staff 3 name')).toBeTruthy()
  })

  it('saves an existing period with a PUT', async () => {
    render(<TipsClient venueId="v1" />)
    await waitFor(() => expect(screen.getByText('FEBRUARY 2026')).toBeTruthy())

    fireEvent.click(screen.getByText('SAVE PERIOD'))

    await waitFor(() => {
      const puts = methodCalls('PUT')
      expect(puts.length).toBe(1)
      expect(String(puts[0][0])).toContain('/api/admin/tips/t1')
      const body = JSON.parse((puts[0][1] as RequestInit).body as string)
      expect(body.posTotal).toBe(1000)
      expect(body.shares).toHaveLength(2)
    })
  })

  it('creates a new period with a POST', async () => {
    render(<TipsClient venueId="v1" />)
    await waitFor(() => expect(screen.getByText('FEBRUARY 2026')).toBeTruthy())

    fireEvent.click(screen.getByText('+ NEW PERIOD'))
    fireEvent.click(screen.getByText('SAVE PERIOD'))

    await waitFor(() => {
      const posts = methodCalls('POST')
      expect(posts.length).toBe(1)
      const body = JSON.parse((posts[0][1] as RequestInit).body as string)
      expect(body.venueId).toBe('v1')
    })
  })

  it('soft-deletes a period after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<TipsClient venueId="v1" />)
    await waitFor(() => expect(screen.getByText('FEBRUARY 2026')).toBeTruthy())

    fireEvent.click(screen.getByText('DELETE'))

    await waitFor(() => {
      expect(methodCalls('DELETE').length).toBe(1)
    })
  })
})
