import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { WorkerAvailabilityClient } from '@/components/worker/WorkerAvailabilityClient'
import { keyOfDay, parseDay } from '@/lib/date-nav'
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
      seriesId: null, seriesEndDate: null,
    },
  ],
  series: [],
  requests: [],
}

describe('WorkerAvailabilityClient', () => {
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

  it('lists pending requests and cancels one', async () => {
    const withRequest = {
      ...payload,
      requests: [{ id: 'r1', date: todayKey, scope: 'THIS', action: 'CLEAR', seriesId: null }],
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
})
