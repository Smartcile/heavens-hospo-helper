import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { loadKioskBootstrap } = vi.hoisted(() => ({ loadKioskBootstrap: vi.fn() }))

vi.mock('@/lib/parking-kiosk-bootstrap.server', () => ({ loadKioskBootstrap }))

import { GET } from './route'

const CONFIG = {
  venueId: 'v1',
  requireCode: true,
  venueName: 'THE VENUE',
  guestEnabled: true,
  carparkName: 'CARPARK',
  durationMinutes: 90,
  timezone: 'Pacific/Auckland',
  resetSeconds: 60,
  fourHourTypes: [],
}

beforeEach(() => vi.clearAllMocks())

describe('GET /api/public/parking/kiosk/bootstrap', () => {
  it('passes the requested venue through and returns the config', async () => {
    loadKioskBootstrap.mockResolvedValue({ locked: false, config: CONFIG })
    const res = await GET(
      new NextRequest('http://localhost/api/public/parking/kiosk/bootstrap?venue=v1'),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ locked: false, config: CONFIG })
    expect(loadKioskBootstrap).toHaveBeenCalledWith('v1')
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('returns a locked result with its message', async () => {
    loadKioskBootstrap.mockResolvedValue({
      locked: true,
      message: 'THE KIOSK IS NOT ENABLED FOR THIS VENUE',
    })
    const res = await GET(
      new NextRequest('http://localhost/api/public/parking/kiosk/bootstrap'),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      locked: true,
      message: 'THE KIOSK IS NOT ENABLED FOR THIS VENUE',
    })
  })
})
