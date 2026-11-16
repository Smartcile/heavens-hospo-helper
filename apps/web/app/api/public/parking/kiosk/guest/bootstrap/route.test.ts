import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { loadGuestEntryBootstrap } = vi.hoisted(() => ({
  loadGuestEntryBootstrap: vi.fn(),
}))

vi.mock('@/lib/ftp-guest-entry.server', () => ({ loadGuestEntryBootstrap }))

import { GET } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  loadGuestEntryBootstrap.mockResolvedValue({
    enabled: true,
    venueId: 'v1',
    venueName: 'THE VENUE',
    label: 'RAYC GUESTS',
    timezone: 'Pacific/Auckland',
    links: [{ id: 't1' }],
  })
})

describe('GET /api/public/parking/kiosk/guest/bootstrap', () => {
  it('passes the venue and type through without caching', async () => {
    const req = new NextRequest(
      'http://localhost/api/public/parking/kiosk/guest/bootstrap?venue=v1&type=t1',
    )
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(loadGuestEntryBootstrap).toHaveBeenCalledWith('v1', 't1')
    expect((await res.json()).label).toBe('RAYC GUESTS')
  })
})
