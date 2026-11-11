import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/worker/useWorkerImmersive', () => ({ useWorkerImmersive: vi.fn() }))

import { WorkerStaffEventClient } from './WorkerStaffEventClient'

const detail = {
  id: 'e1',
  title: 'TEAM BRIEFING',
  description: 'Monthly all-staff briefing.',
  location: 'FUNCTION ROOM',
  startsAt: '2026-11-12T18:00:00.000Z',
  endsAt: '2026-11-12T20:00:00.000Z',
  allDay: false,
  attendanceRequired: true,
  allowMaybe: false,
  requireDeclineReason: true,
  responseDeadline: null,
  responseClosesAt: '2026-11-12T20:00:00.000Z',
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

function mockApi(onCall?: (url: string, init?: RequestInit) => void) {
  vi.spyOn(global, 'fetch').mockImplementation(async (input: unknown, init?: RequestInit) => {
    const url = String(input)
    onCall?.(url, init)
    return { ok: true, status: 200, json: async () => detail } as Response
  })
}

describe('WorkerStaffEventClient', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('shows the event and enforces the required decline reason', async () => {
    const calls: { url: string; body: string | null }[] = []
    mockApi((url, init) => calls.push({ url, body: (init?.body as string) ?? null }))
    render(<WorkerStaffEventClient id="e1" />)
    await screen.findByText('TEAM BRIEFING')
    expect(screen.getByText('FUNCTION ROOM')).toBeInTheDocument()
    expect(screen.getByText(/NOTES: Bring a notebook./)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'MAYBE' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'DECLINE' }))
    const confirm = screen.getByRole('button', { name: 'CONFIRM DECLINE' })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'SICK' } })
    fireEvent.click(confirm)
    await waitFor(() => {
      const call = calls.find((c) => c.url === '/api/worker/staff-events/e1/respond')
      expect(JSON.parse(call!.body ?? '{}')).toMatchObject({ response: 'DECLINED', reason: 'SICK' })
    })
  })
})
