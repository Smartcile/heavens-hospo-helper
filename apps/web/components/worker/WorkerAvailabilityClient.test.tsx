import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { WorkerAvailabilityClient } from '@/components/worker/WorkerAvailabilityClient'
import { keyOfDay, MONTH_ABBR, parseDay, shiftMonth } from '@/lib/date-nav'
import { DEFAULT_AVAILABILITY_PRESETS } from '@/lib/availability'

const todayKey = keyOfDay(new Date())
const payload = {
  employmentType: 'CASUAL',
  lockDays: 0,
  today: todayKey,
  presets: DEFAULT_AVAILABILITY_PRESETS,
  entries: [
    {
      id: 'a1', date: todayKey, type: 'AVAILABLE', isAllDay: true, startTime: null, endTime: null,
      windows: [], status: 'APPROVED', timeOff: false, notes: null, reason: null, reviewNote: null,
      seriesId: null, seriesEndDate: null, lockedAt: null, lockedById: null, lockedReason: null,
    },
  ],
  series: [],
  requests: [],
}

function useMonthView() {
  window.sessionStorage.setItem('hospo-worker-availability-view', 'month')
}

describe('WorkerAvailabilityClient', () => {
  beforeEach(() => { window.sessionStorage.clear() })
  afterEach(() => { vi.restoreAllMocks() })

  it('renders the calendar, legend, view toggle and casual hint', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => payload } as Response)

    render(<WorkerAvailabilityClient />)

    expect(await screen.findByText('MY AVAILABILITY')).toBeDefined()
    expect(screen.getByText('month')).toBeDefined()
    expect(screen.getByText('week')).toBeDefined()
    expect(screen.getByText('Available')).toBeDefined()
    expect(screen.getByText('Unavailable')).toBeDefined()
    expect(screen.getByText('Unset')).toBeDefined()
    expect(screen.getByText(/TAP THE DAYS YOU CAN WORK/)).toBeDefined()
  })

  it('saves an all-day UNAVAILABLE day with the new payload shape', async () => {
    useMonthView()
    const spy = vi.spyOn(global, 'fetch').mockImplementation(async (_url: unknown, init?: RequestInit) => {
      if (init?.method === 'POST') return { ok: true, status: 200, json: async () => ({ mode: 'SAVED', skipped: [] }) } as Response
      return { ok: true, status: 200, json: async () => payload } as Response
    })

    render(<WorkerAvailabilityClient />)
    await screen.findByText('MY AVAILABILITY')

    fireEvent.click(screen.getByText(String(parseDay(todayKey).getUTCDate())))
    fireEvent.click(await screen.findByText('UNAVAILABLE'))
    fireEvent.click(screen.getByRole('button', { name: /^SAVE/ }))

    await waitFor(() => {
      const post = spy.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'POST')
      expect(post).toBeDefined()
      const body = JSON.parse((post![1] as RequestInit).body as string)
      expect(body.date).toBe(todayKey)
      expect(body.availability.type).toBe('UNAVAILABLE')
      expect(body.availability.isAllDay).toBe(true)
    })
  })

  it('sends a time-off request tick in the payload', async () => {
    useMonthView()
    const spy = vi.spyOn(global, 'fetch').mockImplementation(async (_url: unknown, init?: RequestInit) => {
      if (init?.method === 'POST') return { ok: true, status: 200, json: async () => ({ mode: 'REQUEST', requestId: 'r1', skipped: [] }) } as Response
      return { ok: true, status: 200, json: async () => payload } as Response
    })

    render(<WorkerAvailabilityClient />)
    await screen.findByText('MY AVAILABILITY')

    fireEvent.click(screen.getByText(String(parseDay(todayKey).getUTCDate())))
    fireEvent.click(await screen.findByText('TIME OFF REQUEST'))
    fireEvent.click(screen.getByRole('button', { name: /^SAVE/ }))

    await waitFor(() => {
      const post = spy.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'POST')
      const body = JSON.parse((post![1] as RequestInit).body as string)
      expect(body.availability.timeOff).toBe(true)
    })
    expect(await screen.findByText(/EDIT REQUEST SENT/)).toBeDefined()
  })

  it('lists pending requests, shows the note and cancels one', async () => {
    const withRequest = {
      ...payload,
      requests: [{
        id: 'r1', date: todayKey, scope: 'THIS', action: 'CLEAR', seriesId: null,
        reason: 'FAMILY',
        payload: { availability: { notes: 'FAMILY' } },
      }],
    }
    const spy = vi.spyOn(global, 'fetch').mockImplementation(async (_url: unknown, init?: RequestInit) => {
      if (init?.method === 'DELETE') return { ok: true, status: 200, json: async () => ({ success: true }) } as Response
      return { ok: true, status: 200, json: async () => withRequest } as Response
    })

    render(<WorkerAvailabilityClient />)
    await screen.findByText('MY AVAILABILITY')

    expect(screen.getByText('WAITING FOR A MANAGER')).toBeDefined()
    // A CLEAR request reads as a cancel request to the worker.
    expect(screen.getByText(/CANCEL · JUST THIS DAY/)).toBeDefined()
    expect(screen.getByText('NOTE: FAMILY')).toBeDefined()
    fireEvent.click(screen.getByText('CANCEL REQUEST'))

    await waitFor(() => {
      const del = spy.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'DELETE')
      expect(del).toBeDefined()
      expect(String(del![0])).toBe(`/api/worker/availability/requests/r1`)
    })
    expect(await screen.findByText(/REQUEST CANCELLED/)).toBeDefined()
  })

  it('switches to the week view and shows each day as a track', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => payload } as Response)

    render(<WorkerAvailabilityClient />)
    await screen.findByText('MY AVAILABILITY')

    fireEvent.click(screen.getByText('week'))
    expect(await screen.findByText('ALL DAY')).toBeDefined()
    expect(screen.getByText('TODAY')).toBeDefined()
  })

  it('shows the stored note on a month cell', async () => {
    useMonthView()
    const withNote = {
      ...payload,
      entries: [{ ...payload.entries[0], notes: 'NEED SUNDAY OFF' }],
    }
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => withNote } as Response)

    render(<WorkerAvailabilityClient />)
    await screen.findByText('MY AVAILABILITY')

    expect(await screen.findByText('NOTE: NEED SUNDAY OFF')).toBeDefined()
  })

  it('shows the stored note on a week card', async () => {
    const withNote = {
      ...payload,
      entries: [{ ...payload.entries[0], notes: 'NEED SUNDAY OFF' }],
    }
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => withNote } as Response)

    render(<WorkerAvailabilityClient />)
    await screen.findByText('MY AVAILABILITY')

    fireEvent.click(screen.getByText('week'))
    expect(await screen.findByText('NOTE: NEED SUNDAY OFF')).toBeDefined()
  })

  it('shows the weekly request deadline when the venue sets one', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ ...payload, cutoff: { day: 4, time: '17:00' } }),
    } as Response)

    render(<WorkerAvailabilityClient />)
    expect(await screen.findByText(/THURSDAY 17:00/)).toBeDefined()
  })

  it('defaults to the week view', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => payload } as Response)

    render(<WorkerAvailabilityClient />)
    await screen.findByText('MY AVAILABILITY')

    expect(screen.getByText('TODAY')).toBeDefined()
    expect(screen.queryByText('MON')).toBeNull()
  })

  it('ignores an invalid saved view and restores a valid one on remount', async () => {
    window.sessionStorage.setItem('hospo-worker-availability-view', 'nonsense')
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => payload } as Response)

    const { unmount } = render(<WorkerAvailabilityClient />)
    await screen.findByText('MY AVAILABILITY')
    expect(screen.getByText('TODAY')).toBeDefined()

    fireEvent.click(screen.getByText('month'))
    unmount()

    render(<WorkerAvailabilityClient />)
    await screen.findByText('MY AVAILABILITY')
    expect(screen.getByText('MON')).toBeDefined()
  })

  it('shows a manager lock and sends the series save as a THIS change request', async () => {
    useMonthView()
    const locked = {
      ...payload,
      entries: [{
        ...payload.entries[0],
        seriesId: 's1',
        lockedAt: '2026-10-20T01:00:00.000Z',
        lockedReason: 'CONFIRMED',
      }],
      series: [{ id: 's1', startDate: todayKey, endDate: null, count: 104 }],
    }
    const spy = vi.spyOn(global, 'fetch').mockImplementation(async (_url: unknown, init?: RequestInit) => {
      if (init?.method === 'POST') return { ok: true, status: 200, json: async () => ({ mode: 'REQUEST', requestId: 'r1', skipped: [] }) } as Response
      return { ok: true, status: 200, json: async () => locked } as Response
    })

    render(<WorkerAvailabilityClient />)
    await screen.findByText('MY AVAILABILITY')
    fireEvent.click(screen.getByText(String(parseDay(todayKey).getUTCDate())))

    expect(await screen.findByText(/YOUR CHANGES WILL BE SENT AS A REQUEST/)).toBeDefined()
    expect(screen.queryByText('FROM THIS DAY ONWARDS')).toBeNull()
    fireEvent.click(screen.getByText('SEND CHANGE REQUEST'))

    await waitFor(() => {
      const post = spy.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'POST')
      expect(post).toBeDefined()
      const body = JSON.parse((post![1] as RequestInit).body as string)
      expect(body.scope).toBe('THIS')
      expect(body.seriesId).toBe('s1')
    })
  })

  it('saves a note on a locked day through the notes-only PATCH', async () => {
    useMonthView()
    const locked = {
      ...payload,
      entries: [{ ...payload.entries[0], lockedAt: '2026-10-20T01:00:00.000Z' }],
    }
    const spy = vi.spyOn(global, 'fetch').mockImplementation(async (_url: unknown, init?: RequestInit) => {
      if (init?.method === 'PATCH') return { ok: true, status: 200, json: async () => ({ success: true, notes: 'CALLED IN' }) } as Response
      return { ok: true, status: 200, json: async () => locked } as Response
    })

    render(<WorkerAvailabilityClient />)
    await screen.findByText('MY AVAILABILITY')
    fireEvent.click(screen.getByText(String(parseDay(todayKey).getUTCDate())))

    const note = await screen.findByPlaceholderText('NOTE FOR THE MANAGER (OPTIONAL)')
    fireEvent.change(note, { target: { value: 'CALLED IN' } })
    fireEvent.click(screen.getByText('SAVE NOTE'))

    await waitFor(() => {
      const patch = spy.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'PATCH')
      expect(patch).toBeDefined()
      expect(String(patch![0])).toBe('/api/worker/availability/a1')
      expect(JSON.parse((patch![1] as RequestInit).body as string)).toEqual({ notes: 'CALLED IN' })
    })
  })

  it('bulk clears selected days with THIS scope after confirmation', async () => {
    useMonthView()
    const spy = vi.spyOn(global, 'fetch').mockImplementation(async (_url: unknown, init?: RequestInit) => {
      if (init?.method === 'POST') return { ok: true, status: 200, json: async () => ({ mode: 'SAVED', skipped: [] }) } as Response
      return { ok: true, status: 200, json: async () => payload } as Response
    })

    render(<WorkerAvailabilityClient />)
    await screen.findByText('MY AVAILABILITY')

    fireEvent.click(screen.getByText('SELECT DAYS'))
    fireEvent.click(screen.getByText(String(parseDay(todayKey).getUTCDate())))
    expect(screen.getByText('1 SELECTED')).toBeDefined()

    fireEvent.click(screen.getByText('CLEAR'))
    await screen.findByText('CLEAR SELECTED DAYS')
    const clears = screen.getAllByRole('button', { name: 'CLEAR' })
    fireEvent.click(clears[clears.length - 1])

    await waitFor(() => {
      const post = spy.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'POST')
      expect(post).toBeDefined()
      expect(String(post![0])).toBe('/api/worker/availability/clear')
      const body = JSON.parse((post![1] as RequestInit).body as string)
      expect(body).toMatchObject({ date: todayKey, scope: 'THIS' })
    })
    expect(await screen.findByText(/1 DAY CLEARED/)).toBeDefined()
  })

  it('shift-click selects a contiguous day range', async () => {
    useMonthView()
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => payload } as Response)

    render(<WorkerAvailabilityClient />)
    await screen.findByText('MY AVAILABILITY')

    const now = parseDay(todayKey)
    const next = shiftMonth(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)

    fireEvent.click(screen.getByText('SELECT DAYS'))
    fireEvent.click(screen.getByText('>'))
    // Wait for the next month's grid (the load is async) before selecting.
    await screen.findByText(`${MONTH_ABBR[next.month - 1]} ${next.year}`)
    fireEvent.click(screen.getByText('1'))
    fireEvent.click(screen.getByText('3'), { shiftKey: true })

    expect(screen.getByText('3 SELECTED')).toBeDefined()
  })
  it('does not offer drag-copy on a filled editable day', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => payload } as Response)

    render(<WorkerAvailabilityClient />)
    await screen.findByText('MY AVAILABILITY')
    expect(screen.queryByTitle('DRAG TO COPY THIS DAY')).toBeNull()
  })
})
