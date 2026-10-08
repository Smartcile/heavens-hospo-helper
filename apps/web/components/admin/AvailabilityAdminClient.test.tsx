import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { AvailabilityAdminClient } from '@/components/admin/AvailabilityAdminClient'
import { DEFAULT_AVAILABILITY_PRESETS } from '@/lib/availability'
import { keyOfDay, mondayOf } from '@/lib/date-nav'

const monday = mondayOf(keyOfDay(new Date()))

const data = {
  venueId: 'v1',
  staff: [
    { id: 'st1', firstName: 'TAYLOR', lastName: 'REED', employmentType: 'CASUAL' },
  ],
  entries: [],
  series: [],
  presets: DEFAULT_AVAILABILITY_PRESETS,
  queue: {
    pending: [
      {
        id: 'p1', staffId: 'st1', date: monday, type: 'UNAVAILABLE', isAllDay: true, startTime: null, endTime: null,
        windows: [], status: 'PENDING', timeOff: true, notes: 'LEAVE', reason: null, reviewNote: null,
        seriesId: null, seriesEndDate: null,
      },
    ],
    requests: [
      {
        id: 'req1', staffId: 'st1', date: monday, scope: 'THIS', seriesId: null, action: 'SET',
        payload: { availability: { isAllDay: true, type: 'AVAILABLE', windows: [], timeOff: false, notes: null } },
        reason: 'SWAPPED A SHIFT', status: 'PENDING', reviewNote: null, createdAt: '2026-10-01T00:00:00.000Z',
      },
    ],
  },
}

function mockFetch() {
  const spy = vi.spyOn(global, 'fetch').mockImplementation(async (url: unknown, init?: RequestInit) => {
    if (init?.method === 'POST') return { ok: true, status: 200, json: async () => ({ success: true }) } as Response
    return { ok: true, status: 200, json: async () => data } as Response
  })
  return spy
}

describe('AvailabilityAdminClient', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('lists pending declarations and confirms them by id', async () => {
    const spy = mockFetch()
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    expect((await screen.findAllByText('TAYLOR REED')).length).toBeGreaterThan(0)
    expect(screen.getByText(/TIME OFF — CHECK LEAVE PAY/)).toBeDefined()
    fireEvent.click(screen.getByText('CONFIRM'))

    await waitFor(() => {
      const post = spy.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'POST')
      const body = JSON.parse((post![1] as RequestInit).body as string)
      expect(body.ids).toEqual(['p1'])
      expect(body.action).toBe('APPROVE')
    })
  })

  it('applies a worker edit request', async () => {
    const spy = mockFetch()
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    expect(await screen.findByText(/EDIT REQUEST/)).toBeDefined()
    fireEvent.click(screen.getByText('APPLY'))

    await waitFor(() => {
      const post = spy.mock.calls.find((c) => String(c[0]).includes('/requests/req1'))
      expect(post).toBeDefined()
      const body = JSON.parse((post![1] as RequestInit).body as string)
      expect(body.action).toBe('APPLY')
    })
  })

  it('opens the override editor from the week grid and saves directly', async () => {
    const spy = mockFetch()
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    fireEvent.click(screen.getAllByText('—')[0])
    // The queue rows behind the modal also print "UNAVAILABLE" (labelled split
    // rows) — the editor's is the button.
    const unavailable = screen.getAllByText('UNAVAILABLE').find((el) => el.tagName === 'BUTTON')
    fireEvent.click(unavailable as HTMLElement)
    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(() => {
      const post = spy.mock.calls.find((c) =>
        String(c[0]).endsWith('/api/admin/availability') && (c[1] as RequestInit | undefined)?.method === 'POST')
      expect(post).toBeDefined()
      const body = JSON.parse((post![1] as RequestInit).body as string)
      expect(body.staffId).toBe('st1')
      expect(body.availability.type).toBe('UNAVAILABLE')
    })
  })
})
