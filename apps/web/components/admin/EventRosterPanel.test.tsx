import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

import { EventRosterPanel } from '@/components/admin/EventRosterPanel'

const WEEK_START = '2025-11-10'
const WEEK_DAYS = ['2025-11-10', '2025-11-11', '2025-11-12', '2025-11-13', '2025-11-14', '2025-11-15', '2025-11-16']

const baseEvent = {
  id: 'ev1',
  feedId: 'feed1',
  title: 'TOWN HALL',
  description: null,
  location: 'Te Kawau Room',
  startsAt: '2025-11-15T08:00:00.000Z',
  endsAt: '2025-11-15T17:00:00.000Z',
  allDay: false,
  floorPlanSlug: null,
  floorPlanName: null,
  staffing: [
    {
      id: 'line1',
      positionId: 'pos1',
      positionName: 'SUPERVISOR',
      positionColour: null,
      label: null,
      count: 2,
      startTime: '08:00',
      endTime: '17:00',
      breakMinutes: 0,
      note: null,
      sortOrder: 0,
    },
  ],
  openShifts: [] as unknown[],
}

const payload = {
  feeds: [{ id: 'feed1', name: 'TE KAWAU ROOM', colour: '#60A5FA', floorPlanSlug: null, floorPlanName: null, lastSyncedAt: null }],
  events: [baseEvent],
  queue: [] as unknown[],
  positions: [{ id: 'pos1', name: 'SUPERVISOR', colour: null }],
  lastSyncedAt: null,
}

function mockApi(overrides: { payload?: unknown; onStaffing?: (body: unknown) => void; onFind?: () => void; onReview?: (url: string, body: unknown) => void } = {}) {
  const spy = vi.spyOn(global, 'fetch')
  spy.mockImplementation(async (url: unknown, init?: RequestInit) => {
    const u = String(url)
    const body = init?.body ? JSON.parse(String(init.body)) : null
    if (u.includes('/staffing')) {
      overrides.onStaffing?.(body)
      return { ok: true, json: async () => ({ lines: [] }) } as Response
    }
    if (u.includes('/find-staff')) {
      overrides.onFind?.()
      return { ok: true, json: async () => ({ created: 2 }) } as Response
    }
    if (u.includes('/open-shift-claims/') || u.includes('/open-shifts/')) {
      overrides.onReview?.(u, body)
      return { ok: true, json: async () => ({ success: true }) } as Response
    }
    return { ok: true, json: async () => overrides.payload ?? payload } as Response
  })
  return spy
}

