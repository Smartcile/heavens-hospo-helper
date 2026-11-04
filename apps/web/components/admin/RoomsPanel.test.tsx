import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RoomsPanel } from '@/components/admin/RoomsPanel'

function json(data: unknown): Response {
  return { ok: true, json: async () => data } as Response
}

describe('RoomsPanel', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('lists areas and adds a room', async () => {
    const posts: unknown[] = []
    vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/api/admin/calendar-feeds')) {
        return json({
          areas: [{ id: 'a1', name: 'FUNCTION ROOM', colour: null, capacity: 22, floorPlanId: null, notes: null, sortOrder: 0, isActive: true }],
          feeds: [],
          floorPlans: [{ id: 'p1', name: 'MAIN PLAN' }],
        })
      }
      if (String(input) === '/api/admin/areas' && init?.method === 'POST') {
        posts.push(JSON.parse(String(init.body)))
        return json({ id: 'a2' })
      }
      return json({})
    })

    render(<RoomsPanel venueId="v1" />)

    expect(await screen.findByText('ROOMS (1)')).toBeDefined()
    fireEvent.change(screen.getByPlaceholderText('FUNCTION ROOM'), { target: { value: 'bar area' } })
    fireEvent.click(screen.getByText('+ ADD ROOM'))

    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toMatchObject({ venueId: 'v1', name: 'BAR AREA' })
  })
})
