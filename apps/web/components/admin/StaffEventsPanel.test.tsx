import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { StaffEventsPanel } from './StaffEventsPanel'

const event = {
  id: 'e1',
  title: 'TEAM BRIEFING',
  description: null,
  location: 'FUNCTION ROOM',
  startsAt: '2026-11-12T18:00:00.000Z',
  endsAt: '2026-11-12T20:00:00.000Z',
  allDay: false,
  attendanceRequired: true,
  allowMaybe: true,
  requireDeclineReason: false,
  responseDeadline: null,
  notes: null,
  status: 'PUBLISHED',
  reminderSentAt: null,
  venueId: 'v1',
  venueName: 'THE VENUE',
  audiences: [],
  attendance: { pending: 1, accepted: 1, declined: 1, maybe: 0, total: 3, responded: 2 },
}

const detail = {
  ...event,
  organiserName: 'ADA MANAGER',
  invites: [
    { id: 'i1', staffId: 's1', staffName: 'JANE DOE', departmentName: 'KITCHEN', response: 'ACCEPTED', reason: null, respondedAt: '2026-11-01T00:00:00.000Z' },
    { id: 'i2', staffId: 's2', staffName: 'JOHN SMITH', departmentName: 'BAR', response: 'DECLINED', reason: 'SICK', respondedAt: '2026-11-02T00:00:00.000Z' },
    { id: 'i3', staffId: 's3', staffName: 'SAM LEE', departmentName: null, response: 'PENDING', reason: null, respondedAt: null },
  ],
}

function mockApi(calls: { url: string; method: string }[], fail: string[] = []) {
  vi.spyOn(global, 'fetch').mockImplementation(async (input: unknown, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, method: init?.method ?? 'GET' })
    let payload: unknown = []
    if (url.includes('/api/admin/staff-events/e1')) payload = detail
    else if (url.includes('/api/admin/staff-events')) payload = [event]
    else if (url.includes('/api/admin/import/staff-events')) payload = { events: [], departments: [], sections: [], positions: [] }
    const blocked = fail.includes(url)
    return { ok: !blocked, status: blocked ? 403 : 200, json: async () => payload } as Response
  })
}

describe('StaffEventsPanel', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('shows the event, attendance counts and reminder action', async () => {
    const calls: { url: string; method: string }[] = []
    mockApi(calls)
    render(<StaffEventsPanel role="ADMIN" sessionVenueId="v1" />)
    await screen.findByText('TEAM BRIEFING')
    expect(screen.getByText('PUBLISHED')).toBeInTheDocument()
    expect(screen.getByText('REQUIRED')).toBeInTheDocument()
    expect(screen.getByText('1 YES')).toBeInTheDocument()
    expect(screen.getByText('1 NO')).toBeInTheDocument()
    expect(screen.getByText('1 NO REPLY')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'REMIND NO-REPLIES' }))
    await waitFor(() => {
      expect(calls.some((c) => c.url === '/api/admin/staff-events/e1/remind' && c.method === 'POST')).toBe(true)
    })
  })

  it('opens the attendance list with names and decline reasons', async () => {
    mockApi([])
    render(<StaffEventsPanel role="ADMIN" sessionVenueId="v1" />)
    await screen.findByText('TEAM BRIEFING')
    fireEvent.click(screen.getByRole('button', { name: 'ATTENDANCE' }))
    await screen.findByText('JANE DOE')
    expect(screen.getByText('JOHN SMITH')).toBeInTheDocument()
    expect(screen.getByText('SAM LEE')).toBeInTheDocument()
    expect(screen.getByText('REASON: SICK')).toBeInTheDocument()
    expect(screen.getByText('NO REPLY')).toBeInTheDocument()
  })

  it('surfaces a visible warning when a picker is forbidden', async () => {
    mockApi([], ['/api/admin/staff'])
    render(<StaffEventsPanel role="ADMIN" sessionVenueId="v1" />)
    await screen.findByText('TEAM BRIEFING')
    expect(await screen.findByText(/SOME PICKERS COULD NOT LOAD \(STAFF\)/)).toBeInTheDocument()
  })
})
