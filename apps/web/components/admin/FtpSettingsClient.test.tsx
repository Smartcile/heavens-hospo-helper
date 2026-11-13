import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FtpSettingsClient } from './FtpSettingsClient'

const fetchMock = vi.fn()

function jsonResponse(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response)
}

const FTP = {
  settings: {
    contactEmail: 'carpark@venue.nz',
    kioskEnabled: true,
    kioskRequireCode: false,
    kioskCodeHint: '45',
    kioskAutoResetSeconds: 60,
    fourHourName: '4 HOUR CAR PARK',
    fourHourEnabled: false,
    fourHourEntryUrl: null,
    fourHourDurationMinutes: 240,
    staffParkingEnabled: true,
    staffCarparkName: 'STAFF CARPARK',
    staffCarparkNotes: null,
  },
  parking: { enabled: true, carparkName: 'THE LANDING', durationMinutes: 90 },
  kioskUrl: 'https://venue.nz/park',
}

function install() {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const u = String(url)
    if (u === '/api/admin/venues') return jsonResponse([{ id: 'v1', name: 'THE VENUE' }])
    if (u.startsWith('/api/admin/parking/ftp/kiosk-code')) {
      return jsonResponse({ code: 'ABCD2345', hint: '45' })
    }
    if (u.startsWith('/api/admin/parking/ftp')) {
      if (init?.method === 'PUT') return jsonResponse({ settings: FTP.settings, kioskUrl: FTP.kioskUrl })
      return jsonResponse(FTP)
    }
    if (u.startsWith('/api/admin/parking/staff-plates')) {
      return jsonResponse({
        requests: [],
        plates: [],
        counts: { pending: 0, toEnter: 0, active: 0 },
        timezone: 'Pacific/Auckland',
      })
    }
    if (u.startsWith('/api/admin/parking/config')) {
      return jsonResponse({
        config: {
          enabled: true,
          entryUrl: 'https://scan2pay.nz/Parking/Scan?carparkId=19',
          carparkId: 19,
          carparkName: 'THE LANDING',
          durationMinutes: 90,
          healthCheckMode: 'READINESS',
          healthPlate: 'STELLA',
          lastCheckAt: null,
          lastCheckOk: null,
          lastCheckMessage: null,
        },
        health: { ok: true, stale: false, message: 'FORM READY' },
      })
    }
    if (u.startsWith('/api/admin/parking/registrations')) {
      return jsonResponse({ registrations: [], timezone: 'Pacific/Auckland' })
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

describe('FtpSettingsClient', () => {
  it('renders the four parking areas and the kiosk URL', async () => {
    install()
    render(<FtpSettingsClient role="ADMIN" sessionVenueId="v1" />)

    expect(await screen.findByText('FREE THE CARPARK (FTP)')).toBeInTheDocument()
    expect(screen.getByText('CUSTOMER KIOSK')).toBeInTheDocument()
    expect(screen.getByText('90 MINUTE CAR PARK')).toBeInTheDocument()
    expect(screen.getByText('4 HOUR CAR PARK')).toBeInTheDocument()
    expect(screen.getAllByText('STAFF CAR PARK').length).toBeGreaterThan(0)
    expect(screen.getByText('https://venue.nz/park')).toBeInTheDocument()
  })

  it('saves the FTP fields', async () => {
    install()
    render(<FtpSettingsClient role="ADMIN" sessionVenueId="v1" />)
    await screen.findByText('FREE THE CARPARK (FTP)')

    fireEvent.click(screen.getByRole('button', { name: 'SAVE FTP SETTINGS' }))
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url) === '/api/admin/parking/ftp' &&
            (init as RequestInit)?.method === 'PUT',
        ),
      ).toBe(true),
    )
    const putCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url) === '/api/admin/parking/ftp' && (init as RequestInit)?.method === 'PUT',
    )
    const body = JSON.parse(String((putCall?.[1] as RequestInit).body))
    expect(body).toMatchObject({ venueId: 'v1', contactEmail: 'carpark@venue.nz' })
  })

  it('shows a new kiosk code once', async () => {
    install()
    render(<FtpSettingsClient role="ADMIN" sessionVenueId="v1" />)
    await screen.findByText('FREE THE CARPARK (FTP)')

    fireEvent.click(screen.getByRole('button', { name: 'ROTATE CODE' }))
    expect(await screen.findByText('ABCD2345')).toBeInTheDocument()
    expect(screen.getByText(/SHOWN ONCE/)).toBeInTheDocument()
  })

  it('keeps the 4 hour tab disabled until a URL exists', async () => {
    install()
    render(<FtpSettingsClient role="ADMIN" sessionVenueId="v1" />)
    await screen.findByText('FREE THE CARPARK (FTP)')
    expect(
      screen.getByRole('checkbox', { name: /ENABLE THE 4 HOUR TAB/i }),
    ).toBeDisabled()
  })
})
