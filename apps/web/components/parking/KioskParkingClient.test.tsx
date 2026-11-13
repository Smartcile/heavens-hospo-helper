import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  venueName: 'THE VENUE',
  carparkName: 'THE LANDING CARPARK',
  durationMinutes: 90,
  timezone: 'Pacific/Auckland',
  resetSeconds: 60,
  fourHourName: '4 HOUR CAR PARK',
  fourHourEnabled: false,
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
})

describe('KioskParkingClient', () => {
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

  it('opens the staff sheet', async () => {
    fetchMock.mockResolvedValue(jsonResponse(SUCCESS))
    render(<KioskParkingClient config={CONFIG} />)

    fireEvent.click(screen.getByRole('button', { name: 'SPEAK WITH STAFF' }))
    expect(
      screen.getByText('PLEASE SPEAK WITH A STAFF MEMBER TO PAY OR EXTEND.'),
    ).toBeInTheDocument()
  })

  it('disables the 4 hour tab until it is configured', () => {
    fetchMock.mockResolvedValue(jsonResponse(SUCCESS))
    render(<KioskParkingClient config={CONFIG} />)
    expect(screen.getByRole('button', { name: /4 HOUR CAR PARK — SOON/i })).toBeDisabled()
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
