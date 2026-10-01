import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { WorkerAvailabilityClient } from '@/components/worker/WorkerAvailabilityClient'
import { keyOfDay, parseDay } from '@/lib/date-nav'

const todayKey = keyOfDay(new Date())
const payload = {
  employmentType: 'CASUAL',
  lockDays: 0,
  today: todayKey,
  entries: [
    { id: 'a1', date: todayKey, type: 'PREFERRED', isAllDay: true, startTime: null, endTime: null, notes: null },
  ],
}

describe('WorkerAvailabilityClient', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('renders the calendar, legend and the casual opt-in buttons', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => payload } as Response)

    render(<WorkerAvailabilityClient />)

    expect(await screen.findByText('MY AVAILABILITY')).toBeDefined()
    expect(screen.getByText('Preferred')).toBeDefined()
    expect(screen.getByText('Unavailable')).toBeDefined()
    expect(screen.getByText('Unset')).toBeDefined()
    expect(screen.getByText(/TAP THE DAYS YOU CAN WORK/)).toBeDefined()
  })

  it('opens the day editor and saves an UNAVAILABLE state for the day', async () => {
    const spy = vi.spyOn(global, 'fetch').mockImplementation(async (_url: unknown, init?: RequestInit) => {
      if (init?.method === 'POST') return { ok: true, status: 200, json: async () => ({ entries: [] }) } as Response
      return { ok: true, status: 200, json: async () => payload } as Response
    })

    render(<WorkerAvailabilityClient />)
    await screen.findByText('MY AVAILABILITY')

    fireEvent.click(screen.getByText(String(parseDay(todayKey).getUTCDate())))

    // Editor appears — pick UNAVAILABLE, then save.
    fireEvent.click(await screen.findByText('UNAVAILABLE'))
    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(() => {
      const post = spy.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'POST')
      expect(post).toBeDefined()
      const body = JSON.parse((post![1] as RequestInit).body as string)
      expect(body.type).toBe('UNAVAILABLE')
      expect(body.isAllDay).toBe(true)
      expect(body.dates).toEqual([todayKey])
    })
  })
})
