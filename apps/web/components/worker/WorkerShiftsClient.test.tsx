import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { WorkerShiftsClient } from '@/components/worker/WorkerShiftsClient'
import { keyOfDay } from '@/lib/date-nav'

const today = keyOfDay(new Date())

const openShift = {
  id: 'os1',
  date: today,
  startTime: '17:00',
  endTime: '23:00',
  breakMinutes: 0,
  note: null,
  positionId: 'pos1',
  positionName: 'BARTENDER',
  positionColour: null,
  label: null,
  eventId: 'ev1',
  eventTitle: 'GALA DINNER',
  eventLocation: 'TE KAWAU ROOM',
  conflicts: false,
}

function mockApi(payload: unknown, onCall?: (url: string, method: string) => void) {
  vi.spyOn(global, 'fetch').mockImplementation(async (url: unknown, init?: RequestInit) => {
    onCall?.(String(url), init?.method ?? 'GET')
    return { ok: true, json: async () => payload } as Response
  })
}

describe('WorkerShiftsClient', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('renders the month grid, the day count and the my-claims queue', async () => {
    mockApi({
      today,
      positionIds: ['pos1'],
      shifts: [openShift],
      myClaims: [
        {
          id: 'claim1', openShiftId: 'os2', status: 'PENDING', note: null, reviewNote: null, shiftId: null,
          createdAt: '2025-01-01T00:00:00.000Z', date: today, startTime: '08:00', endTime: '16:00',
          positionName: 'BARISTA', label: null, openShiftStatus: 'OPEN',
        },
      ],
    })

    render(<WorkerShiftsClient />)

    expect(await screen.findByText('AVAILABLE SHIFTS')).toBeDefined()
    expect(screen.getByText(/1 SHIFT YOU CAN PICK UP/)).toBeDefined()
    // Pending claim panel.
    expect(screen.getByText('WAITING FOR A MANAGER')).toBeDefined()
    expect(screen.getByText('WITHDRAW')).toBeDefined()
    // Month grid shows the day badge.
    expect(screen.getAllByText('1').length).toBeGreaterThan(0)
  })

  it('opens the day sheet and sends a claim', async () => {
    const calls: string[] = []
    mockApi({ today, positionIds: ['pos1'], shifts: [openShift], myClaims: [] }, (url, method) => {
      calls.push(`${method} ${url}`)
    })

    render(<WorkerShiftsClient />)

    // The day cell is the only button whose text begins with the day number — open it via the shift role label.
    fireEvent.click(await screen.findByText('BARTENDER'))
    const claimButton = await screen.findByText('CLAIM')
    fireEvent.click(claimButton)

    await waitFor(() => expect(calls.some((c) => c.startsWith('POST') && c.includes('/api/worker/shifts/os1/claim'))).toBe(true))
    expect(await screen.findByText(/CLAIM SENT/)).toBeDefined()
  })

  it('warns about an availability conflict on the card', async () => {
    mockApi({ today, positionIds: ['pos1'], shifts: [{ ...openShift, conflicts: true }], myClaims: [] })

    render(<WorkerShiftsClient />)

    fireEvent.click(await screen.findByText('BARTENDER'))
    expect(await screen.findByText(/YOU MARKED YOURSELF UNAVAILABLE/)).toBeDefined()
  })

  it('withdraws a pending claim', async () => {
    const calls: string[] = []
    mockApi(
      {
        today,
        positionIds: [],
        shifts: [],
        myClaims: [
          {
            id: 'claim1', openShiftId: 'os2', status: 'PENDING', note: null, reviewNote: null, shiftId: null,
            createdAt: '2025-01-01T00:00:00.000Z', date: today, startTime: '08:00', endTime: '16:00',
            positionName: 'BARISTA', label: null, openShiftStatus: 'OPEN',
          },
        ],
      },
      (url, method) => calls.push(`${method} ${url}`),
    )

    render(<WorkerShiftsClient />)

    fireEvent.click(await screen.findByText('WITHDRAW'))
    await waitFor(() => expect(calls.some((c) => c.startsWith('DELETE') && c.includes('/api/worker/shifts/claims/claim1'))).toBe(true))
  })

  it('shows confirmed claims', async () => {
    mockApi({
      today,
      positionIds: [],
      shifts: [],
      myClaims: [
        {
          id: 'claim1', openShiftId: 'os2', status: 'APPROVED', note: null, reviewNote: null, shiftId: 'shift1',
          createdAt: '2025-01-01T00:00:00.000Z', date: today, startTime: '08:00', endTime: '16:00',
          positionName: 'BARISTA', label: null, openShiftStatus: 'FILLED',
        },
      ],
    })

    render(<WorkerShiftsClient />)

    expect(await screen.findByText('CONFIRMED FOR YOU')).toBeDefined()
    expect(screen.getByText(/ON YOUR SCHEDULE ONCE THE WEEK IS PUBLISHED/)).toBeDefined()
  })
})
