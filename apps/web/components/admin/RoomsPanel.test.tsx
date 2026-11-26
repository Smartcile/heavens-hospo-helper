import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { RoomsPanel } from '@/components/admin/RoomsPanel'

function json(data: unknown): Response {
  return { ok: true, json: async () => data } as Response
}

const AREAS = [
  {
    id: 'a1',
    name: 'FUNCTION ROOM',
    colour: null,
    capacity: 22,
    floorPlanId: 'p1',
    notes: null,
    sortOrder: 0,
    isActive: true,
    feedCount: 1,
    eventCount: 2,
  },
  {
    id: 'a2',
    name: 'BAR',
    colour: null,
    capacity: null,
    floorPlanId: null,
    notes: null,
    sortOrder: 1,
    isActive: true,
    feedCount: 0,
    eventCount: 0,
  },
]

const FEEDS = [
  {
    id: 'f1',
    areaId: 'a1',
    name: 'ROOM CALENDAR',
    url: 'https://example.com/a.ics',
    source: 'ICAL',
    colour: null,
    floorPlanId: null,
    sortOrder: 0,
    isActive: true,
    lastSyncedAt: null,
    roomDismissed: false,
  },
  {
    id: 'f2',
    areaId: null,
    name: 'SIDE CALENDAR',
    url: 'https://example.com/b.ics',
    source: 'ICAL',
    colour: '#112233',
    floorPlanId: null,
    sortOrder: 1,
    isActive: true,
    lastSyncedAt: null,
    roomDismissed: true,
  },
]

const JUNK = [
  { id: 'j1', name: '3f9a2b7c8d1e4f5a6b7c8d9e0f1a2b3c', feedCount: 1, eventCount: 0 },
]

function installFetchMock() {
  const posts: { url: string; method: string; body: unknown }[] = []
  const mock = vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (url.startsWith('/api/admin/calendar-feeds') && method === 'GET') {
      return json({ areas: AREAS, feeds: FEEDS, floorPlans: [{ id: 'p1', name: 'MAIN PLAN' }] })
    }
    if (url.startsWith('/api/admin/areas/cleanup') && method === 'GET') {
      return json({ rooms: JUNK })
    }
    if (method !== 'GET') {
      posts.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null })
      return json({ ok: true })
    }
    return json({})
  })
  return { mock, posts }
}

function roomsTable() {
  return within(screen.getByRole('table'))
}

