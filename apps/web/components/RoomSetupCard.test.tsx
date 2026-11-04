import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { RoomSetupCard } from '@/components/RoomSetupCard'

const setup = {
  id: 'setup1',
  name: 'WEDDING A',
  roomName: 'Main Room',
  guestCapacity: 22,
  setupStyle: 'Sit Down',
  imageUrls: ['/api/upload/room.jpg'],
  floorPlan: { id: 'plan1', name: 'MAIN FLOOR', slug: 'main-floor' },
}

describe('RoomSetupCard', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn((url: string) => {
      if (url.includes('/api/admin/floorplan/plan1/setups/setup1')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              items: [
                { id: 'i1', x: 0, y: 0, rotation: 0, assignedNumber: '1', furnitureItem: { elementWidth: 80, elementDepth: 80 } },
                { id: 'i2', x: 200, y: 0, rotation: 0, assignedNumber: '2', furnitureItem: { elementWidth: 120, elementDepth: 80 } },
              ],
            }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    }) as unknown as typeof fetch
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('shows the room label, pax/style and photos', async () => {
    render(<RoomSetupCard setup={setup} />)

    expect(screen.getByText('MAIN ROOM - 22PAX SIT DOWN')).toBeTruthy()
    expect(
      screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === '22 PAX · SIT DOWN · TABLE PLAN: MAIN FLOOR'),
    ).toBeTruthy()
    expect(screen.getByAltText(/MAIN ROOM - 22PAX SIT DOWN photo 1/)).toBeTruthy()
    // Flush the thumbnail fetch so the React update is inside act().
    await waitFor(() => expect(screen.getByRole('img', { name: 'Table plan preview' })).toBeTruthy())
  })

  it('draws the linked table plan', async () => {
    render(<RoomSetupCard setup={setup} />)

    await waitFor(() => expect(screen.getByRole('img', { name: 'Table plan preview' })).toBeTruthy())
    expect(document.querySelectorAll('polygon')).toHaveLength(2)
  })

  it('renders nothing for a plain layout with no room data or plan', () => {
    const { container } = render(
      <RoomSetupCard setup={{ id: 'plain', name: 'DEFAULT', imageUrls: [] }} />,
    )
    expect(container.querySelector('img')).toBeNull()
  })
})
