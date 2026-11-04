import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RoomSetupsPanel } from '@/components/admin/RoomSetupsPanel'

function json(data: unknown): Response {
  return { ok: true, json: async () => data } as Response
}

describe('RoomSetupsPanel', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('lists setups and links one to a room', async () => {
    const puts: unknown[] = []
    vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/admin/floorplan-setups')) {
        return json([
          {
            id: 's1', name: 'WEDDING A', roomName: null, areaId: null,
            guestCapacity: 22, setupStyle: 'SIT DOWN', imageUrls: [],
            floorPlan: { id: 'p1', name: 'MAIN PLAN' },
          },
        ])
      }
      if (url.includes('/api/admin/calendar-feeds')) {
        return json({ areas: [{ id: 'a1', name: 'FUNCTION ROOM' }], feeds: [], floorPlans: [] })
      }
      if (url === '/api/admin/floorplan/p1/setups/s1' && init?.method === 'PUT') {
        puts.push(JSON.parse(String(init.body)))
        return json({ id: 's1' })
      }
      return json({})
    })

    render(<RoomSetupsPanel venueId="v1" />)

    expect(await screen.findByText('WEDDING A')).toBeDefined()
    expect(screen.getByText(/22PAX · SIT DOWN/)).toBeDefined()

    fireEvent.change(screen.getByLabelText('Room for WEDDING A'), { target: { value: 'a1' } })

    await waitFor(() => expect(puts).toHaveLength(1))
    expect(puts[0]).toEqual({ areaId: 'a1' })
  })
})
