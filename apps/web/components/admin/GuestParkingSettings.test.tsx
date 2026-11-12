import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { GuestParkingSettings } from './GuestParkingSettings'

const fetchMock = vi.fn()

function jsonResponse(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response)
}

const CONFIG = {
  enabled: true,
  entryUrl: 'https://scan2pay.nz/Parking/Scan?carparkId=19',
  carparkId: 19,
  carparkName: 'The Landing Carpark',
  durationMinutes: 90,
  healthCheckMode: 'READINESS',
  healthPlate: 'STELLA',
  lastCheckAt: '2026-11-12T05:00:00.000Z',
  lastCheckOk: true,
  lastCheckMessage: 'FORM READY',
}

const HEALTH = { ok: true, stale: false, message: 'FORM READY' }

function install(overrides: {
  config?: Record<string, unknown>
  health?: Record<string, unknown>
  put?: { status: number; body: unknown }
  check?: { status: number; body: unknown }
}) {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const u = String(url)
    if (u.startsWith('/api/admin/parking/registrations')) {
      return jsonResponse({ registrations: [], timezone: 'Pacific/Auckland' })
    }
    if (u.startsWith('/api/admin/parking/config')) {
      if (init?.method === 'PUT') {
        return jsonResponse(overrides.put?.body ?? { config: CONFIG, health: HEALTH }, overrides.put?.status ?? 200)
      }
      return jsonResponse({
        config: { ...CONFIG, ...(overrides.config ?? {}) },
        health: { ...HEALTH, ...(overrides.health ?? {}) },
      })
    }
    if (u === '/api/admin/parking/health') {
      return jsonResponse(overrides.check?.body ?? { result: { message: 'FORM READY' }, health: HEALTH }, overrides.check?.status ?? 200)
    }
    return jsonResponse({})
  })
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GuestParkingSettings', () => {
  it('loads the config and shows the carpark name', async () => {
    install({})
    render(<GuestParkingSettings venueId="v1" role="ADMIN" />)

    expect(await screen.findByText(/CARPARK: The Landing Carpark/)).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).toBeChecked()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/parking/registrations?venueId=v1&limit=20',
    )
  })

  it('disables parking by saving the toggle', async () => {
    install({ put: { status: 200, body: { config: { ...CONFIG, enabled: false }, health: HEALTH } } })
    render(<GuestParkingSettings venueId="v1" role="ADMIN" />)

    const toggle = await screen.findByRole('checkbox')
    fireEvent.click(toggle)

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'PUT')
      expect(call).toBeTruthy()
      expect(JSON.parse(String((call?.[1] as RequestInit).body))).toMatchObject({
        venueId: 'v1',
        enabled: false,
      })
    })
  })

  it('runs a check and shows the result', async () => {
    install({})
    render(<GuestParkingSettings venueId="v1" role="ADMIN" />)

    await screen.findByText(/CARPARK: The Landing Carpark/)
    fireEvent.click(screen.getByRole('button', { name: 'RUN CHECK NOW' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/parking/health',
        expect.objectContaining({ method: 'POST' }),
      )
    })
    expect(await screen.findByText(/CHECK: FORM READY/)).toBeInTheDocument()
  })

  it('warns when the last check failed', async () => {
    install({ health: { ok: false, stale: false, message: 'HTTP 502' } })
    render(<GuestParkingSettings venueId="v1" role="ADMIN" />)

    expect(await screen.findByText('LAST CHECK: NEEDS ATTENTION')).toBeInTheDocument()
    expect(screen.getByText(/HTTP 502/)).toBeInTheDocument()
  })

  it('surfaces a save error for a non-Scan2Pay URL', async () => {
    install({
      put: {
        status: 422,
        body: { error: 'ONLY SCAN2PAY.NZ CARPARK URLS ARE SUPPORTED' },
      },
    })
    render(<GuestParkingSettings venueId="v1" role="ADMIN" />)

    const url = await screen.findByPlaceholderText('https://scan2pay.nz/Parking/Scan?carparkId=19')
    fireEvent.change(url, { target: { value: 'https://example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'SAVE' }))

    expect(await screen.findByText('ONLY SCAN2PAY.NZ CARPARK URLS ARE SUPPORTED')).toBeInTheDocument()
  })
})
