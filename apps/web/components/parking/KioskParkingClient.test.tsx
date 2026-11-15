import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { KioskParkingClient, type KioskParkingConfig } from './KioskParkingClient'

const fetchMock = vi.fn()

function jsonResponse(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response)
}

const CONFIG: KioskParkingConfig = {
  venueId: 'v1',
  requireCode: false,
  venueName: 'THE VENUE',
  guestEnabled: true,
  carparkName: 'THE LANDING CARPARK',
  durationMinutes: 90,
  timezone: 'Pacific/Auckland',
  resetSeconds: 60,
  fourHourTypes: [],
}

const FOUR_CONFIG: KioskParkingConfig = {
  ...CONFIG,
  guestEnabled: false,
  fourHourTypes: [
    {
      id: 'type-1',
      name: 'RAYC',
      windowLabel: '4 HOURS',
      durationMinutes: 240,
      health: { ok: true, stale: false, message: 'OK' },
    },
  ],
}

const SUCCESS = {
  status: 'CONFIRMED',
  ok: true,
  message: 'PARKING REGISTERED',
  plate: 'QUZ69',
  endTime: '00:17',
  expiresAt: '2026-11-12T11:17:56.000Z',
  existingExpiry: null,
  alreadyActive: false,
  qrDataUrl: 'data:image/png;base64,QR',
  linkUrl: 'https://scan2pay.nz/Parking/SelectTime?LicensePlate=QUZ69',
  carparkName: 'THE LANDING CARPARK',
  durationMinutes: 90,
  timezone: 'Pacific/Auckland',
}

const CREDENTIAL = {
  kind: 'MEMBER',
  type: { id: 'type-1', name: 'RAYC', windowLabel: '4 HOURS', durationMinutes: 240 },
  member: {
    id: 'member-1',
    firstName: 'TEST',
    lastName: 'MEMBER',
    plates: [{ id: 'plate-1', plate: 'ABC123', isDefault: true }],
  },
  token: 'credential-token',
}

const FOUR_SUCCESS = {
  claimId: 'claim-1',
  status: 'CONFIRMED',
  ok: true,
  message: 'PARKING CONFIRMED',
  plate: 'ABC123',
  typeName: 'RAYC',
  memberName: 'TEST MEMBER',
  validFrom: '15/11/2026 8:00 PM',
  validUntil: '16/11/2026 12:00 AM',
  locations: ['The Landing Carpark'],
  fallbackUrl: null,
  manualToken: null,
}

function typePlate(plate: string) {
  for (const char of plate) {
    fireEvent.click(screen.getByRole('button', { name: char }))
  }
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('KioskParkingClient — 90 minute', () => {
  it('registers a plate and shows the end time and QR code', async () => {
    fetchMock.mockResolvedValue(jsonResponse(SUCCESS))
    render(<KioskParkingClient config={CONFIG} />)

    typePlate('QUZ69')
    fireEvent.click(screen.getByRole('button', { name: /REGISTER 90 MINUTES/i }))

    expect(await screen.findByText('PARKING REGISTERED')).toBeInTheDocument()
    expect(screen.getByText('QUZ69')).toBeInTheDocument()
    expect(screen.getByText('00:17')).toBeInTheDocument()
    expect(
      screen.getByAltText('QR code to open this parking session on your phone'),
    ).toBeInTheDocument()

    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body))
    expect(body.licensePlate).toBe('QUZ69')
    expect(body.venueId).toBe('v1')
  })

  it('starts again and wipes the plate', async () => {
    fetchMock.mockResolvedValue(jsonResponse(SUCCESS))
    render(<KioskParkingClient config={CONFIG} />)

    typePlate('QUZ69')
    fireEvent.click(screen.getByRole('button', { name: /REGISTER 90 MINUTES/i }))
    await screen.findByText('PARKING REGISTERED')

    fireEvent.click(screen.getByRole('button', { name: 'START AGAIN' }))
    expect(screen.getByText('ENTER YOUR NUMBER PLATE')).toBeInTheDocument()
    expect(screen.queryByText('QUZ69')).toBeNull()
  })

  it('shows the already-registered state', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        ...SUCCESS,
        status: 'ALREADY_ACTIVE',
        alreadyActive: true,
        existingExpiry: '2026-11-12T23:00:00',
      }),
    )
    render(<KioskParkingClient config={CONFIG} />)

    typePlate('QUZ69')
    fireEvent.click(screen.getByRole('button', { name: /REGISTER 90 MINUTES/i }))

    expect(await screen.findByText('ALREADY REGISTERED')).toBeInTheDocument()
    expect(screen.getByText(/ALREADY HAS A SESSION TODAY/)).toBeInTheDocument()
  })

  it('clears itself when the visible timer ends', async () => {
    fetchMock.mockResolvedValue(jsonResponse(SUCCESS))
    render(<KioskParkingClient config={{ ...CONFIG, resetSeconds: 1 }} />)

    typePlate('QUZ69')
    fireEvent.click(screen.getByRole('button', { name: /REGISTER 90 MINUTES/i }))
    await screen.findByText('PARKING REGISTERED')

    await waitFor(
      () => expect(screen.getByText('ENTER YOUR NUMBER PLATE')).toBeInTheDocument(),
      { timeout: 3000 },
    )
    expect(screen.queryByText('QUZ69')).toBeNull()
  })
})

