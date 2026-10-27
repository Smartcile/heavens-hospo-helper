import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, waitFor, fireEvent } from '@testing-library/react'
import { TrainingStatusClient } from '@/components/admin/TrainingStatusClient'

const payload = {
  venueName: 'MAIN',
  date: '2026-10-27',
  staff: [
    {
      id: 's1',
      name: 'SMITH, JANE',
      positions: ['BARISTA'],
      onShift: true,
      requiredCount: 2,
      completedCount: 2,
      missingCount: 0,
      staleCount: 0,
      openFollowUps: 0,
      level: 'GREEN',
    },
  ],
  summary: { green: 1, yellow: 0, red: 0 },
}

const reviews = [
  {
    id: 'r1',
    staffName: 'SMITH, JANE',
    sectionName: 'BAR',
    source: 'GUIDES',
    status: 'PENDING',
    evidenceLabel: '2 GUIDES COMPLETE',
    requestedAt: '2026-10-27T00:00:00.000Z',
    note: null,
  },
]

function mockFetch(actionResponse?: { ok: boolean; status: number; error?: string }) {
  return vi.spyOn(global, 'fetch').mockImplementation((url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    if (u.includes('/api/admin/section-work/')) {
      if (actionResponse && !actionResponse.ok) {
        return Promise.resolve({
          ok: false,
          status: actionResponse.status,
          json: async () => ({ error: actionResponse.error }),
        } as Response)
      }
      return Promise.resolve({ ok: true, json: async () => ({ id: 'r1', status: 'CONFIRMED' }) } as Response)
    }
    if (u.includes('/api/admin/section-work')) {
      return Promise.resolve({ ok: true, json: async () => ({ reviews }) } as Response)
    }
    return Promise.resolve({ ok: true, json: async () => payload } as Response)
  })
}

describe('TrainingStatusClient section reviews', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('renders a pending section review with its evidence', async () => {
    mockFetch()
    const { getByText, getAllByText } = render(
      <TrainingStatusClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />,
    )
    await waitFor(() => expect(getByText('SECTION REVIEWS (1)')).toBeTruthy())
    expect(getAllByText('SMITH, JANE').length).toBeGreaterThanOrEqual(2)
    expect(getAllByText(/BAR/).length).toBeGreaterThan(0)
    expect(getByText('2 GUIDES COMPLETE')).toBeTruthy()
  })

  it('POSTs CONFIRM and removes the row from the queue', async () => {
    const spy = mockFetch()
    const { getByText, queryByText } = render(
      <TrainingStatusClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />,
    )
    await waitFor(() => expect(getByText('CONFIRM')).toBeTruthy())

    fireEvent.click(getByText('CONFIRM'))

    await waitFor(() => {
      const post = spy.mock.calls.find(
        (c) => String(c[0]).includes('/api/admin/section-work/r1') && c[1]?.method === 'POST',
      )
      expect(post).toBeDefined()
      expect(JSON.parse((post![1] as RequestInit).body as string)).toEqual({ action: 'CONFIRM' })
    })
    await waitFor(() => expect(queryByText('2 GUIDES COMPLETE')).toBeNull())
  })

  it('POSTs DISMISS and keeps the review available to reopen', async () => {
    const spy = mockFetch()
    const { getByText, queryByText } = render(
      <TrainingStatusClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />,
    )
    await waitFor(() => expect(getByText('DISMISS')).toBeTruthy())

    fireEvent.click(getByText('DISMISS'))

    await waitFor(() => {
      const post = spy.mock.calls.find(
        (c) => String(c[0]).includes('/api/admin/section-work/r1') && c[1]?.method === 'POST',
      )
      expect(post).toBeDefined()
      expect(JSON.parse((post![1] as RequestInit).body as string)).toEqual({ action: 'DISMISS' })
    })
    await waitFor(() => expect(getByText(/DISMISSED REVIEWS \(1\)/)).toBeTruthy())
    // Dismissed reviews are collapsed until the manager asks to see them.
    expect(queryByText(/2 GUIDES COMPLETE/)).toBeNull()

    fireEvent.click(getByText(/DISMISSED REVIEWS \(1\)/))
    await waitFor(() => expect(getByText(/2 GUIDES COMPLETE/)).toBeTruthy())
    expect(getByText('REOPEN')).toBeTruthy()
  })

  it('surfaces a failed CONFIRM (e.g. 403) instead of silently dropping it', async () => {
    mockFetch({ ok: false, status: 403, error: 'Forbidden' })
    const { getByText, queryByText } = render(
      <TrainingStatusClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />,
    )
    await waitFor(() => expect(getByText('CONFIRM')).toBeTruthy())

    fireEvent.click(getByText('CONFIRM'))

    await waitFor(() => expect(getByText(/CONFIRM FAILED — 403/)).toBeTruthy())
    // The review stays in the queue so the manager can retry.
    expect(queryByText('2 GUIDES COMPLETE')).toBeTruthy()
  })
})
