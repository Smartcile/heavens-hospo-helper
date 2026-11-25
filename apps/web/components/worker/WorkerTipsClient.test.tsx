import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { WorkerTipsClient } from '@/components/worker/WorkerTipsClient'

const PERIOD = {
  id: 'p1',
  label: 'FEBRUARY 2026',
  fromDate: '2026-02-01T00:00:00.000Z',
  toDate: '2026-02-28T00:00:00.000Z',
  notes: null,
  fullyIssuedAt: null,
  poolTotal: 100,
  progress: {
    total: 2,
    planned: 0,
    approved: 1,
    issued: 1,
    fullyIssued: 0,
    issuedCount: 1,
    percent: 50,
    approvedPercent: 100,
    stage: 'ISSUED',
    complete: false,
  },
  shares: [
    {
      id: 'r1',
      staffId: 's1',
      name: 'LIAM SMITH',
      hours: 10,
      shareWeight: 1,
      sortOrder: 0,
      status: 'ISSUED',
      amount: 50,
      hoursShare: 1,
      suggestedWeight: 1,
      suggestedAmount: 100,
    },
    {
      id: 'r2',
      staffId: 's2',
      name: 'SHAYLA JONES',
      hours: 5,
      shareWeight: 1,
      sortOrder: 1,
      status: 'APPROVED',
      amount: 50,
      hoursShare: 1,
      suggestedWeight: 1,
      suggestedAmount: 100,
    },
  ],
}

const json = (data: unknown, ok = true, status = 200) =>
  Promise.resolve({ ok, status, json: () => Promise.resolve(data) } as Response)

describe('WorkerTipsClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows amounts to the manager and marks an approved share issued', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (String(url) === '/api/worker/tips') return json({ periods: [PERIOD] })
      if (String(url).includes('/issue')) return json({ share: {}, fullyIssued: false })
      return json({})
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    render(<WorkerTipsClient />)
    await waitFor(() => expect(screen.getByText('FEBRUARY 2026')).toBeTruthy())
    expect(screen.getAllByText('$50.00').length).toBeGreaterThan(0)

    fireEvent.change(screen.getByLabelText('Issue note for SHAYLA JONES'), {
      target: { value: 'CASH HANDED' },
    })
    fireEvent.click(screen.getByText('MARK ISSUED'))

    await waitFor(() => {
      const issueCall = fetchMock.mock.calls.find(([u]) => String(u).includes('/issue'))
      expect(issueCall).toBeTruthy()
      expect(String(issueCall![0])).toBe('/api/worker/tips/r2/issue')
      const body = JSON.parse((issueCall![1] as RequestInit).body as string)
      expect(body.note).toBe('CASH HANDED')
    })
  })

  it('shows a fully-issued banner', async () => {
    globalThis.fetch = vi.fn(() =>
      json({
        periods: [
          {
            ...PERIOD,
            fullyIssuedAt: '2026-03-01T00:00:00.000Z',
            progress: { ...PERIOD.progress, stage: 'FULLY_ISSUED', complete: true, fullyIssued: 2, issuedCount: 2, percent: 100 },
            shares: PERIOD.shares.map((s) => ({ ...s, status: 'FULLY_ISSUED' })),
          },
        ],
      }),
    ) as unknown as typeof fetch

    render(<WorkerTipsClient />)
    await waitFor(() => expect(screen.getAllByText(/FULLY ISSUED/).length).toBeGreaterThan(0))
    expect(screen.queryByText('MARK ISSUED')).toBeNull()
  })

  it('shows access denied when the route refuses floor staff', async () => {
    globalThis.fetch = vi.fn(() => json({ error: 'ACCESS DENIED' }, false, 403)) as unknown as typeof fetch

    render(<WorkerTipsClient />)
    await waitFor(() => expect(screen.getByText('ACCESS DENIED — MANAGERS ONLY')).toBeTruthy())
  })

  it('shows per-person notes only after SHOW NOTES is toggled', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (String(url) === '/api/worker/tips?notes=1') {
        return json({
          periods: [
            {
              ...PERIOD,
              shares: PERIOD.shares.map((s) => ({
                ...s,
                notes: [{ id: `n-${s.id}`, body: `${s.name} NOTE`, createdAt: '2026-11-12T03:00:00.000Z' }],
              })),
            },
          ],
        })
      }
      if (String(url) === '/api/worker/tips') return json({ periods: [PERIOD] })
      return json({})
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    render(<WorkerTipsClient />)
    await waitFor(() => expect(screen.getByText('FEBRUARY 2026')).toBeTruthy())
    expect(fetchMock.mock.calls.some(([u]) => String(u) === '/api/worker/tips?notes=1')).toBe(false)
    expect(screen.queryByText('LIAM SMITH NOTE')).toBeNull()

    fireEvent.click(screen.getByText('SHOW NOTES'))

    await waitFor(() => expect(screen.getByText('LIAM SMITH NOTE')).toBeTruthy())
    expect(fetchMock.mock.calls.some(([u]) => String(u) === '/api/worker/tips?notes=1')).toBe(true)
  })
})