describe('EventRosterPanel', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('renders the room grid with the imported event', async () => {
    mockApi()
    render(<EventRosterPanel venueId="v1" weekStart={WEEK_START} weekDays={WEEK_DAYS} />)

    expect(await screen.findByText('TE KAWAU ROOM')).toBeDefined()
    expect(screen.getByText(/TOWN HALL/)).toBeDefined()
    expect(screen.getByText(/REQUIRES/)).toBeDefined()
  })

  it('shows the requirement lines and saves them for the event', async () => {
    const onStaffing = vi.fn()
    mockApi({ onStaffing })
    render(<EventRosterPanel venueId="v1" weekStart={WEEK_START} weekDays={WEEK_DAYS} />)

    fireEvent.click(await screen.findByText(/TOWN HALL/))
    expect(await screen.findByText('REQUIRED STAFF')).toBeDefined()
    // The saved line is loaded into the editor.
    expect(screen.getByDisplayValue('SUPERVISOR')).toBeDefined()

    fireEvent.click(screen.getByText('SAVE REQUIREMENTS'))
    await waitFor(() => expect(onStaffing).toHaveBeenCalled())
    const body = onStaffing.mock.calls[0][0] as { lines: { positionId: string; count: number }[] }
    expect(body.lines[0]).toMatchObject({ positionId: 'pos1', count: 2 })
  })

  it('confirms FIND STAFF and lists the shifts', async () => {
    const onFind = vi.fn()
    mockApi({ onFind })
    render(<EventRosterPanel venueId="v1" weekStart={WEEK_START} weekDays={WEEK_DAYS} />)

    fireEvent.click(await screen.findByText(/TOWN HALL/))
    fireEvent.click(await screen.findByText('FIND STAFF'))

    expect(await screen.findByText('LIST SHIFTS')).toBeDefined()
    expect(screen.getByText(/LIST 2 SHIFT/)).toBeDefined()
    fireEvent.click(screen.getByText('LIST SHIFTS'))
    await waitFor(() => expect(onFind).toHaveBeenCalled())
  })

  it('lists pending claims on the seat and reviews them from the claims queue', async () => {
    const onReview = vi.fn()
    const withClaims = {
      ...payload,
      events: [
        {
          ...baseEvent,
          openShifts: [
            {
              id: 'os1',
              staffingId: 'line1',
              positionId: 'pos1',
              positionName: 'SUPERVISOR',
              positionColour: null,
              label: null,
              date: '2025-11-15',
              startTime: '08:00',
              endTime: '17:00',
              breakMinutes: 0,
              note: null,
              status: 'OPEN',
              filledById: null,
              filledByName: null,
              filledShiftId: null,
              claims: [
                { id: 'claim1', staffId: 'st1', staffName: 'LIAM HEAVEN', status: 'PENDING', note: 'KEEN', createdAt: '2025-11-01T00:00:00.000Z' },
              ],
            },
          ],
        },
      ],
      queue: [
        {
          id: 'claim1',
          openShiftId: 'os1',
          staffId: 'st1',
          staffName: 'LIAM HEAVEN',
          note: 'KEEN',
          createdAt: '2025-11-01T00:00:00.000Z',
          date: '2025-11-15',
          startTime: '08:00',
          endTime: '17:00',
          positionName: 'SUPERVISOR',
          label: null,
          eventTitle: 'TOWN HALL',
          eventId: 'ev1',
        },
      ],
    }
    mockApi({ payload: withClaims, onReview })

    render(<EventRosterPanel venueId="v1" weekStart={WEEK_START} weekDays={WEEK_DAYS} />)

    // Fill badge counts the LISTED seats (one open seat of the required two).
    expect(await screen.findByText('0/1')).toBeDefined()
    expect(screen.getByText('CLAIMS (1)')).toBeDefined()

    fireEvent.click(screen.getByText('CLAIMS (1)'))
    const approveButtons = await screen.findAllByText('APPROVE')
    fireEvent.click(approveButtons[0])

    await waitFor(() => expect(onReview).toHaveBeenCalled())
    expect(onReview.mock.calls[0][0]).toContain('/api/admin/open-shift-claims/claim1')
    expect(onReview.mock.calls[0][1]).toMatchObject({ action: 'APPROVE' })
  })

  it('cancels a listed seat from the event modal', async () => {
    const onReview = vi.fn()
    const withSeat = {
      ...payload,
      events: [
        {
          ...baseEvent,
          openShifts: [
            {
              id: 'os1', staffingId: 'line1', positionId: 'pos1', positionName: 'SUPERVISOR', positionColour: null,
              label: null, date: '2025-11-15', startTime: '08:00', endTime: '17:00', breakMinutes: 0, note: null,
              status: 'OPEN', filledById: null, filledByName: null, filledShiftId: null, claims: [],
            },
          ],
        },
      ],
    }
    mockApi({ payload: withSeat, onReview })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<EventRosterPanel venueId="v1" weekStart={WEEK_START} weekDays={WEEK_DAYS} />)

    fireEvent.click(await screen.findByText(/TOWN HALL/))
    fireEvent.click(await screen.findByText('CANCEL'))

    await waitFor(() => expect(onReview).toHaveBeenCalled())
    expect(onReview.mock.calls[0][0]).toContain('/api/admin/open-shifts/os1')
  })
})
