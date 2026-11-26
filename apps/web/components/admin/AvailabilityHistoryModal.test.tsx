import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { AvailabilityHistoryModal } from '@/components/admin/AvailabilityHistoryModal'

const request = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  staffId: 'st1',
  staffName: 'TAYLOR REED',
  date: '2026-11-12',
  scope: 'THIS',
  seriesId: null,
  action: 'SET',
  payload: {
    availability: { isAllDay: false, type: 'UNAVAILABLE', windows: [{ type: 'AVAILABLE', startTime: '07:00', endTime: '15:00' }], timeOff: false, notes: null },
    writeDates: ['2026-11-12'],
    removeDates: [],
  },
  targetDates: ['2026-11-12'],
  reason: 'SWAPPED A SHIFT',
  status: 'APPLIED',
  reviewNote: 'CALLED THE VENUE',
  reviewedById: 'm1',
  reviewedAt: '2026-11-13T01:00:00.000Z',
  reviewedByLabel: 'MORGAN LEE',
  deleted: false,
  createdAt: '2026-11-12T00:00:00.000Z',
  comments: [
    {
      id: 'c1', staffId: 'st1', date: '2026-11-12', body: 'CALLED THE VENUE', source: 'MANAGER',
      authorName: 'MORGAN LEE', createdAt: '2026-11-13T01:00:00.000Z',
    },
  ],
  ...over,
})

const day = {
  id: 'd1',
  staffId: 'st1',
  staffName: 'TAYLOR REED',
  date: '2026-11-12',
  type: 'UNAVAILABLE',
  isAllDay: true,
  startTime: null,
  endTime: null,
  windows: [],
  status: 'APPROVED',
  timeOff: true,
  notes: 'LEAVE',
  reason: null,
  reviewNote: 'OK',
  reviewedById: 'm1',
  reviewedAt: '2026-11-01T00:00:00.000Z',
  reviewedByName: 'MORGAN LEE',
  seriesId: null,
  seriesEndDate: null,
  lockedAt: '2026-11-01T00:00:00.000Z',
  lockedById: 'm1',
  lockedByName: 'MORGAN LEE',
  lockedReason: 'TRIP',
  cancelled: true,
  comments: [],
}

function history(over: Record<string, unknown> = {}) {
  return {
    venueId: 'v1',
    today: '2026-11-26',
    from: '2026-08-29',
    to: '2026-11-26',
    staff: [
      { id: 'st1', name: 'TAYLOR REED' },
      { id: 'm1', name: 'MORGAN LEE' },
    ],
    requests: [request()],
    days: [day],
    truncated: false,
    ...over,
  }
}

function mockFetch(payload: unknown) {
  return vi.spyOn(global, 'fetch').mockImplementation(async () => (
    { ok: true, status: 200, json: async () => payload } as Response
  ))
}

function renderModal(props: Partial<ComponentProps<typeof AvailabilityHistoryModal>> = {}) {
  return render(
    <AvailabilityHistoryModal isOpen venueId="v1" onClose={() => undefined} {...props} />,
  )
}

