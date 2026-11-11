import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StaffEventNoticeCard, type StaffEventNoticeData } from './StaffEventNoticeCard'

const base: StaffEventNoticeData = {
  id: 'e1',
  title: 'TEAM BRIEFING',
  description: 'Monthly all-staff briefing.',
  location: 'FUNCTION ROOM',
  startsAt: '2026-11-12T18:00:00.000Z',
  endsAt: '2026-11-12T20:00:00.000Z',
  allDay: false,
  attendanceRequired: true,
  allowMaybe: false,
  requireDeclineReason: false,
  responseDeadline: '2026-11-10T23:59:00.000Z',
  notes: 'Bring a notebook.',
  organiserName: 'ADA MANAGER',
  reminderSentAt: null,
  response: 'PENDING',
  respondedAt: null,
  reason: null,
  canRespond: true,
  allowedResponses: ['ACCEPTED', 'DECLINED'],
  icsUrl: '/api/worker/staff-events/e1/ics',
}

describe('StaffEventNoticeCard', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('shows the full event details inline', () => {
    render(<StaffEventNoticeCard event={base} busy={false} onRespond={() => {}} />)
    expect(screen.getByText('TEAM BRIEFING')).toBeInTheDocument()
    expect(screen.getByText(/thu, 12 nov/i)).toBeInTheDocument()
    expect(screen.getByText(/18:00–20:00/)).toBeInTheDocument()
    expect(screen.getByText('FUNCTION ROOM')).toBeInTheDocument()
    expect(screen.getByText('Monthly all-staff briefing.')).toBeInTheDocument()
    expect(screen.getByText(/FROM ADA MANAGER/)).toBeInTheDocument()
    expect(screen.getByText('ATTENDANCE REQUIRED')).toBeInTheDocument()
    expect(screen.getByText('NOT YET RESPONDED')).toBeInTheDocument()
    expect(screen.getByText(/NOTES: Bring a notebook./)).toBeInTheDocument()
  })

  it('sends ACCEPT and hides Maybe when the event does not allow it', () => {
    const onRespond = vi.fn()
    render(<StaffEventNoticeCard event={base} busy={false} onRespond={onRespond} />)
    expect(screen.queryByRole('button', { name: 'MAYBE' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ACCEPT' }))
    expect(onRespond).toHaveBeenCalledWith('e1', 'ACCEPTED')
  })

  it('shows Maybe only when allowed', () => {
    const onRespond = vi.fn()
    render(<StaffEventNoticeCard event={{ ...base, allowMaybe: true, allowedResponses: ['ACCEPTED', 'DECLINED', 'MAYBE'] }} busy={false} onRespond={onRespond} />)
    fireEvent.click(screen.getByRole('button', { name: 'MAYBE' }))
    expect(onRespond).toHaveBeenCalledWith('e1', 'MAYBE')
  })

  it('asks for a reason before a required decline is sent', () => {
    const onRespond = vi.fn()
    render(<StaffEventNoticeCard event={{ ...base, requireDeclineReason: true }} busy={false} onRespond={onRespond} />)
    fireEvent.click(screen.getByRole('button', { name: 'DECLINE' }))
    expect(onRespond).not.toHaveBeenCalled()
    const confirm = screen.getByRole('button', { name: 'CONFIRM DECLINE' })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'SICK' } })
    expect(confirm).not.toBeDisabled()
    fireEvent.click(confirm)
    expect(onRespond).toHaveBeenCalledWith('e1', 'DECLINED', 'SICK')
  })

  it('decides immediately when no reason is required', () => {
    const onRespond = vi.fn()
    render(<StaffEventNoticeCard event={base} busy={false} onRespond={onRespond} />)
    fireEvent.click(screen.getByRole('button', { name: 'DECLINE' }))
    expect(onRespond).toHaveBeenCalledWith('e1', 'DECLINED', undefined)
  })

  it('offers Add to calendar once accepted and shows the current answer', () => {
    render(<StaffEventNoticeCard event={{ ...base, response: 'ACCEPTED', respondedAt: '2026-11-01T00:00:00.000Z' }} busy={false} onRespond={() => {}} />)
    expect(screen.getByText('ACCEPTED')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ADD TO CALENDAR' })).toHaveAttribute('href', '/api/worker/staff-events/e1/ics')
    expect(screen.getByRole('link', { name: /FULL DETAILS/ })).toHaveAttribute('href', '/w/staff-events/e1')
  })

  it('closes the buttons after the response window', () => {
    render(<StaffEventNoticeCard event={{ ...base, canRespond: false }} busy={false} onRespond={() => {}} />)
    expect(screen.queryByRole('button', { name: 'ACCEPT' })).not.toBeInTheDocument()
    expect(screen.getByText('RESPONSES ARE CLOSED FOR THIS EVENT.')).toBeInTheDocument()
  })

  it('surfaces a reminder for a non-responder', () => {
    render(<StaffEventNoticeCard event={{ ...base, reminderSentAt: '2026-11-09T00:00:00.000Z' }} busy={false} onRespond={() => {}} />)
    expect(screen.getByText(/THE ORGANISER IS WAITING/)).toBeInTheDocument()
  })
})