describe('KioskParkingClient — silent staff exit', () => {
  it('exits after a five second hold and ignores a short tap', () => {
    const original = window.location
    const realHref = window.location.href
    // Same origin as the jsdom document so the kiosk's history guard can run.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: realHref },
    })
    try {
      vi.useFakeTimers()
      render(<KioskParkingClient config={CONFIG} />)

      const button = screen.getByRole('button', {
        name: 'SPEAK WITH STAFF IF YOU NEED HELP',
      })
      fireEvent.pointerDown(button)
      fireEvent.pointerUp(button)
      act(() => {
        vi.advanceTimersByTime(5_000)
      })
      expect(window.location.href).toBe(realHref)

      fireEvent.pointerDown(button)
      act(() => {
        vi.advanceTimersByTime(5_000)
      })
      expect(window.location.href).toBe('/')
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original })
    }
  })
})

describe('KioskParkingClient — 4 hour', () => {
  it('takes a membership number, selects a saved plate and confirms', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(CREDENTIAL))
      .mockResolvedValueOnce(jsonResponse(FOUR_SUCCESS))
    render(<KioskParkingClient config={FOUR_CONFIG} />)

    await screen.findByText('ENTER YOUR MEMBERSHIP NUMBER')
    for (const digit of ['1', '2', '3', '4']) {
      fireEvent.click(screen.getByRole('button', { name: digit }))
    }
    fireEvent.click(screen.getByRole('button', { name: 'CONTINUE' }))

    expect(await screen.findByText(/HELLO TEST/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /ABC123/ }))
    fireEvent.click(screen.getByRole('button', { name: 'CONFIRM PARKING' }))

    expect(await screen.findByText('PARKING CONFIRMED')).toBeInTheDocument()
    expect(screen.getByText('ABC123')).toBeInTheDocument()
    expect(screen.getByText('16/11/2026 12:00 AM')).toBeInTheDocument()
    expect(screen.getByText(/The Landing Carpark/)).toBeInTheDocument()

    const credentialBody = JSON.parse(String(fetchMock.mock.calls[0][1].body))
    expect(credentialBody).toMatchObject({
      venueId: 'v1',
      typeId: 'type-1',
      credential: '1234',
    })
    const claimBody = JSON.parse(String(fetchMock.mock.calls[1][1].body))
    expect(claimBody).toEqual({ token: 'credential-token', plate: 'ABC123' })
  })

  it('shows the vendor-page fallback when the automatic start is blocked', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(CREDENTIAL))
      .mockResolvedValueOnce(
        jsonResponse({
          claimId: 'claim-2',
          status: 'CAPTCHA_BLOCKED',
          ok: false,
          message: 'THE PARKING SITE BLOCKED THE AUTOMATIC START',
          plate: 'ABC123',
          typeName: 'RAYC',
          validFrom: null,
          validUntil: null,
          locations: [],
          fallbackUrl: 'https://vpermit.com.au/tld/ClaimableEvents/Claim?code=12345',
          manualToken: 'manual-token',
        }),
      )
    render(<KioskParkingClient config={FOUR_CONFIG} />)

    await screen.findByText('ENTER YOUR MEMBERSHIP NUMBER')
    for (const digit of ['1', '2', '3', '4']) {
      fireEvent.click(screen.getByRole('button', { name: digit }))
    }
    fireEvent.click(screen.getByRole('button', { name: 'CONTINUE' }))
    await screen.findByText(/HELLO TEST/)
    fireEvent.click(screen.getByRole('button', { name: /ABC123/ }))
    fireEvent.click(screen.getByRole('button', { name: 'CONFIRM PARKING' }))

    expect(await screen.findByText('COULD NOT START')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'OPEN PARKING PAGE' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'TRY AGAIN' })).toBeInTheDocument()
  })
})
