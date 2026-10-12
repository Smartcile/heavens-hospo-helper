import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EventStaffingModal, EventClaimsModal } from '@/components/admin/EventStaffingModal'
import type { EventRosterEvent } from '@/lib/use-event-roster'

const positions = [{ id: 'p1', name: 'BARISTA', colour: '#60A5FA' }]

function event(partial: Partial<EventRosterEvent> = {}): EventRosterEvent {
  return {
    id: 'ev1',
    feedId: null,
    areaId: 'ar1',
    title: 'BOARD MEETING',
    description: null,
    location: 'MEETING ROOM 1',
    source: 'MANUAL',
    startsAt: new Date('2026-10-12T10:00:00Z'),
    endsAt: new Date('2026-10-12T12:00:00Z'),
    allDay: false,
    pax: 8,
    pdfPath: null,
    pdfUrl: null,
    floorPlanSlug: null,
    floorPlanName: null,
    staffing: [
      { id: 'sl1', positionId: 'p1', positionName: 'BARISTA', positionColour: null, label: null, count: 1, startTime: '09:00', endTime: '13:00', breakMinutes: 0, note: null, sortOrder: 0 },
    ],
    openShifts: [],
    shifts: [
      { id: 'shx', staffId: 'st1', staffName: 'LIAM HEAVEN', positionName: 'BARISTA', positionColour: null, date: '2026-10-12', startTime: '09:00', endTime: '13:00', breakMinutes: 0, tag: 'EVENT', status: 'DRAFT', fromClaim: true },
    ],
    ...partial,
  }
}

describe('EventStaffingModal', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('shows the event info, linked roster shifts and claim origin, and only manual events are editable', () => {
    render(
      <EventStaffingModal
        venueId="v1"
        event={event()}
        positions={positions}
        onClose={() => {}}
        onSaved={() => {}}
        onEdit={() => {}}
      />,
    )
    expect(screen.getByText('BOARD MEETING')).toBeDefined()
    expect(screen.getByText(/8 PAX/)).toBeDefined()
    expect(screen.getByText(/MEETING ROOM 1/)).toBeDefined()
    expect(screen.getByText('ROSTERED SHIFTS (1)')).toBeDefined()
    expect(screen.getByText('CLAIMED')).toBeDefined()
    expect(screen.getByText('DRAFT')).toBeDefined()
    expect(screen.getByText(/LIAM HEAVEN · 09:00–13:00/)).toBeDefined()
    expect(screen.getByText('EDIT EVENT')).toBeDefined()
    expect(screen.getByText('DELETE EVENT')).toBeDefined()
  })

  it('locks requirement editing while seats are listed and surfaces pending claims', () => {
    const withSeat = event({
      openShifts: [
        {
          id: 'os1', staffingId: 'sl1', positionId: 'p1', positionName: 'BARISTA', positionColour: null, label: null,
          date: '2026-10-12', startTime: '09:00', endTime: '13:00', breakMinutes: 0, note: null, status: 'OPEN',
          filledById: null, filledByName: null, filledShiftId: null,
          claims: [{ id: 'c1', staffId: 'st2', staffName: 'TAYLOR REED', status: 'PENDING', note: null, createdAt: '2026-10-01T00:00:00Z' }],
        },
      ],
      shifts: [],
    })
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({}) } as Response)

    render(
      <EventStaffingModal venueId="v1" event={withSeat} positions={positions} onClose={() => {}} onSaved={() => {}} onEdit={() => {}} />,
    )

    expect(screen.getByText(/0\/1 FILLED/)).toBeDefined()
    expect((screen.getByText('SAVE REQUIREMENTS') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/CANCEL THEM BELOW/)).toBeDefined()
    expect(screen.getByText(/TAYLOR REED WANTS THIS/)).toBeDefined()

    fireEvent.click(screen.getByText('APPROVE'))
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/admin/open-shift-claims/c1',
      expect.objectContaining({ method: 'POST', body: expect.stringContaining('"APPROVE"') }),
    )
  })

  it('lists claimable seats on FIND STAFF and posts the draft lines', async () => {
    const onSaved = vi.fn()
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({}) } as Response)

    render(
      <EventStaffingModal venueId="v1" event={event()} positions={positions} onClose={() => {}} onSaved={onSaved} onEdit={() => {}} />,
    )

    fireEvent.click(screen.getByText('FIND STAFF'))
    expect(screen.getByText(/LIST 1 SHIFT\(S\)/)).toBeDefined()
    fireEvent.click(screen.getByText('LIST SHIFTS'))

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/admin/event-roster/ev1/find-staff',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
  })

  it('marks non-manual events as imported and hides edit/delete', () => {
    render(
      <EventStaffingModal venueId="v1" event={event({ source: 'ICAL' })} positions={positions} onClose={() => {}} onSaved={() => {}} onEdit={() => {}} />,
    )
    expect(screen.getByText(/IMPORTED FROM ICAL FEED/)).toBeDefined()
    expect(screen.queryByText('EDIT EVENT')).toBeNull()
    expect(screen.queryByText('DELETE EVENT')).toBeNull()
  })
})

describe('EventClaimsModal', () => {
  it('reviews queue claims through the callback', () => {
    const onReview = vi.fn()
    render(
      <EventClaimsModal
        queue={[
          { id: 'qc1', openShiftId: 'os1', staffId: 'st2', staffName: 'TAYLOR REED', note: null, createdAt: '2026-10-01T00:00:00Z', date: '2026-10-12', startTime: '09:00', endTime: '13:00', positionName: 'BARISTA', label: null, eventTitle: 'BOARD MEETING', eventId: 'ev1' },
        ]}
        busy={false}
        onReview={onReview}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText('CLAIMS TO REVIEW (1)')).toBeDefined()
    fireEvent.click(screen.getByText('APPROVE'))
    expect(onReview).toHaveBeenCalledWith('qc1', 'APPROVE')
  })
})
