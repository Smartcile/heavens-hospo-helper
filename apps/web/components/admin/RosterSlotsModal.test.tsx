import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

import { RosterSlotsModal } from '@/components/admin/RosterSlotsModal'

interface FetchCall { url: string; init?: RequestInit }

function mockFetch(handler: (call: FetchCall) => unknown) {
  const spy = vi.spyOn(global, 'fetch')
  spy.mockImplementation(async (input, init) => {
    const call = { url: String(input), init: init ?? undefined }
    return { ok: true, json: async () => handler(call) } as Response
  })
  return spy
}

const slot = {
  id: 'slot1', name: 'DUTY MANAGER', positionId: 'p1', positionName: 'DUTY MANAGER',
  startTime: '07:00', endTime: '16:00', breakMinutes: 30, headcount: 2,
  colour: '#111111', tag: null, isActive: true, sortOrder: 0,
}

const positions = [{ id: 'p1', name: 'DUTY MANAGER', colour: '#111111' }]
const staff = [{ id: 's1', firstName: 'JANE', lastName: 'SMITH' }, { id: 's2', firstName: 'SAM', lastName: 'BROWN' }]

afterEach(() => vi.restoreAllMocks())

describe('RosterSlotsModal', () => {
  it('lists saved slots', async () => {
    mockFetch(({ url }) => (url.includes('/slots?') ? { slots: [slot] } : {}))
    render(<RosterSlotsModal venueId="v1" positions={positions} staff={staff} defaultDate="2026-11-09" onClose={vi.fn()} onPlaced={vi.fn()} />)

    expect(await screen.findByText('WORKING SLOTS')).toBeDefined()
    expect(await screen.findByText(/2 SEATS · 07:00–16:00/)).toBeDefined()
    expect(screen.getByText('PLACE')).toBeDefined()
    expect(screen.getByText('EDIT')).toBeDefined()
  })

  it('creates a slot', async () => {
    const spy = mockFetch(({ url }) => (url.includes('/slots?') ? { slots: [] } : { id: 'new' }))
    render(<RosterSlotsModal venueId="v1" positions={positions} staff={staff} defaultDate="2026-11-09" onClose={vi.fn()} onPlaced={vi.fn()} />)
    await screen.findByText('NO SLOTS YET. CREATE ONE ABOVE.')

    fireEvent.click(screen.getByText('+ NEW SLOT'))
    fireEvent.change(screen.getByPlaceholderText('DUTY MANAGER'), { target: { value: 'BAR' } })
    fireEvent.click(screen.getByText('SAVE SLOT'))

    await waitFor(() => {
      const call = spy.mock.calls.find(([url]) => String(url) === '/api/admin/roster/slots')
      expect(call).toBeDefined()
      expect(JSON.parse(String(call![1]!.body))).toMatchObject({
        venueId: 'v1', name: 'BAR', startTime: '07:00', endTime: '16:00', headcount: 1,
      })
    })
    expect(await screen.findByText('SLOT CREATED')).toBeDefined()
  })

  it('places a slot for the chosen staff', async () => {
    const spy = mockFetch(({ url }) => {
      if (url.includes('/slots?')) return { slots: [slot] }
      if (url.includes('/place')) return { created: 1, skippedSeats: 1, skippedStaffIds: [] }
      return {}
    })
    const onPlaced = vi.fn()
    render(<RosterSlotsModal venueId="v1" positions={positions} staff={staff} defaultDate="2026-11-09" onClose={vi.fn()} onPlaced={onPlaced} />)
    await screen.findByText('PLACE')

    fireEvent.click(screen.getByText('PLACE'))
    expect(await screen.findByText('PLACE — DUTY MANAGER')).toBeDefined()
    fireEvent.click(screen.getByText('JANE SMITH'))
    fireEvent.click(screen.getByText('PLACE SLOT'))

    await waitFor(() => {
      const call = spy.mock.calls.find(([url]) => String(url) === '/api/admin/roster/slots/slot1/place')
      expect(call).toBeDefined()
      expect(JSON.parse(String(call![1]!.body))).toEqual({ date: '2026-11-09', staffIds: ['s1'] })
    })
    expect(onPlaced).toHaveBeenCalled()
  })
})