describe('RoomsPanel (Settings rooms)', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('renders rooms as a compact table instead of expanded inline editors', async () => {
    installFetchMock()
    render(<RoomsPanel venueId="v1" />)

    expect(await screen.findByText('ROOMS (2)')).toBeTruthy()
    expect(roomsTable().getByText('FUNCTION ROOM')).toBeTruthy()
    expect(roomsTable().getByText('MAIN PLAN')).toBeTruthy()
    expect(roomsTable().getByText('1')).toBeTruthy()
    // No always-expanded form: the room name is not an editable input.
    expect(screen.queryByPlaceholderText('FUNCTION ROOM')).toBeNull()
  })

  it('edits a room in a modal and saves it', async () => {
    const { posts } = installFetchMock()
    render(<RoomsPanel venueId="v1" />)

    await screen.findByText('ROOMS (2)')
    const row = roomsTable().getByText('FUNCTION ROOM').closest('tr') as HTMLElement
    fireEvent.click(within(row).getByText('EDIT'))

    fireEvent.change(screen.getByPlaceholderText('FUNCTION ROOM'), { target: { value: 'ballroom' } })
    fireEvent.click(screen.getByText('SAVE ROOM'))

    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toMatchObject({
      url: '/api/admin/areas/a1',
      method: 'PUT',
      body: expect.objectContaining({ name: 'BALLROOM', capacity: 22, floorPlanId: 'p1' }),
    })
  })

  it('creates a room from the modal', async () => {
    const { posts } = installFetchMock()
    render(<RoomsPanel venueId="v1" />)

    await screen.findByText('ROOMS (2)')
    fireEvent.click(screen.getByTestId('add-room'))
    fireEvent.change(screen.getByPlaceholderText('FUNCTION ROOM'), { target: { value: 'the hall' } })
    fireEvent.click(screen.getByText('SAVE ROOM'))

    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toMatchObject({
      url: '/api/admin/areas',
      method: 'POST',
      body: expect.objectContaining({ venueId: 'v1', name: 'THE HALL' }),
    })
  })

  it('reorders rooms through the existing areas reorder route', async () => {
    const { posts } = installFetchMock()
    render(<RoomsPanel venueId="v1" />)

    await screen.findByText('ROOMS (2)')
    fireEvent.click(screen.getByLabelText('Move FUNCTION ROOM down'))

    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toMatchObject({
      url: '/api/admin/areas/reorder',
      method: 'POST',
      body: { venueId: 'v1', order: ['a2', 'a1'] },
    })
  })

  it('requires an explicit room and prefills the calendar name from a Google link', async () => {
    const { posts } = installFetchMock()
    render(<RoomsPanel venueId="v1" />)

    await screen.findByText('ROOMS (2)')
    const addButton = screen.getByText('+ ADD CALENDAR') as HTMLButtonElement
    expect(addButton.disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('New calendar link'), {
      target: { value: 'https://calendar.google.com/calendar/ical/hmsccomms%40gmail.com/public/basic.ics' },
    })
    expect((screen.getByLabelText('New calendar name') as HTMLInputElement).value).toBe('HMSCCOMMS')
    // Still no room selected, so the button stays disabled.
    expect(addButton.disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('New calendar room'), { target: { value: '__unassigned__' } })
    expect(addButton.disabled).toBe(false)
    fireEvent.click(addButton)

    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toMatchObject({
      url: '/api/admin/calendar-feeds',
      method: 'POST',
      body: expect.objectContaining({ venueId: 'v1', name: 'HMSCCOMMS', areaId: null }),
    })
  })

  it('keeps a calendar colour and table plan editable and saves them', async () => {
    const { posts } = installFetchMock()
    render(<RoomsPanel venueId="v1" />)

    await screen.findByText('ROOMS (2)')
    fireEvent.change(screen.getByLabelText('Calendar f1 colour'), { target: { value: '#abcdef' } })
    fireEvent.change(screen.getByLabelText('Calendar f1 table plan'), { target: { value: 'p1' } })
    const card = screen.getByLabelText('Calendar f1 colour').closest('div.border') as HTMLElement
    fireEvent.click(within(card).getByText('SAVE'))

    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toMatchObject({
      url: '/api/admin/calendar-feeds/f1',
      method: 'PUT',
      body: expect.objectContaining({ colour: '#abcdef', floorPlanId: 'p1' }),
    })
  })

  it('reorders calendars through the existing feed reorder route', async () => {
    const { posts } = installFetchMock()
    render(<RoomsPanel venueId="v1" />)

    await screen.findByText('ROOMS (2)')
    fireEvent.click(screen.getByLabelText('Move calendar f1 down'))

    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toMatchObject({
      url: '/api/admin/calendar-feeds/reorder',
      method: 'POST',
      body: { venueId: 'v1', orderedIds: ['f2', 'f1'] },
    })
  })

  it('shows why a dismissed calendar stays unassigned', async () => {
    installFetchMock()
    render(<RoomsPanel venueId="v1" />)

    expect(await screen.findByText(/ROOM REMOVED — THIS CALENDAR STAYS UNASSIGNED/)).toBeTruthy()
  })

  it('explains what happens to feeds and events before removing a room', async () => {
    const { posts } = installFetchMock()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<RoomsPanel venueId="v1" />)

    await screen.findByText('ROOMS (2)')
    const row = roomsTable().getByText('FUNCTION ROOM').closest('tr') as HTMLElement
    fireEvent.click(within(row).getByText('✕'))

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    const text = String(confirmSpy.mock.calls[0][0])
    expect(text).toContain('1 CALENDAR')
    expect(text).toContain('2 EVENTS')
    expect(posts).toHaveLength(0)
  })

  it('lists junk rooms and confirms before re-homing one', async () => {
    const { posts } = installFetchMock()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<RoomsPanel venueId="v1" />)

    expect(await screen.findByText('LIKELY JUNK ROOMS (1)')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Junk room target'), { target: { value: 'a1' } })
    fireEvent.click(screen.getByText('RE-HOME'))

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(String(confirmSpy.mock.calls[0][0])).toContain('1 CALENDAR')
    expect(posts).toHaveLength(0)

    confirmSpy.mockReturnValue(true)
    fireEvent.click(screen.getByText('RE-HOME'))

    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toMatchObject({
      url: '/api/admin/areas/cleanup',
      method: 'POST',
      body: expect.objectContaining({ areaId: 'j1', action: 'REHOME', targetAreaId: 'a1' }),
    })
  })
})