describe('AvailabilityHistoryModal', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('loads the history for the venue and lists requests with their outcome', async () => {
    const spy = mockFetch(history())
    renderModal()

    expect(await screen.findByRole('button', { name: /TAYLOR REED/ })).toBeDefined()
    expect(screen.getByRole('button', { name: /APPLIED/ })).toBeDefined()
    expect(screen.getByText('REQUESTS (1)')).toBeDefined()
    expect(screen.getByText('DAYS (1)')).toBeDefined()
    expect(spy.mock.calls[0][0]).toContain('/api/admin/availability/history?venueId=v1')
  })

  it('expands a request to show the current vs proposed day, reviewer, note and comments', async () => {
    mockFetch(history())
    renderModal()

    fireEvent.click(await screen.findByRole('button', { name: /APPLIED/ }))

    expect(screen.getByText('CURRENT DAY')).toBeDefined()
    expect(screen.getByText('PROPOSED')).toBeDefined()
    expect(screen.getAllByText(/07:00–15:00/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/MORGAN LEE/).length).toBeGreaterThan(0)
    expect(screen.getByText('NOTE: CALLED THE VENUE')).toBeDefined()
    expect(screen.getByText('REASON: SWAPPED A SHIFT')).toBeDefined()
    expect(screen.getByText('COMMENTS')).toBeDefined()
  })

  it('shows a withdrawn request by default and hides it when the toggle is off', async () => {
    mockFetch(history({
      requests: [
        request(),
        request({ id: 'r2', staffName: 'WITHDRAWN WORKER', status: 'DISCARDED', deleted: true, reviewedById: 'st1', reviewedByLabel: 'TAYLOR REED' }),
      ],
    }))
    renderModal()

    expect(await screen.findByText('WITHDRAWN WORKER')).toBeDefined()
    fireEvent.click(screen.getByLabelText('SHOW WITHDRAWN / REMOVED / CANCELLED') as HTMLInputElement)
    await waitFor(() => expect(screen.queryByText('WITHDRAWN WORKER')).toBeNull())
  })

  it('labels a legacy soft-deleted request REMOVED, never WITHDRAWN', async () => {
    mockFetch(history({
      requests: [request({ staffName: 'REMOVED WORKER', status: 'PENDING', deleted: true, reviewedByLabel: null, reviewedAt: null, reviewNote: null })],
    }))
    renderModal()

    expect(await screen.findByText('REMOVED WORKER')).toBeDefined()
    expect(screen.getByRole('button', { name: /REMOVED/ })).toBeDefined()
    expect(screen.queryByRole('button', { name: /WITHDRAWN/ })).toBeNull()
  })

  it('filters requests by status', async () => {
    mockFetch(history({
      requests: [
        request(),
        request({ id: 'r2', staffName: 'WAITING WORKER', status: 'PENDING', reviewedByLabel: null, reviewedAt: null, reviewNote: null }),
      ],
    }))
    renderModal()

    await screen.findByText('WAITING WORKER')
    fireEvent.change(screen.getByLabelText('Filter history by status'), { target: { value: 'APPLIED' } })

    await waitFor(() => expect(screen.queryByText('WAITING WORKER')).toBeNull())
    expect(screen.getByRole('button', { name: /APPLIED/ })).toBeDefined()
  })

  it('sends the staff and status filters to the route as well as filtering instantly', async () => {
    const spy = mockFetch(history({
      requests: [
        request(),
        request({ id: 'r2', staffName: 'WAITING WORKER', status: 'PENDING', reviewedByLabel: null, reviewedAt: null, reviewNote: null }),
      ],
    }))
    renderModal()

    await screen.findByText('WAITING WORKER')
    expect(String(spy.mock.calls[0][0])).toContain('includeDeleted=1')

    fireEvent.change(screen.getByLabelText('Filter history by staff'), { target: { value: 'm1' } })

    // The narrow view is requested from the API (so caps cannot under-report)
    // while the client filter has already hidden the other person's row.
    await waitFor(() => {
      expect(spy.mock.calls.some((c) => String(c[0]).includes('staffId=m1'))).toBe(true)
    })
    expect(screen.queryByText('WAITING WORKER')).toBeNull()

    fireEvent.change(screen.getByLabelText('Filter history by status'), { target: { value: 'APPLIED' } })
    await waitFor(() => {
      expect(spy.mock.calls.some((c) => String(c[0]).includes('status=APPLIED'))).toBe(true)
    })

    fireEvent.click(screen.getByLabelText('SHOW WITHDRAWN / REMOVED / CANCELLED') as HTMLInputElement)
    await waitFor(() => {
      expect(spy.mock.calls.some((c) => String(c[0]).includes('includeDeleted=0'))).toBe(true)
    })
  })

  it('refetches every range from the server today, never the device clock', async () => {
    const spy = mockFetch(history())
    renderModal()

    await screen.findByRole('button', { name: /APPLIED/ })
    expect(screen.getByText(/VENUE-LOCAL TODAY 26-11-2026/)).toBeDefined()

    const select = screen.getByLabelText('Filter history by date range')

    fireEvent.change(select, { target: { value: 'NEXT_90' } })
    await waitFor(() => {
      expect(spy.mock.calls.some((c) => String(c[0]).includes('from=2026-11-26&to=2027-02-24'))).toBe(true)
    })

    fireEvent.change(select, { target: { value: 'PAST_30' } })
    await waitFor(() => {
      expect(spy.mock.calls.some((c) => String(c[0]).includes('from=2026-10-28&to=2026-11-26'))).toBe(true)
    })

    fireEvent.change(select, { target: { value: 'PAST_365' } })
    await waitFor(() => {
      expect(spy.mock.calls.some((c) => String(c[0]).includes('from=2025-11-27&to=2026-11-26'))).toBe(true)
    })

    fireEvent.change(select, { target: { value: 'SPAN_180' } })
    await waitFor(() => {
      expect(spy.mock.calls.some((c) => String(c[0]).includes('from=2026-08-29&to=2027-02-24'))).toBe(true)
    })
  })

  it('opens with the person filter already applied in a single request', async () => {
    const spy = mockFetch(history())
    const { rerender } = render(
      <AvailabilityHistoryModal isOpen={false} venueId="v1" onClose={() => undefined} initialStaffId="st1" />,
    )
    rerender(<AvailabilityHistoryModal isOpen venueId="v1" onClose={() => undefined} initialStaffId="st1" />)

    await screen.findByRole('button', { name: /APPLIED/ })
    const historyCalls = spy.mock.calls.filter((c) => String(c[0]).includes('/availability/history'))
    expect(historyCalls).toHaveLength(1)
    expect(String(historyCalls[0][0])).toContain('staffId=st1')
  })

  it('shows cancelled declaration days with their review and lock stamps', async () => {
    mockFetch(history())
    renderModal()

    fireEvent.click(await screen.findByRole('button', { name: /DAYS \(1\)/ }))
    fireEvent.click(await screen.findByRole('button', { name: /CANCELLED/ }))

    expect(screen.getByText('REVIEWED BY')).toBeDefined()
    expect(screen.getAllByText(/MORGAN LEE/).length).toBeGreaterThan(0)
    expect(screen.getByText('LOCK REASON: TRIP')).toBeDefined()
    expect(screen.getByText('REVIEW NOTE: OK')).toBeDefined()
  })

  it('offers OPEN IN QUEUE for a pending request and nothing else writable', async () => {
    const onOpenQueue = vi.fn()
    mockFetch(history({ requests: [request({ status: 'PENDING', reviewedByLabel: null, reviewedAt: null, reviewNote: null })] }))
    renderModal({ onOpenQueue })

    fireEvent.click(await screen.findByRole('button', { name: /PENDING/ }))
    fireEvent.click(screen.getByText('OPEN IN QUEUE'))

    expect(onOpenQueue).toHaveBeenCalledWith('st1')
    expect(screen.queryByText('APPLY')).toBeNull()
    expect(screen.queryByText('DISCARD')).toBeNull()
  })

  it('stays read-only for a viewer with no queue access', async () => {
    mockFetch(history({ requests: [request({ status: 'PENDING', reviewedByLabel: null, reviewedAt: null, reviewNote: null })] }))
    renderModal()

    fireEvent.click(await screen.findByRole('button', { name: /PENDING/ }))

    expect(screen.queryByText('OPEN IN QUEUE')).toBeNull()
    expect(screen.getByText('READ ONLY — THIS IS THE RECORD, NOT AN ACTION SCREEN.')).toBeDefined()
  })

  it('shows an empty state when the range has no history', async () => {
    mockFetch(history({ requests: [], days: [] }))
    renderModal()

    expect(await screen.findByText('NO HISTORY FOR THIS RANGE.')).toBeDefined()
  })
})
