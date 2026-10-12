import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CalendarEventFormModal } from '@/components/admin/CalendarEventFormModal'

function jsonRes(data: unknown): Response {
  return { ok: true, json: async () => data } as Response
}

describe('CalendarEventFormModal', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('creates a manual event, warns over capacity and posts staffing lines', async () => {
    const posts: Record<string, unknown>[] = []
    vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/admin/areas')) {
        return jsonRes({ areas: [{ id: 'ar1', name: 'MEETING ROOM 1', capacity: 12, isActive: true, floorPlan: { name: 'ROOM 1 LAYOUT' } }] })
      }
      if (url.includes('/api/admin/positions')) return jsonRes([{ id: 'p1', name: 'BARISTA' }])
      if (url === '/api/admin/calendar-events' && init?.method === 'POST') {
        posts.push(JSON.parse(String(init.body)))
        return jsonRes({ event: { id: 'new1' } })
      }
      return jsonRes([])
    })

    const onSaved = vi.fn()
    render(<CalendarEventFormModal venueId="v1" defaultDate="2026-10-12" onClose={() => {}} onSaved={onSaved} />)

    fireEvent.change(await screen.findByPlaceholderText('BOARD MEETING'), { target: { value: 'Board meeting' } })
    const areaSelect = (await screen.findByText('MEETING ROOM 1')).closest('select')!
    fireEvent.change(areaSelect, { target: { value: 'ar1' } })

    // Capacity warning is soft — pax over the area's max.
    fireEvent.change(screen.getByPlaceholderText('GUESTS'), { target: { value: '20' } })
    expect(await screen.findByText(/OVER CAPACITY — MEETING ROOM 1 SEATS 12/)).toBeDefined()

    // Add a named role via the shared staffing editor.
    fireEvent.click(screen.getByText('+ ADD ROLE'))
    const positionSelects = document.querySelectorAll('select')
    fireEvent.change(positionSelects[positionSelects.length - 1], { target: { value: 'p1' } })

    fireEvent.click(screen.getByText('CREATE EVENT'))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toMatchObject({ venueId: 'v1', title: 'Board meeting', areaId: 'ar1', date: '2026-10-12', pax: 20 })
    expect((posts[0].staffing as unknown[]).length).toBe(1)
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
  })

  it('loads an existing event for editing and PUTs the merged fields', async () => {
    const puts: Record<string, unknown>[] = []
    vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/admin/areas')) return jsonRes({ areas: [] })
      if (url.includes('/api/admin/positions')) return jsonRes([{ id: 'p1', name: 'BARISTA' }])
      if (url === '/api/admin/calendar-events/ev1' && !init?.method) {
        return jsonRes({
          event: {
            id: 'ev1', title: 'BOARD MEETING', description: null, areaId: null,
            startsAt: '2026-10-12T10:00:00.000Z', endsAt: '2026-10-12T12:00:00.000Z',
            allDay: false, pax: 8, pdfUrl: null, pdfPath: null,
          },
          staffing: [{ id: 'sl1', positionId: 'p1', label: null, count: 2, startTime: '09:00', endTime: '13:00', breakMinutes: 0, note: null }],
        })
      }
      if (url === '/api/admin/calendar-events/ev1' && init?.method === 'PUT') {
        puts.push(JSON.parse(String(init.body)))
        return jsonRes({ event: { id: 'ev1' } })
      }
      return jsonRes([])
    })

    render(<CalendarEventFormModal venueId="v1" eventId="ev1" onClose={() => {}} onSaved={() => {}} />)

    await waitFor(() =>
      expect((screen.getByPlaceholderText('BOARD MEETING') as HTMLInputElement).value).toBe('BOARD MEETING'),
    )
    expect((screen.getByPlaceholderText('GUESTS') as HTMLInputElement).value).toBe('8')

    fireEvent.click(screen.getByText('SAVE'))
    await waitFor(() => expect(puts).toHaveLength(1))
    expect(puts[0]).toMatchObject({ title: 'BOARD MEETING', date: '2026-10-12', allDay: false, pax: 8 })
    expect((puts[0].staffing as { count: number }[])[0].count).toBe(2)
  })
})
