import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { AvailabilityAdminClient } from '@/components/admin/AvailabilityAdminClient'
import { DEFAULT_AVAILABILITY_PRESETS } from '@/lib/availability'
import { formatDateDayDMY, formatDateDMY, localDayKey, mondayOf, shiftDay } from '@/lib/date-nav'

const monday = mondayOf(localDayKey())

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
        seriesId: null, seriesEndDate: null, lockedAt: null, lockedById: null, lockedReason: null,
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

function mockFetch(payload: unknown = data) {
  const spy = vi.spyOn(global, 'fetch').mockImplementation(async (_url: unknown, init?: RequestInit) => {
    if (init?.method === 'POST') return { ok: true, status: 200, json: async () => ({ success: true }) } as Response
    return { ok: true, status: 200, json: async () => payload } as Response
  })
  return spy
}

describe('AvailabilityAdminClient', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete (document as unknown as { elementFromPoint?: unknown }).elementFromPoint
  })

  it('lists pending people and confirms a declaration by id', async () => {
    const spy = mockFetch()
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    expect((await screen.findAllByText('TAYLOR REED')).length).toBeGreaterThan(0)
    expect(screen.getByText('2 PENDING')).toBeDefined()
    fireEvent.click(screen.getByText('OPEN →'))

    expect(screen.getByText(/TIME OFF — CHECK LEAVE PAY/)).toBeDefined()
    expect(screen.getAllByText('COMMENTS').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByText('CONFIRM'))

    await waitFor(() => {
      const post = spy.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'POST')
      const body = JSON.parse((post![1] as RequestInit).body as string)
      expect(body.ids).toEqual(['p1'])
      expect(body.action).toBe('APPROVE')
    })
  })

  it('applies a worker edit request from the person modal', async () => {
    const spy = mockFetch()
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    fireEvent.click(screen.getByText('OPEN →'))
    expect(await screen.findByText('EDIT REQUEST')).toBeDefined()
    fireEvent.click(screen.getByText('APPLY'))

    await waitFor(() => {
      const post = spy.mock.calls.find((c) => String(c[0]).includes('/requests/req1'))
      expect(post).toBeDefined()
      const body = JSON.parse((post![1] as RequestInit).body as string)
      expect(body.action).toBe('APPLY')
    })
  })

  it('surfaces the LOCKED 409 and does not pretend the apply succeeded', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (url: unknown, init?: RequestInit) => {
      if (String(url).includes('/requests/req1') && init?.method === 'POST') {
        return {
          ok: false,
          status: 409,
          json: async () => ({ error: 'LOCKED — UNLOCK FIRST', locked: [monday], skipped: [monday] }),
        } as Response
      }
      return { ok: true, status: 200, json: async () => data } as Response
    })
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    fireEvent.click(screen.getByText('OPEN →'))
    fireEvent.click(await screen.findByText('APPLY'))

    expect((await screen.findAllByText('LOCKED — UNLOCK FIRST')).length).toBeGreaterThan(0)
    expect(screen.getByText('EDIT REQUEST')).toBeDefined()
  })

  it('reports the skipped days after a partial apply', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (url: unknown, init?: RequestInit) => {
      if (String(url).includes('/requests/req1') && init?.method === 'POST') {
        return { ok: true, status: 200, json: async () => ({ success: true, skipped: [monday], wrote: 1 }) } as Response
      }
      return { ok: true, status: 200, json: async () => data } as Response
    })
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    fireEvent.click(screen.getByText('OPEN →'))
    fireEvent.click(await screen.findByText('APPLY'))

    expect((await screen.findAllByText(/1 DAY\(S\) SKIPPED/)).length).toBeGreaterThan(0)
  })

  it('lists every target day and flags a locked one before applying', async () => {
    const lockedDay = monday
    const otherDay = shiftDay(monday, 7)
    const multiDay = {
      ...data,
      entries: [
        {
          id: 'e1', staffId: 'st1', date: lockedDay, type: 'UNAVAILABLE', isAllDay: true, startTime: null, endTime: null,
          windows: [], status: 'APPROVED', timeOff: false, notes: null, reason: null, reviewNote: null,
          seriesId: 's1', seriesEndDate: null, lockedAt: '2026-10-20T01:00:00.000Z', lockedById: 'm1', lockedReason: null,
        },
      ],
      queue: {
        pending: [],
        requests: [{
          ...data.queue.requests[0],
          scope: 'FROM',
          seriesId: 's1',
          payload: {
            availability: { isAllDay: true, type: 'AVAILABLE', windows: [], timeOff: false, notes: null },
            writeDates: [lockedDay, otherDay],
            removeDates: [],
          },
        }],
      },
    }
    mockFetch(multiDay)
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    fireEvent.click(screen.getByText('OPEN →'))

    expect(await screen.findByText('TARGET DAYS:')).toBeDefined()
    expect(screen.getByText(formatDateDMY(otherDay))).toBeDefined()
    expect(screen.getAllByText('LOCKED').length).toBeGreaterThan(0)
    expect(screen.getByText('LOCKED — UNLOCK FIRST BEFORE APPLYING')).toBeDefined()
  })

  it('only lists people who have pending items', async () => {    const withIdleStaff = {
      ...data,
      staff: [
        { id: 'st1', firstName: 'TAYLOR', lastName: 'REED', employmentType: 'CASUAL' },
        { id: 'st2', firstName: 'ANN', lastName: 'LEE', employmentType: 'CASUAL' },
      ],
    }
    mockFetch(withIdleStaff)
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    expect(screen.getAllByText('OPEN →')).toHaveLength(1)
    expect(screen.getByText('2 PENDING')).toBeDefined()
  })

  it('shows the current and proposed day plus the worker note on an edit request', async () => {
    const withCurrent = {
      ...data,
      entries: [
        {
          id: 'e1', staffId: 'st1', date: monday, type: 'UNAVAILABLE', isAllDay: true, startTime: null, endTime: null,
          windows: [], status: 'APPROVED', timeOff: false, notes: 'OLD NOTE', reason: null, reviewNote: null,
          seriesId: null, seriesEndDate: null, lockedAt: null, lockedById: null, lockedReason: null,
        },
      ],
      queue: {
        pending: [],
        requests: [{
          ...data.queue.requests[0],
          reason: 'SWAPPED A SHIFT',
          payload: { availability: { isAllDay: true, type: 'AVAILABLE', windows: [], timeOff: false, notes: 'NEW NOTE' } },
        }],
      },
    }
    mockFetch(withCurrent)
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    fireEvent.click(screen.getByText('OPEN →'))

    // The request popup shows the weekday with a day-first DD-MM-YYYY date.
    expect(screen.getByText(new RegExp(`${formatDateDayDMY(monday)} · JUST THIS DAY`))).toBeDefined()
    expect(screen.getByText('CURRENT DAY')).toBeDefined()
    expect(screen.getByText('PROPOSED')).toBeDefined()
    expect(screen.getAllByText('NOTE: OLD NOTE').length).toBeGreaterThan(0)
    expect(screen.getByText('NOTE: NEW NOTE')).toBeDefined()
    expect(screen.getAllByText('COMMENTS').length).toBeGreaterThan(0)
    expect(await screen.findByText(/LEGACY REASON: SWAPPED A SHIFT/)).toBeDefined()
    expect(screen.getByText(/REPLACES THE CURRENT APPROVED DAY/)).toBeDefined()
  })

  it('opens the pending declaration in the editor and saves an override', async () => {
    const spy = mockFetch({ ...data, queue: { ...data.queue, requests: [] } })
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    fireEvent.click(screen.getByText('OPEN →'))
    fireEvent.click(screen.getByText('OPEN / EDIT'))

    expect(await screen.findByText('COMMENTS')).toBeDefined()
    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(() => {
      const post = spy.mock.calls.find((c) =>
        String(c[0]).endsWith('/api/admin/availability') && (c[1] as RequestInit | undefined)?.method === 'POST')
      expect(post).toBeDefined()
      const body = JSON.parse((post![1] as RequestInit).body as string)
      expect(body.staffId).toBe('st1')
      expect(body.availability.type).toBe('UNAVAILABLE')
      expect(body.availability.notes).toBe('LEAVE')
    })
    expect(spy.mock.calls.some((c) => String(c[0]).includes('/requests/'))).toBe(false)
  })

  it('opens a SET proposal in the editor, saves the override, then marks the request applied', async () => {
    const requestOnly = {
      ...data,
      queue: {
        pending: [],
        requests: [{
          ...data.queue.requests[0],
          payload: { availability: { isAllDay: true, type: 'AVAILABLE', windows: [], timeOff: false, notes: 'NEW NOTE' } },
        }],
      },
    }
    const spy = mockFetch(requestOnly)
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    fireEvent.click(screen.getByText('OPEN →'))
    fireEvent.click(screen.getByText('OPEN / EDIT PROPOSED'))

    expect(await screen.findByText('COMMENTS')).toBeDefined()
    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(() => {
      const save = spy.mock.calls.find((c) =>
        String(c[0]).endsWith('/api/admin/availability') && (c[1] as RequestInit | undefined)?.method === 'POST')
      expect(save).toBeDefined()
      const body = JSON.parse((save![1] as RequestInit).body as string)
      expect(body.availability.type).toBe('AVAILABLE')
      expect(body.availability.notes).toBe('NEW NOTE')
    })

    await waitFor(() => {
      const mark = spy.mock.calls.find((c) => String(c[0]).includes('/requests/req1'))
      expect(mark).toBeDefined()
      const body = JSON.parse((mark![1] as RequestInit).body as string)
      expect(body.action).toBe('MARK_APPLIED')
    })
  })

  it('applies an old CLEAR request from the queue', async () => {
    const clearRequest = {
      ...data,
      entries: [
        {
          id: 'e1', staffId: 'st1', date: monday, type: 'UNAVAILABLE', isAllDay: true, startTime: null, endTime: null,
          windows: [], status: 'APPROVED', timeOff: false, notes: 'OLD NOTE', reason: null, reviewNote: null,
          seriesId: null, seriesEndDate: null, lockedAt: null, lockedById: null, lockedReason: null,
        },
      ],
      queue: {
        pending: [],
        requests: [{ ...data.queue.requests[0], action: 'CLEAR', payload: null }],
      },
    }
    const spy = mockFetch(clearRequest)
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    fireEvent.click(screen.getByText('OPEN →'))
    expect(await screen.findByText('CLEAR THIS DAY')).toBeDefined()
    fireEvent.click(screen.getByText('APPLY'))

    await waitFor(() => {
      const post = spy.mock.calls.find((c) => String(c[0]).includes('/requests/req1'))
      expect(post).toBeDefined()
      const body = JSON.parse((post![1] as RequestInit).body as string)
      expect(body.action).toBe('APPLY')
    })
  })

  it('labels a CLEAR/FROM request as a series removal', async () => {
    const seriesRemoval = {
      ...data,
      entries: [
        {
          id: 'e1', staffId: 'st1', date: monday, type: 'UNAVAILABLE', isAllDay: true, startTime: null, endTime: null,
          windows: [], status: 'APPROVED', timeOff: false, notes: null, reason: null, reviewNote: null,
          seriesId: 's1', seriesEndDate: null, lockedAt: null, lockedById: null, lockedReason: null,
        },
      ],
      queue: {
        pending: [],
        requests: [{ ...data.queue.requests[0], action: 'CLEAR', scope: 'FROM', seriesId: 's1', payload: null }],
      },
    }
    mockFetch(seriesRemoval)
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    fireEvent.click(screen.getByText('OPEN →'))

    expect(await screen.findByText(/CLEAR · REMOVE SERIES FROM THIS DAY/)).toBeDefined()
    expect(screen.getAllByText('REMOVE SERIES FROM THIS DAY').length).toBeGreaterThan(0)
  })

  it('keeps the proposed request open with an error when MARK_APPLIED fails', async () => {
    const requestOnly = {
      ...data,
      queue: {
        pending: [],
        requests: [{
          ...data.queue.requests[0],
          payload: { availability: { isAllDay: true, type: 'AVAILABLE', windows: [], timeOff: false, notes: 'NEW NOTE' } },
        }],
      },
    }
    vi.spyOn(global, 'fetch').mockImplementation(async (url: unknown, init?: RequestInit) => {
      if (String(url).includes('/requests/req1') && init?.method === 'POST') {
        return { ok: false, status: 403, json: async () => ({ error: 'Forbidden' }) } as Response
      }
      if (init?.method === 'POST') {
        return { ok: true, status: 200, json: async () => ({ success: true }) } as Response
      }
      return { ok: true, status: 200, json: async () => requestOnly } as Response
    })
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    fireEvent.click(screen.getByText('OPEN →'))
    fireEvent.click(screen.getByText('OPEN / EDIT PROPOSED'))
    fireEvent.click(screen.getByText('SAVE'))

    expect((await screen.findAllByText(/COULD NOT BE MARKED APPLIED/)).length).toBeGreaterThan(0)
  })

  it('preserves the proposal scope and series id when saving an override', async () => {
    const seriesRequest = {
      ...data,
      series: [{ id: 's1', staffId: 'st1', startDate: monday, endDate: shiftDay(monday, 21), dates: [monday] }],
      queue: {
        pending: [],
        requests: [{
          ...data.queue.requests[0],
          scope: 'FROM',
          seriesId: 's1',
          payload: { availability: { isAllDay: true, type: 'AVAILABLE', windows: [], timeOff: false, notes: 'SERIES NOTE' } },
        }],
      },
    }
    const spy = mockFetch(seriesRequest)
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    fireEvent.click(screen.getByText('OPEN →'))
    fireEvent.click(screen.getByText('OPEN / EDIT PROPOSED'))
    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(() => {
      const save = spy.mock.calls.find((c) =>
        String(c[0]).endsWith('/api/admin/availability') && (c[1] as RequestInit | undefined)?.method === 'POST')
      expect(save).toBeDefined()
      const body = JSON.parse((save![1] as RequestInit).body as string)
      expect(body.scope).toBe('FROM')
      expect(body.seriesId).toBe('s1')
    })
  })

  it('filters the grid without hiding the approvals queue', async () => {
    mockFetch()
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    fireEvent.click(screen.getByRole('button', { name: /FILTER STAFF/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /TAYLOR REED/ }))
    fireEvent.click(screen.getByText('DONE'))

    expect(await screen.findByText('NO STAFF MATCH THE FILTER.')).toBeDefined()
    expect(screen.getByText('2 PENDING')).toBeDefined()
    expect(screen.getByText('OPEN →')).toBeDefined()
  })

  it('hides empty position groups after filtering staff', async () => {
    const grouped = {
      ...data,
      staff: [
        { id: 'st1', firstName: 'TAYLOR', lastName: 'REED', employmentType: 'CASUAL', positions: [{ id: 'p1', name: 'MANAGER', colour: '#F00' }] },
        { id: 'st2', firstName: 'ANN', lastName: 'LEE', employmentType: 'CASUAL', positions: [{ id: 'p2', name: 'SENIOR', colour: null }] },
      ],
      positions: [
        { id: 'p1', name: 'MANAGER', colour: '#F00', sortOrder: 0 },
        { id: 'p2', name: 'SENIOR', colour: null, sortOrder: 1 },
      ],
    }
    mockFetch(grouped)
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    fireEvent.click(screen.getByRole('button', { name: /FILTER STAFF/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /TAYLOR REED/ }))
    fireEvent.click(screen.getByText('DONE'))

    await waitFor(() => expect(screen.queryByText('MANAGER')).toBeNull())
    expect(screen.getByText('SENIOR')).toBeDefined()
    expect(screen.getByText('2 PENDING')).toBeDefined()
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

  it('cancels a pending declaration from the queue without a verdict', async () => {
    const spy = mockFetch()
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    fireEvent.click(screen.getByText('OPEN →'))
    fireEvent.click(screen.getByText('CANCEL'))

    await waitFor(() => {
      const post = spy.mock.calls.find((c) => String(c[0]).includes('/api/admin/availability/review'))
      expect(post).toBeDefined()
      const body = JSON.parse((post![1] as RequestInit).body as string)
      expect(body.action).toBe('DELETE')
      expect(body.ids).toEqual(['p1'])
    })
  })

  it('offers an ADMIN a series delete with a scope warning and no popup CLEAR', async () => {
    const withSeries = {
      ...data,
      entries: [
        {
          id: 'e1', staffId: 'st1', date: monday, type: 'AVAILABLE', isAllDay: true, startTime: null, endTime: null,
          windows: [], status: 'APPROVED', timeOff: false, notes: null, reason: null, reviewNote: null,
          seriesId: 's1', seriesEndDate: shiftDay(monday, 21), lockedAt: null, lockedById: null, lockedReason: null,
        },
      ],
      series: [{ id: 's1', startDate: monday, endDate: shiftDay(monday, 21), dates: [monday] }],
      queue: { pending: [], requests: [] },
    }
    const spy = mockFetch(withSeries)
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    fireEvent.click(screen.getByText('00:00–24:00'))

    expect(await screen.findByText('DELETE SERIES')).toBeDefined()
    expect(screen.queryByText('CLEAR')).toBeNull()

    fireEvent.click(screen.getByText('DELETE SERIES'))
    expect(await screen.findByText('DELETE AVAILABILITY SERIES')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'WHOLE SERIES' }))

    await waitFor(() => {
      const post = spy.mock.calls.find((c) =>
        String(c[0]).endsWith('/api/admin/availability/delete-series') && (c[1] as RequestInit | undefined)?.method === 'POST')
      expect(post).toBeDefined()
      const body = JSON.parse((post![1] as RequestInit).body as string)
      expect(body).toMatchObject({ staffId: 'st1', date: monday, scope: 'ALL', seriesId: 's1' })
    })
  })

  it('does not offer series actions to a manager without the edit grant', async () => {
    const withSeries = {
      ...data,
      entries: [
        {
          id: 'e1', staffId: 'st1', date: monday, type: 'AVAILABLE', isAllDay: true, startTime: null, endTime: null,
          windows: [], status: 'APPROVED', timeOff: false, notes: null, reason: null, reviewNote: null,
          seriesId: 's1', seriesEndDate: shiftDay(monday, 21), lockedAt: null, lockedById: null, lockedReason: null,
        },
      ],
      series: [{ id: 's1', startDate: monday, endDate: shiftDay(monday, 21), dates: [monday] }],
      queue: { pending: [], requests: [] },
    }
    mockFetch(withSeries)
    render(<AvailabilityAdminClient role="MANAGER" sessionVenueId="v1" defaultVenueId="v1" canEdit={false} />)

    await screen.findAllByText('TAYLOR REED')
    fireEvent.click(screen.getByText('00:00–24:00'))

    expect(screen.queryByText('DELETE SERIES')).toBeNull()
    expect(screen.queryByText('UNLOCK SERIES')).toBeNull()
  })

  it('offers series actions to a restricted manager with the edit grant', async () => {
    const withSeries = {
      ...data,
      entries: [
        {
          id: 'e1', staffId: 'st1', date: monday, type: 'AVAILABLE', isAllDay: true, startTime: null, endTime: null,
          windows: [], status: 'APPROVED', timeOff: false, notes: null, reason: null, reviewNote: null,
          seriesId: 's1', seriesEndDate: shiftDay(monday, 21), lockedAt: null, lockedById: null, lockedReason: null,
        },
      ],
      series: [{ id: 's1', startDate: monday, endDate: shiftDay(monday, 21), dates: [monday] }],
      queue: { pending: [], requests: [] },
    }
    mockFetch(withSeries)
    render(<AvailabilityAdminClient role="MANAGER" sessionVenueId="v1" defaultVenueId="v1" canEdit />)

    await screen.findAllByText('TAYLOR REED')
    fireEvent.click(screen.getByText('00:00–24:00'))

    expect(await screen.findByText('DELETE SERIES')).toBeDefined()
    expect(screen.getByText('UNLOCK SERIES')).toBeDefined()
  })

  it('shows a stored note on an approved grid day', async () => {
    const withNote = {
      ...data,
      entries: [
        {
          id: 'e1', staffId: 'st1', date: monday, type: 'AVAILABLE', isAllDay: true, startTime: null, endTime: null,
          windows: [], status: 'APPROVED', timeOff: false, notes: 'SCHOOL PICKUP', reason: null, reviewNote: null,
          seriesId: null, seriesEndDate: null, lockedAt: null, lockedById: null, lockedReason: null,
        },
      ],
      queue: { pending: [], requests: [] },
    }
    mockFetch(withNote)
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    expect(await screen.findByText('NOTE: SCHOOL PICKUP')).toBeDefined()
  })

  it('opens the staff editor when a name in the grid is clicked', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (url: unknown) => {
      const u = String(url)
      if (/\/api\/admin\/staff\/[^/]+$/.test(u)) {
        return {
          ok: true, status: 200, json: async () => ({
            id: 'st1', firstName: 'TAYLOR', lastName: 'REED', email: null, role: 'STAFF', venueId: 'v1',
            departmentId: null, hourlyRate: null, employmentType: 'CASUAL', taxCode: null, kiwiSaverRate: null,
            studentLoan: false, swiftPosId: null, myHrId: null, loadedReportsId: null, sections: [], positions: [],
            staffVenues: [],
          }),
        } as Response
      }
      if (u.includes('/api/admin/venues') || u.includes('/api/admin/departments') || u.includes('/api/admin/sections') || u.includes('/api/admin/positions')) {
        return { ok: true, status: 200, json: async () => [] } as Response
      }
      return { ok: true, status: 200, json: async () => data } as Response
    })

    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    const nameButtons = await screen.findAllByTitle('EDIT STAFF')
    fireEvent.click(nameButtons[0])
    expect(await screen.findByText('EDIT STAFF')).toBeDefined()
  })

  it('renders the shared DateNav range control and position group headers', async () => {
    const grouped = {
      ...data,
      staff: [
        { id: 'st1', firstName: 'TAYLOR', lastName: 'REED', employmentType: 'CASUAL', positions: [{ id: 'p1', name: 'MANAGER', colour: '#F00' }] },
        { id: 'st2', firstName: 'ANN', lastName: 'LEE', employmentType: 'CASUAL', positions: [{ id: 'p2', name: 'SENIOR', colour: null }] },
      ],
      positions: [
        { id: 'p1', name: 'MANAGER', colour: '#F00', sortOrder: 0 },
        { id: 'p2', name: 'SENIOR', colour: null, sortOrder: 1 },
      ],
      queue: { pending: [], requests: [] },
      entries: [],
    }
    mockFetch(grouped)
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    // DateNav renders its SELECT trigger (same control as Orders/Roster).
    expect(await screen.findByTitle('SELECT DATE')).toBeDefined()
    expect(screen.getByText('MANAGER')).toBeDefined()
    expect(screen.getByText('SENIOR')).toBeDefined()
  })

  it('pins a day, keeps the position groups and floats the available staff within each', async () => {
    const pinned = {
      ...data,
      staff: [
        { id: 'st1', firstName: 'TAYLOR', lastName: 'REED', employmentType: 'CASUAL', positions: [{ id: 'p1', name: 'MANAGER', colour: null }] },
        { id: 'st2', firstName: 'ANN', lastName: 'LEE', employmentType: 'CASUAL', positions: [{ id: 'p1', name: 'MANAGER', colour: null }] },
      ],
      positions: [{ id: 'p1', name: 'MANAGER', colour: null, sortOrder: 0 }],
      entries: [
        {
          id: 'e1', staffId: 'st2', date: monday, type: 'AVAILABLE', isAllDay: true, startTime: null, endTime: null,
          windows: [], status: 'APPROVED', timeOff: false, notes: null, reason: null, reviewNote: null,
          seriesId: null, seriesEndDate: null, lockedAt: null, lockedById: null, lockedReason: null,
        },
      ],
      queue: { pending: [], requests: [] },
    }
    mockFetch(pinned)
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    let names = screen.getAllByText(/TAYLOR REED|ANN LEE/).map((el) => el.textContent ?? '')
    expect(names[names.length - 1]).toContain('ANN LEE')

    // Clicking the day header pins it (ANN is green for Monday).
    fireEvent.click(screen.getByText(/^MON \d+/))

    await waitFor(() => {
      names = screen.getAllByText(/TAYLOR REED|ANN LEE/).map((el) => el.textContent ?? '')
      expect(names[0]).toContain('ANN LEE')
      expect(names[names.length - 1]).toContain('TAYLOR REED')
    })
    expect(screen.getByText(/SHOWING STAFF AVAILABLE ON/)).toBeDefined()
    // The position grouping survives the pin.
    expect(screen.getByText('MANAGER')).toBeDefined()
  })

  it('drag-fills a day across the row from the corner handle', async () => {
    const withEntry = {
      ...data,
      entries: [
        {
          id: 'e1', staffId: 'st1', date: monday, type: 'AVAILABLE', isAllDay: true, startTime: null, endTime: null,
          windows: [], status: 'APPROVED', timeOff: false, notes: null, reason: null, reviewNote: null,
          seriesId: null, seriesEndDate: null, lockedAt: null, lockedById: null, lockedReason: null,
        },
      ],
      queue: { pending: [], requests: [] },
    }
    const spy = mockFetch(withEntry)
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    const handle = await screen.findByTitle('DRAG TO COPY THIS DAY')
    const target = document.querySelector('[data-fill-col="1"]') as HTMLElement
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target })

    fireEvent(handle, new MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }))
    fireEvent(handle, new MouseEvent('pointermove', { bubbles: true, clientX: 60, clientY: 60 }))
    fireEvent(handle, new MouseEvent('pointerup', { bubbles: true, clientX: 60, clientY: 60 }))

    expect(await screen.findByText('COPY AVAILABILITY')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'CONFIRM' }))

    await waitFor(() => {
      const post = spy.mock.calls.find((c) =>
        String(c[0]).endsWith('/api/admin/availability') && (c[1] as RequestInit | undefined)?.method === 'POST')
      expect(post).toBeDefined()
      const body = JSON.parse((post![1] as RequestInit).body as string)
      expect(body.staffId).toBe('st1')
      expect(body.date).toBe(shiftDay(monday, 1))
      expect(body.availability.type).toBe('AVAILABLE')
    })
  })

  it('does not copy anything when the drag confirmation is cancelled', async () => {
    const withEntry = {
      ...data,
      entries: [
        {
          id: 'e1', staffId: 'st1', date: monday, type: 'AVAILABLE', isAllDay: true, startTime: null, endTime: null,
          windows: [], status: 'APPROVED', timeOff: false, notes: null, reason: null, reviewNote: null,
          seriesId: null, seriesEndDate: null, lockedAt: null, lockedById: null, lockedReason: null,
        },
      ],
      queue: { pending: [], requests: [] },
    }
    const spy = mockFetch(withEntry)
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    const handle = await screen.findByTitle('DRAG TO COPY THIS DAY')
    const target = document.querySelector('[data-fill-col="1"]') as HTMLElement
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target })

    fireEvent(handle, new MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }))
    fireEvent(handle, new MouseEvent('pointermove', { bubbles: true, clientX: 60, clientY: 60 }))
    fireEvent(handle, new MouseEvent('pointerup', { bubbles: true, clientX: 60, clientY: 60 }))

    fireEvent.click(await screen.findByRole('button', { name: 'CANCEL' }))
    await waitFor(() => expect(screen.queryByText('COPY AVAILABILITY')).toBeNull())
    const post = spy.mock.calls.find((c) =>
      String(c[0]).endsWith('/api/admin/availability') && (c[1] as RequestInit | undefined)?.method === 'POST')
    expect(post).toBeUndefined()
  })

  it('shows a lock badge and unlocks through the day PATCH', async () => {
    const locked = {
      ...data,
      entries: [{
        id: 'e1', staffId: 'st1', date: monday, type: 'AVAILABLE', isAllDay: true, startTime: null, endTime: null,
        windows: [], status: 'APPROVED', timeOff: false, notes: null, reason: null, reviewNote: null,
        seriesId: null, seriesEndDate: null, lockedAt: '2026-10-20T01:00:00.000Z', lockedById: 'admin1', lockedReason: 'CONFIRMED',
      }],
      queue: { pending: [], requests: [] },
    }
    const spy = mockFetch(locked)
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    expect(screen.getByText('🔒 LOCKED')).toBeDefined()
    fireEvent.click(screen.getByText('00:00–24:00'))

    expect(await screen.findByText(/LOCKED — UNLOCK TO EDIT/)).toBeDefined()
    fireEvent.click(screen.getByText('UNLOCK'))

    await waitFor(() => {
      const patch = spy.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'PATCH')
      expect(patch).toBeDefined()
      expect(String(patch![0])).toBe('/api/admin/availability/e1')
      expect(JSON.parse((patch![1] as RequestInit).body as string)).toMatchObject({ locked: false })
    })
  })

  it('adds a comment on a locked day through the comment thread', async () => {
    const locked = {
      ...data,
      entries: [{
        id: 'e1', staffId: 'st1', date: monday, type: 'AVAILABLE', isAllDay: true, startTime: null, endTime: null,
        windows: [], status: 'APPROVED', timeOff: false, notes: null, reason: null, reviewNote: null,
        seriesId: null, seriesEndDate: null, lockedAt: '2026-10-20T01:00:00.000Z', lockedById: 'admin1', lockedReason: null,
      }],
      queue: { pending: [], requests: [] },
    }
    const spy = vi.spyOn(global, 'fetch').mockImplementation(async (url: unknown, init?: RequestInit) => {
      if (String(url).includes('/api/admin/availability/comments')) {
        if (init?.method === 'POST') {
          return { ok: true, status: 200, json: async () => ({ comment: { id: 'c1', body: 'AGREED ON THE PHONE', canDelete: true } }) } as Response
        }
        return { ok: true, status: 200, json: async () => ({ comments: [], canDelete: true }) } as Response
      }
      if (init?.method === 'POST') return { ok: true, status: 200, json: async () => ({ success: true }) } as Response
      return { ok: true, status: 200, json: async () => locked } as Response
    })
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    fireEvent.click(screen.getByText('00:00–24:00'))
    const input = await screen.findByPlaceholderText('ADD A COMMENT')
    fireEvent.change(input, { target: { value: '  AGREED ON THE PHONE  ' } })
    fireEvent.click(screen.getByText('ADD'))

    await waitFor(() => {
      const post = spy.mock.calls.find((c) =>
        String(c[0]).includes('/api/admin/availability/comments') &&
        (c[1] as RequestInit | undefined)?.method === 'POST')
      expect(post).toBeDefined()
      expect(JSON.parse((post![1] as RequestInit).body as string)).toEqual({
        date: monday,
        body: 'AGREED ON THE PHONE',
        seriesId: null,
        staffId: 'st1',
        venueId: 'v1',
      })
    })
  })

  it('refreshes a queue-opened editor after locking without reopening', async () => {
    const spy = mockFetch()
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    fireEvent.click(screen.getByText('OPEN →'))
    fireEvent.click(await screen.findByText('OPEN / EDIT'))

    fireEvent.change(screen.getByLabelText('Lock reason'), { target: { value: 'AGREED ON THE PHONE' } })
    fireEvent.click(screen.getByText('LOCK'))

    await waitFor(() => {
      const patch = spy.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'PATCH')
      expect(patch).toBeDefined()
      expect(JSON.parse((patch![1] as RequestInit).body as string)).toEqual({
        locked: true,
        lockedReason: 'AGREED ON THE PHONE',
      })
    })
    expect(await screen.findByText(/LOCKED — UNLOCK TO EDIT/)).toBeDefined()
    expect(screen.getByText('UNLOCK')).toBeDefined()
  })

  it('re-locks the day when a request proposal is saved as an override', async () => {
    const requestOnly = {
      ...data,
      queue: {
        pending: [],
        requests: [{
          ...data.queue.requests[0],
          payload: { availability: { isAllDay: true, type: 'AVAILABLE', windows: [], timeOff: false, notes: 'NEW NOTE' } },
        }],
      },
    }
    const spy = mockFetch(requestOnly)
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    fireEvent.click(screen.getByText('OPEN →'))
    fireEvent.click(screen.getByText('OPEN / EDIT PROPOSED'))
    fireEvent.click(await screen.findByText('SAVE'))

    await waitFor(() => {
      const save = spy.mock.calls.find((c) =>
        String(c[0]).endsWith('/api/admin/availability') && (c[1] as RequestInit | undefined)?.method === 'POST')
      expect(save).toBeDefined()
      expect(JSON.parse((save![1] as RequestInit).body as string).lock).toBe(true)
    })
  })

  it('shift-click selects a day without opening the editor', async () => {
    const withEntry = {
      ...data,
      entries: [{
        id: 'e1', staffId: 'st1', date: monday, type: 'AVAILABLE', isAllDay: true, startTime: null, endTime: null,
        windows: [], status: 'APPROVED', timeOff: false, notes: null, reason: null, reviewNote: null,
        seriesId: null, seriesEndDate: null, lockedAt: null, lockedById: null, lockedReason: null,
      }],
      queue: { pending: [], requests: [] },
    }
    mockFetch(withEntry)
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    fireEvent.click(screen.getByText('00:00–24:00'), { shiftKey: true })

    expect(screen.getByText('CLEAR SELECTED (1)')).toBeDefined()
    expect(screen.queryByText('AVAILABILITY — TAYLOR REED')).toBeNull()
  })

  it('bulk clears selected populated days and keeps the grid mounted', async () => {
    const withEntry = {
      ...data,
      entries: [{
        id: 'e1', staffId: 'st1', date: monday, type: 'AVAILABLE', isAllDay: true, startTime: null, endTime: null,
        windows: [], status: 'APPROVED', timeOff: false, notes: null, reason: null, reviewNote: null,
        seriesId: null, seriesEndDate: null, lockedAt: null, lockedById: null, lockedReason: null,
      }],
      queue: { pending: [], requests: [] },
    }
    const spy = mockFetch(withEntry)
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    fireEvent.click(screen.getByText('SELECT DAYS'))
    fireEvent.click(screen.getByText('00:00–24:00'))
    fireEvent.click(screen.getByText('CLEAR SELECTED (1)'))

    await screen.findByText('CLEAR SELECTED DAYS')
    const clears = screen.getAllByRole('button', { name: 'CLEAR' })
    fireEvent.click(clears[clears.length - 1])

    await waitFor(() => {
      const post = spy.mock.calls.find((c) => String(c[0]).endsWith('/api/admin/availability/clear'))
      expect(post).toBeDefined()
      expect(JSON.parse((post![1] as RequestInit).body as string)).toMatchObject({
        staffId: 'st1', date: monday, scope: 'THIS',
      })
    })
    expect(screen.getByText('TAYLOR REED')).toBeDefined()
    expect(screen.queryByText('LOADING')).toBeNull()
  })

  it('skips locked days when drag-filling', async () => {
    const withEntry = {
      ...data,
      entries: [
        {
          id: 'e1', staffId: 'st1', date: monday, type: 'AVAILABLE', isAllDay: true, startTime: null, endTime: null,
          windows: [], status: 'APPROVED', timeOff: false, notes: null, reason: null, reviewNote: null,
          seriesId: null, seriesEndDate: null, lockedAt: null, lockedById: null, lockedReason: null,
        },
        {
          id: 'e2', staffId: 'st1', date: shiftDay(monday, 1), type: 'AVAILABLE', isAllDay: true, startTime: null, endTime: null,
          windows: [], status: 'APPROVED', timeOff: false, notes: null, reason: null, reviewNote: null,
          seriesId: null, seriesEndDate: null, lockedAt: '2026-10-20T01:00:00.000Z', lockedById: 'admin1', lockedReason: null,
        },
      ],
      queue: { pending: [], requests: [] },
    }
    const spy = mockFetch(withEntry)
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    const handle = (await screen.findAllByTitle('DRAG TO COPY THIS DAY'))[0]
    const target = document.querySelector('[data-fill-col="1"]') as HTMLElement
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target })

    fireEvent(handle, new MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }))
    fireEvent(handle, new MouseEvent('pointermove', { bubbles: true, clientX: 60, clientY: 60 }))
    fireEvent(handle, new MouseEvent('pointerup', { bubbles: true, clientX: 60, clientY: 60 }))

    expect(await screen.findByText(/LOCKED DAY SKIPPED/)).toBeDefined()
    expect(screen.queryByText('COPY AVAILABILITY')).toBeNull()
    const post = spy.mock.calls.find((c) =>
      String(c[0]).endsWith('/api/admin/availability') && (c[1] as RequestInit | undefined)?.method === 'POST')
    expect(post).toBeUndefined()
  })
  it('offers a weekly series when copying a series day', async () => {
    const withSeries = {
      ...data,
      entries: [
        {
          id: 'e1', staffId: 'st1', date: monday, type: 'AVAILABLE', isAllDay: true, startTime: null, endTime: null,
          windows: [], status: 'APPROVED', timeOff: false, notes: null, reason: null, reviewNote: null,
          seriesId: 's1', seriesEndDate: shiftDay(monday, 21),
        },
      ],
      series: [{ id: 's1', startDate: monday, endDate: shiftDay(monday, 21), dates: [monday] }],
      queue: { pending: [], requests: [] },
    }
    const spy = mockFetch(withSeries)
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    const handle = await screen.findByTitle('DRAG TO COPY THIS DAY')
    const target = document.querySelector('[data-fill-col="1"]') as HTMLElement
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target })

    fireEvent(handle, new MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }))
    fireEvent(handle, new MouseEvent('pointermove', { bubbles: true, clientX: 60, clientY: 60 }))
    fireEvent(handle, new MouseEvent('pointerup', { bubbles: true, clientX: 60, clientY: 60 }))

    expect(await screen.findByText('COPY AVAILABILITY')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'WEEKLY SERIES' }))
    fireEvent.click(screen.getByRole('button', { name: 'CONFIRM' }))

    await waitFor(() => {
      const post = spy.mock.calls.find((c) =>
        String(c[0]).endsWith('/api/admin/availability') && (c[1] as RequestInit | undefined)?.method === 'POST')
      expect(post).toBeDefined()
      const body = JSON.parse((post![1] as RequestInit).body as string)
      expect(body.date).toBe(shiftDay(monday, 1))
      expect(body.repeat).toEqual({ weeks: 4 })
      expect(body.seriesId).toBeNull()
    })
  })

  const avEntry = (id: string, date: string, lockedAt: string | null = null) => ({
    id, staffId: 'st1', date, type: 'AVAILABLE', isAllDay: true, startTime: null, endTime: null,
    windows: [], status: 'APPROVED', timeOff: false, notes: null, reason: null, reviewNote: null,
    seriesId: null, seriesEndDate: null, lockedAt, lockedById: lockedAt ? 'admin1' : null, lockedReason: null,
  })

  async function selectRangeTo(dayIndices: number[]) {
    fireEvent.click(screen.getByText('SELECT DAYS'))
    const cells = document.querySelectorAll('[data-fill-col]')
    fireEvent.click(cells[dayIndices[0]])
    fireEvent.click(cells[dayIndices[dayIndices.length - 1]], { shiftKey: true })
  }

  it('shift-click selects a contiguous range of days on one row', async () => {
    mockFetch({
      ...data,
      entries: [avEntry('e1', monday), avEntry('e3', shiftDay(monday, 2))],
      queue: { pending: [], requests: [] },
    })
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    await selectRangeTo([0, 2])

    expect(screen.getByText('CLEAR SELECTED (3)')).toBeDefined()
    expect(screen.getByText('LOCK SELECTED (2)')).toBeDefined()
  })

  it('bulk locks every populated selected day with the reason', async () => {
    const spy = mockFetch({
      ...data,
      entries: [avEntry('e1', monday), avEntry('e3', shiftDay(monday, 2))],
      queue: { pending: [], requests: [] },
    })
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    await selectRangeTo([0, 2])
    fireEvent.click(screen.getByText('LOCK SELECTED (2)'))

    expect(await screen.findByText('LOCK SELECTED DAYS')).toBeDefined()
    fireEvent.change(screen.getByLabelText('Bulk lock reason'), { target: { value: '  AGREED ON THE PHONE  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'LOCK' }))

    await waitFor(() => {
      const patches = spy.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'PATCH')
      expect(patches).toHaveLength(2)
      expect(patches.map((c) => String(c[0])).sort()).toEqual([
        '/api/admin/availability/e1',
        '/api/admin/availability/e3',
      ])
      for (const patch of patches) {
        expect(JSON.parse((patch[1] as RequestInit).body as string)).toEqual({
          locked: true,
          lockedReason: 'AGREED ON THE PHONE',
        })
      }
    })
    expect(await screen.findByText('2 DAYS LOCKED · 1 SKIPPED')).toBeDefined()
  })

  it('skips blank and already-locked selected days and treats the reason as optional', async () => {
    const spy = mockFetch({
      ...data,
      entries: [
        avEntry('e1', monday),
        avEntry('e2', shiftDay(monday, 1), '2026-10-20T01:00:00.000Z'),
      ],
      queue: { pending: [], requests: [] },
    })
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    await selectRangeTo([0, 2])

    expect(screen.getByText('LOCK SELECTED (1)')).toBeDefined()
    fireEvent.click(screen.getByText('LOCK SELECTED (1)'))
    fireEvent.click(await screen.findByRole('button', { name: 'LOCK' }))

    await waitFor(() => {
      const patches = spy.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'PATCH')
      expect(patches).toHaveLength(1)
      expect(String(patches[0][0])).toBe('/api/admin/availability/e1')
      expect(JSON.parse((patches[0][1] as RequestInit).body as string)).toEqual({
        locked: true,
        lockedReason: null,
      })
    })
    expect(await screen.findByText('1 DAY LOCKED · 2 SKIPPED')).toBeDefined()
  })

  it('bulk unlocks every locked selected day', async () => {
    const spy = mockFetch({
      ...data,
      entries: [
        avEntry('e1', monday, '2026-10-20T01:00:00.000Z'),
        avEntry('e3', shiftDay(monday, 2), '2026-10-20T01:00:00.000Z'),
      ],
      queue: { pending: [], requests: [] },
    })
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    await selectRangeTo([0, 2])

    expect(screen.queryByText('LOCK SELECTED (2)')).toBeNull()
    fireEvent.click(screen.getByText('UNLOCK SELECTED (2)'))
    expect(await screen.findByText('UNLOCK SELECTED DAYS')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'UNLOCK' }))

    await waitFor(() => {
      const patches = spy.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'PATCH')
      expect(patches).toHaveLength(2)
      expect(patches.map((c) => String(c[0])).sort()).toEqual([
        '/api/admin/availability/e1',
        '/api/admin/availability/e3',
      ])
      for (const patch of patches) {
        expect(JSON.parse((patch[1] as RequestInit).body as string)).toEqual({
          locked: false,
          lockedReason: null,
        })
      }
    })
    expect(await screen.findByText(/2 DAYS UNLOCKED/)).toBeDefined()
  })

  it('shows both lock and unlock counts for a mixed selection', async () => {
    mockFetch({
      ...data,
      entries: [
        avEntry('e1', monday),
        avEntry('e2', shiftDay(monday, 1), '2026-10-20T01:00:00.000Z'),
      ],
      queue: { pending: [], requests: [] },
    })
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    await selectRangeTo([0, 1])

    expect(screen.getByText('LOCK SELECTED (1)')).toBeDefined()
    expect(screen.getByText('UNLOCK SELECTED (1)')).toBeDefined()
  })

  it('surfaces a failed bulk unlock inline', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (_url: unknown, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        return { ok: false, status: 409, json: async () => ({ error: 'UNLOCK REJECTED' }) } as Response
      }
      return {
        ok: true, status: 200,
        json: async () => ({
          ...data,
          entries: [avEntry('e1', monday, '2026-10-20T01:00:00.000Z')],
          queue: { pending: [], requests: [] },
        }),
      } as Response
    })
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    fireEvent.click(screen.getByText('SELECT DAYS'))
    fireEvent.click(document.querySelectorAll('[data-fill-col]')[0])
    fireEvent.click(screen.getByText('UNLOCK SELECTED (1)'))
    fireEvent.click(await screen.findByRole('button', { name: 'UNLOCK' }))

    expect(await screen.findByText(/FAILED TO UNLOCK — UNLOCK REJECTED/)).toBeDefined()
  })

  it('surfaces a failed bulk lock inline', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (_url: unknown, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        return { ok: false, status: 409, json: async () => ({ error: 'LOCK REJECTED' }) } as Response
      }
      return { ok: true, status: 200, json: async () => ({ ...data, entries: [avEntry('e1', monday)], queue: { pending: [], requests: [] } }) } as Response
    })
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    fireEvent.click(screen.getByText('SELECT DAYS'))
    fireEvent.click(document.querySelectorAll('[data-fill-col]')[0])
    fireEvent.click(screen.getByText('LOCK SELECTED (1)'))
    fireEvent.click(await screen.findByRole('button', { name: 'LOCK' }))

    expect(await screen.findByText(/FAILED TO LOCK — LOCK REJECTED/)).toBeDefined()
  })

  it('hides the bulk-unlock action without the edit grant', async () => {
    mockFetch({
      ...data,
      entries: [avEntry('e1', monday, '2026-10-20T01:00:00.000Z')],
      queue: { pending: [], requests: [] },
    })
    render(<AvailabilityAdminClient role="MANAGER" sessionVenueId="v1" defaultVenueId="v1" canEdit={false} />)

    await screen.findAllByText('TAYLOR REED')
    fireEvent.click(screen.getByText('SELECT DAYS'))
    fireEvent.click(document.querySelectorAll('[data-fill-col]')[0])

    expect(screen.getByText('CLEAR SELECTED (1)')).toBeDefined()
    expect(screen.queryByText(/UNLOCK SELECTED/)).toBeNull()
  })

  it('hides the bulk-lock action without the edit grant', async () => {
    mockFetch({
      ...data,
      entries: [avEntry('e1', monday)],
      queue: { pending: [], requests: [] },
    })
    render(<AvailabilityAdminClient role="MANAGER" sessionVenueId="v1" defaultVenueId="v1" canEdit={false} />)

    await screen.findAllByText('TAYLOR REED')
    fireEvent.click(screen.getByText('SELECT DAYS'))
    fireEvent.click(document.querySelectorAll('[data-fill-col]')[0])

    expect(screen.getByText('CLEAR SELECTED (1)')).toBeDefined()
    expect(screen.queryByText(/LOCK SELECTED/)).toBeNull()
  })

  it('no longer renders the legacy review-note grid marker', async () => {
    mockFetch({
      ...data,
      entries: [{ ...avEntry('e1', monday), reviewNote: 'CALLED BACK' }],
      queue: { pending: [], requests: [] },
    })
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    expect(screen.queryByLabelText('Review note: CALLED BACK')).toBeNull()
  })

  it('shows the comment thread on a declaration and adds a comment', async () => {
    const spy = vi.spyOn(global, 'fetch').mockImplementation(async (url: unknown, init?: RequestInit) => {
      if (String(url).includes('/api/admin/availability/comments')) {
        if (init?.method === 'POST') {
          return {
            ok: true,
            status: 200,
            json: async () => ({ comment: { id: 'c1', body: 'CALLED BACK', source: 'MANAGER', canDelete: true } }),
          } as Response
        }
        return { ok: true, status: 200, json: async () => ({ comments: [], canDelete: true }) } as Response
      }
      if (init?.method === 'POST') return { ok: true, status: 200, json: async () => ({ success: true }) } as Response
      return { ok: true, status: 200, json: async () => ({ ...data, queue: { ...data.queue, requests: [] } }) } as Response
    })
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    fireEvent.click(screen.getByText('OPEN →'))

    expect(screen.queryByLabelText('Review note for declaration')).toBeNull()
    expect(screen.queryByLabelText('Worker note for declaration')).toBeNull()

    const input = await screen.findByPlaceholderText('ADD A COMMENT')
    fireEvent.change(input, { target: { value: '  CALLED BACK  ' } })
    fireEvent.click(screen.getByText('ADD'))

    await waitFor(() => {
      const post = spy.mock.calls.find((c) =>
        String(c[0]).includes('/api/admin/availability/comments') &&
        (c[1] as RequestInit | undefined)?.method === 'POST')
      expect(post).toBeDefined()
      const body = JSON.parse((post![1] as RequestInit).body as string)
      expect(body).toEqual({ date: monday, body: 'CALLED BACK', seriesId: null, staffId: 'st1', venueId: 'v1' })
    })
  })

  it('posts a declaration comment to every day in the series', async () => {
    const p1 = { ...data.queue.pending[0], id: 'p1', date: monday, seriesId: 's1', seriesEndDate: null }
    const p2 = { ...data.queue.pending[0], id: 'p2', date: shiftDay(monday, 7), seriesId: 's1', seriesEndDate: null }
    const spy = vi.spyOn(global, 'fetch').mockImplementation(async (url: unknown, init?: RequestInit) => {
      if (String(url).includes('/api/admin/availability/comments')) {
        if (init?.method === 'POST') {
          return { ok: true, status: 200, json: async () => ({ comment: { id: 'c1', body: 'CALLED BACK', canDelete: true } }) } as Response
        }
        return { ok: true, status: 200, json: async () => ({ comments: [], canDelete: true, canAdd: true }) } as Response
      }
      if (init?.method === 'POST') return { ok: true, status: 200, json: async () => ({ success: true }) } as Response
      return { ok: true, status: 200, json: async () => ({ ...data, queue: { pending: [p1, p2], requests: [] } }) } as Response
    })
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    fireEvent.click(screen.getByText('OPEN →'))

    const input = await screen.findByPlaceholderText('ADD A COMMENT')
    expect(screen.getByText(/ADD APPLIES THE COMMENT TO EVERY DAY/)).toBeDefined()
    fireEvent.change(input, { target: { value: 'CALLED BACK' } })
    fireEvent.click(screen.getByText('ADD'))

    await waitFor(() => {
      const posts = spy.mock.calls.filter((c) =>
        String(c[0]).includes('/api/admin/availability/comments') &&
        (c[1] as RequestInit | undefined)?.method === 'POST')
      expect(posts).toHaveLength(2)
      const dates = posts.map((p) => JSON.parse((p[1] as RequestInit).body as string).date).sort()
      expect(dates).toEqual([monday, shiftDay(monday, 7)].sort())
    })
  })

  it('deletes a comment from the declaration thread when the server allows it', async () => {
    const spy = vi.spyOn(global, 'fetch').mockImplementation(async (url: unknown, init?: RequestInit) => {
      if (String(url).includes('/api/admin/availability/comments')) {
        if (init?.method === 'DELETE') return { ok: true, status: 200, json: async () => ({ success: true }) } as Response
        return {
          ok: true,
          status: 200,
          json: async () => ({
            comments: [{
              id: 'c1', body: 'OLD NOTE', source: 'WORKER_APP', authorId: 'st1',
              authorName: 'TAYLOR REED', createdAt: '2026-11-12T01:00:00.000Z', canDelete: true,
            }],
            canDelete: true,
          }),
        } as Response
      }
      if (init?.method === 'POST') return { ok: true, status: 200, json: async () => ({ success: true }) } as Response
      return { ok: true, status: 200, json: async () => ({ ...data, queue: { ...data.queue, requests: [] } }) } as Response
    })
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    fireEvent.click(screen.getByText('OPEN →'))

    fireEvent.click(await screen.findByLabelText('Delete comment c1'))

    await waitFor(() => {
      const del = spy.mock.calls.find((c) =>
        String(c[0]).includes('/api/admin/availability/comments') &&
        (c[1] as RequestInit | undefined)?.method === 'DELETE')
      expect(del).toBeDefined()
      expect(JSON.parse((del![1] as RequestInit).body as string)).toEqual({ id: 'c1', venueId: 'v1' })
    })
  })

  const seriesWithLocks = () => {
    const week2 = shiftDay(monday, 7)
    const week3 = shiftDay(monday, 14)
    return {
      week2,
      week3,
      data: {
        ...data,
        entries: [{
          id: 'e1', staffId: 'st1', date: monday, type: 'AVAILABLE', isAllDay: true, startTime: null, endTime: null,
          windows: [], status: 'APPROVED', timeOff: false, notes: null, reason: null, reviewNote: null,
          seriesId: 's1', seriesEndDate: shiftDay(monday, 21), lockedAt: null, lockedById: null, lockedReason: null,
        }],
        series: [{ id: 's1', staffId: 'st1', startDate: monday, endDate: shiftDay(monday, 21), dates: [monday] }],
        queue: { pending: [], requests: [] },
      },
      seriesDates: [
        { date: monday, locked: true, lockedAt: '2026-10-20T01:00:00.000Z', lockedReason: null },
        { date: week2, locked: true, lockedAt: '2026-10-20T01:00:00.000Z', lockedReason: null },
        { date: week3, locked: false, lockedAt: null, lockedReason: null },
      ],
    }
  }

  it('loads the series dates and unlocks the selected locked days', async () => {
    const { week2, data: withSeries, seriesDates } = seriesWithLocks()
    const spy = vi.spyOn(global, 'fetch').mockImplementation(async (url: unknown, init?: RequestInit) => {
      const u = String(url)
      if (u.includes('/unlock-series') && init?.method === 'POST') {
        return { ok: true, status: 200, json: async () => ({ success: true, unlocked: [monday, week2], count: 2 }) } as Response
      }
      if (u.includes('/unlock-series')) {
        return { ok: true, status: 200, json: async () => ({ staffId: 'st1', seriesId: 's1', total: 3, lockedCount: 2, dates: seriesDates }) } as Response
      }
      if (init?.method === 'POST') return { ok: true, status: 200, json: async () => ({ success: true }) } as Response
      return { ok: true, status: 200, json: async () => withSeries } as Response
    })
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    fireEvent.click(screen.getByText('00:00–24:00'))
    fireEvent.click(await screen.findByText('UNLOCK SERIES'))

    expect(await screen.findByText('2 OF 3 DAYS LOCKED')).toBeDefined()
    expect(screen.getByText(formatDateDayDMY(week2))).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'UNLOCK SELECTED (2)' }))

    await waitFor(() => {
      const post = spy.mock.calls.find((c) =>
        String(c[0]).includes('/unlock-series') && (c[1] as RequestInit | undefined)?.method === 'POST')
      expect(post).toBeDefined()
      const body = JSON.parse((post![1] as RequestInit).body as string)
      expect(body).toMatchObject({ staffId: 'st1', seriesId: 's1' })
      expect([...body.dates].sort()).toEqual([monday, week2].sort())
    })
  })

  it('passes the selected locked days as unlockDates when deleting a series', async () => {
    const { week2, data: withSeries, seriesDates } = seriesWithLocks()
    const spy = vi.spyOn(global, 'fetch').mockImplementation(async (url: unknown, init?: RequestInit) => {
      const u = String(url)
      if (u.includes('/delete-series') && init?.method === 'POST') {
        return { ok: true, status: 200, json: async () => ({ mode: 'SAVED', skipped: [], unlocked: [monday, week2], unlockedCount: 2 }) } as Response
      }
      if (u.includes('/unlock-series')) {
        return { ok: true, status: 200, json: async () => ({ staffId: 'st1', seriesId: 's1', total: 3, lockedCount: 2, dates: seriesDates }) } as Response
      }
      return { ok: true, status: 200, json: async () => withSeries } as Response
    })
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    fireEvent.click(screen.getByText('00:00–24:00'))
    fireEvent.click(await screen.findByText('DELETE SERIES'))
    expect(await screen.findByText('2 OF 3 DAYS LOCKED')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'WHOLE SERIES' }))

    await waitFor(() => {
      const post = spy.mock.calls.find((c) =>
        String(c[0]).endsWith('/api/admin/availability/delete-series') && (c[1] as RequestInit | undefined)?.method === 'POST')
      expect(post).toBeDefined()
      const body = JSON.parse((post![1] as RequestInit).body as string)
      expect(body.scope).toBe('ALL')
      expect([...body.unlockDates].sort()).toEqual([monday, week2].sort())
    })
  })

  it('unlocks a locked series request and then applies it', async () => {
    const otherDay = shiftDay(monday, 7)
    const requestOnly = {
      ...data,
      entries: [{
        id: 'e1', staffId: 'st1', date: monday, type: 'UNAVAILABLE', isAllDay: true, startTime: null, endTime: null,
        windows: [], status: 'APPROVED', timeOff: false, notes: null, reason: null, reviewNote: null,
        seriesId: 's1', seriesEndDate: null, lockedAt: '2026-10-20T01:00:00.000Z', lockedById: 'm1', lockedReason: null,
      }],
      queue: {
        pending: [],
        requests: [{
          ...data.queue.requests[0],
          scope: 'FROM',
          seriesId: 's1',
          payload: {
            availability: { isAllDay: true, type: 'AVAILABLE', windows: [], timeOff: false, notes: null },
            writeDates: [monday, otherDay],
            removeDates: [],
          },
        }],
      },
    }
    const spy = vi.spyOn(global, 'fetch').mockImplementation(async (url: unknown, init?: RequestInit) => {
      if (String(url).includes('/unlock-series') && init?.method === 'POST') {
        return { ok: true, status: 200, json: async () => ({ success: true, unlocked: [monday], count: 1 }) } as Response
      }
      if (String(url).includes('/requests/req1') && init?.method === 'POST') {
        return { ok: true, status: 200, json: async () => ({ success: true, skipped: [], wrote: 2 }) } as Response
      }
      return { ok: true, status: 200, json: async () => requestOnly } as Response
    })
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    fireEvent.click(screen.getByText('OPEN →'))
    fireEvent.click(await screen.findByText('UNLOCK & APPLY'))

    expect(await screen.findByText('UNLOCK & APPLY REQUEST')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'UNLOCK & CONTINUE' }))

    await waitFor(() => {
      const unlock = spy.mock.calls.find((c) =>
        String(c[0]).includes('/unlock-series') && (c[1] as RequestInit | undefined)?.method === 'POST')
      expect(unlock).toBeDefined()
      expect(JSON.parse((unlock![1] as RequestInit).body as string)).toMatchObject({
        staffId: 'st1', seriesId: 's1', dates: [monday],
      })
      const apply = spy.mock.calls.find((c) => String(c[0]).includes('/requests/req1'))
      expect(apply).toBeDefined()
      expect(JSON.parse((apply![1] as RequestInit).body as string).action).toBe('APPLY')
    })
  })

  it('flags current-week / past-cut-off requests as a warning without blocking APPLY', async () => {
    const withCutoff = {
      ...data,
      today: monday,
      cutoff: { day: 4, time: '17:00' },
      nowMinutes: 10 * 60,
    }
    const spy = mockFetch(withCutoff)
    render(<AvailabilityAdminClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findAllByText('TAYLOR REED')
    expect(screen.getByText(/PAST CUT-OFF \/ CURRENT WEEK REQUESTS/)).toBeDefined()

    fireEvent.click(screen.getByText('OPEN →'))
    expect((await screen.findAllByText('PAST CUT-OFF')).length).toBeGreaterThan(0)
    fireEvent.click(await screen.findByText('APPLY'))

    await waitFor(() => {
      const post = spy.mock.calls.find((c) => String(c[0]).includes('/requests/req1'))
      expect(post).toBeDefined()
      expect(JSON.parse((post![1] as RequestInit).body as string).action).toBe('APPLY')
    })
  })
})
