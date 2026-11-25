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
  notes: null,
  poolTotal: 1000,
  shares: [
    {
      id: 'r1',
      staffId: 's1',
      name: 'LIAM SMITH',
      hours: 705,
      shareWeight: 1,
      sortOrder: 0,
      status: 'PLANNED',
      approvalNote: null,
      issueNote: null,
    },
    {
      id: 'r2',
      staffId: 's2',
      name: 'SHAYLA JONES',
      hours: 634,
      shareWeight: 1,
      sortOrder: 1,
      status: 'APPROVED',
      approvalNote: 'CHECKED',
      issueNote: null,
    },
  ],
}

const json = (data: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) } as Response)

function mockFetch(periods: unknown[] = [PERIOD]) {
  return vi.fn((url: string, init?: RequestInit) => {
    const u = String(url)
    if (u.startsWith('/api/admin/tips/staff-options')) return json([])
    if (u.includes('/shares/')) return json({ ok: true })
    if (u.startsWith('/api/admin/tips')) {
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

  it('renders the pool, per-person amounts and approval status', async () => {
    render(<TipsClient venueId="v1" />)
    await waitFor(() => expect(screen.getByText('FEBRUARY 2026')).toBeTruthy())

    expect(screen.getAllByText('$1,000.00').length).toBeGreaterThan(0)
    expect(screen.getByText('LIAM SMITH')).toBeTruthy()
    expect(screen.getByText('SHAYLA JONES')).toBeTruthy()
    expect(screen.getAllByText('$500.00').length).toBeGreaterThan(0)
    // Hours share: 705 / 1339 = 52.7%
    expect(screen.getByText('52.7%')).toBeTruthy()
    expect(screen.getByText('APPROVED')).toBeTruthy()
  })

  it('adds a manual person to the breakdown', async () => {
    render(<TipsClient venueId="v1" />)
    await waitFor(() => expect(screen.getByText('FEBRUARY 2026')).toBeTruthy())

    fireEvent.click(screen.getByText('+ ADD PERSON'))
    expect(screen.getByLabelText('Staff 3 name')).toBeTruthy()
  })

  it('approves a planned share with a note', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('CHECKED IN CASH')
    render(<TipsClient venueId="v1" />)
    await waitFor(() => expect(screen.getByText('FEBRUARY 2026')).toBeTruthy())

    fireEvent.click(screen.getByText('APPROVE'))

    await waitFor(() => {
      const patches = methodCalls('PATCH')
      expect(patches.length).toBe(1)
      expect(String(patches[0][0])).toContain('/api/admin/tips/t1/shares/r1')
      const body = JSON.parse((patches[0][1] as RequestInit).body as string)
      expect(body).toEqual({ action: 'APPROVE', note: 'CHECKED IN CASH' })
    })
  })

  it('keeps unsaved form edits when one person is approved', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('CHECKED')
    render(<TipsClient venueId="v1" />)
    await waitFor(() => expect(screen.getByText('FEBRUARY 2026')).toBeTruthy())

    const hours = screen.getByLabelText('Staff 1 hours') as HTMLInputElement
    fireEvent.change(hours, { target: { value: '999' } })
    fireEvent.change(screen.getByLabelText('EFTPOS / POS holding (from finance)'), {
      target: { value: '1234' },
    })

    fireEvent.click(screen.getByText('APPROVE'))

    await waitFor(() => {
      expect(methodCalls('PATCH').length).toBe(1)
      expect((screen.getByLabelText('Staff 1 hours') as HTMLInputElement).value).toBe('999')
      expect(
        (screen.getByLabelText('EFTPOS / POS holding (from finance)') as HTMLInputElement).value,
      ).toBe('1234')
    })
  })

  it('saves shares by id without sending dollar amounts', async () => {
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
      expect(body.shares[0]).toMatchObject({ id: 'r1', staffId: 's1', hours: 705, shareWeight: 1 })
      expect(body.shares[0]).not.toHaveProperty('amount')
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

  it('links the admin-only distribution PDF once a period is saved', async () => {
    render(<TipsClient venueId="v1" />)
    await waitFor(() => expect(screen.getByText('FEBRUARY 2026')).toBeTruthy())
    const link = screen.getByText('⬇ DOWNLOAD DISTRIBUTION PDF').closest('a')
    expect(link?.getAttribute('href')).toBe('/api/admin/tips/t1/pdf')
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
