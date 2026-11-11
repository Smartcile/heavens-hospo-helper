import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { WorkerNoticesClient } from './WorkerNoticesClient'

const staffEvent = {
  id: 'e1',
  title: 'TEAM BRIEFING',
  description: 'Monthly all-staff briefing.',
  location: 'FUNCTION ROOM',
  startsAt: '2026-11-12T18:00:00.000Z',
  endsAt: '2026-11-12T20:00:00.000Z',
  allDay: false,
  attendanceRequired: true,
  allowMaybe: true,
  requireDeclineReason: false,
  responseDeadline: null,
  responseClosesAt: '2026-11-12T20:00:00.000Z',
  notes: null,
  organiserName: 'ADA MANAGER',
  reminderSentAt: null,
  response: 'PENDING',
  respondedAt: null,
  reason: null,
  canRespond: true,
  allowedResponses: ['ACCEPTED', 'DECLINED', 'MAYBE'],
  icsUrl: '/api/worker/staff-events/e1/ics',
}

function mockApi(onCall?: (url: string, init?: RequestInit) => void) {
  vi.spyOn(global, 'fetch').mockImplementation(async (input: unknown, init?: RequestInit) => {
    const url = String(input)
    onCall?.(url, init)
    return {
      ok: true,
      status: 200,
      json: async () => ({ firstName: 'SAM', items: [{ id: 'n1', title: 'TEAM BRIEFING', body: 'briefing', priority: 'IMPORTANT', pinned: true, requiresAck: false, acked: false, createdAt: '2026-11-01T00:00:00.000Z', staffEvent }], unackedRequired: 0 }),
    } as Response
  })
}

describe('WorkerNoticesClient — staff event branch', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('renders the inline staff event with Accept/Decline/Maybe and no GOT IT button', async () => {
    mockApi()
    render(<WorkerNoticesClient />)
    await screen.findByText('TEAM BRIEFING')
    expect(screen.getByText('Monthly all-staff briefing.')).toBeInTheDocument()
    expect(screen.getByText(/RESPONSES CLOSE AT/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ACCEPT' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'DECLINE' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'MAYBE' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'GOT IT' })).not.toBeInTheDocument()
  })

  it('posts an accept to the staff-event respond endpoint', async () => {
    const calls: { url: string; body: string | null }[] = []
    mockApi((url, init) => calls.push({ url, body: (init?.body as string) ?? null }))
    render(<WorkerNoticesClient />)
    await screen.findByText('TEAM BRIEFING')
    fireEvent.click(screen.getByRole('button', { name: 'ACCEPT' }))
    await waitFor(() => {
      const call = calls.find((c) => c.url === '/api/worker/staff-events/e1/respond')
      expect(call).toBeTruthy()
      expect(JSON.parse(call!.body ?? '{}')).toMatchObject({ response: 'ACCEPTED' })
    })
  })
})
