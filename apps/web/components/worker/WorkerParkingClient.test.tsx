import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { WorkerParkingClient } from './WorkerParkingClient'

const fetchMock = vi.fn()

function jsonResponse(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response)
}

const BASE_DATA = {
  enabled: true,
  config: { carparkId: 19, carparkName: 'The Landing Carpark', durationMinutes: 90 },
  health: { ok: true, stale: false, message: 'FORM READY' },
  timezone: 'Pacific/Auckland',
  registrations: [],
}

const REGISTRATION = {
  id: 'r1',
  licensePlate: 'QUZ69',
  status: 'CONFIRMED',
  startsAt: '2026-11-12T09:47:56.000Z',
  expiresAt: '2026-11-12T11:17:56.000Z',
  durationMinutes: 90,
  confirmationRef: '12345',
  createdAt: '2026-11-12T09:47:56.000Z',
  staff: null,
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('WorkerParkingClient', () => {
  it('shows the disabled state when the venue has not enabled parking', async () => {
    fetchMock.mockImplementation(() => jsonResponse({ enabled: false }))
    render(<WorkerParkingClient />)
    expect(await screen.findByText(/NOT ENABLED FOR THIS VENUE/i)).toBeInTheDocument()
  })

  it('shows a service warning when the health check has failed', async () => {
    fetchMock.mockImplementation(() =>
      jsonResponse({ ...BASE_DATA, health: { ok: false, stale: false, message: 'HTTP 502' } }),
    )
    render(<WorkerParkingClient />)
    expect(await screen.findByText('SERVICE WARNING')).toBeInTheDocument()
    expect(screen.getByText('HTTP 502')).toBeInTheDocument()
  })

  it('posts an uppercase plate and shows the confirmed result', async () => {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return jsonResponse({
          result: { status: 'CONFIRMED', message: 'PARKING REGISTERED' },
          registration: REGISTRATION,
          extendUrl: 'https://scan2pay.nz/Parking/SelectTime?LicensePlate=QUZ69',
          timezone: 'Pacific/Auckland',
        })
      }
      return jsonResponse(BASE_DATA)
    })

    render(<WorkerParkingClient />)
    const plate = await screen.findByLabelText(/NUMBER PLATE/i)
    fireEvent.change(plate, { target: { value: 'quz69' } })
    fireEvent.click(screen.getByRole('button', { name: /REGISTER 90 MINUTES/i }))

    expect(await screen.findByText('PARKING REGISTERED')).toBeInTheDocument()
    expect(screen.getByText('QUZ69')).toBeInTheDocument()
    expect(screen.getByText(/REF 12345/)).toBeInTheDocument()

    const postCall = fetchMock.mock.calls.find((call) => (call[1] as RequestInit)?.method === 'POST')
    expect(postCall).toBeTruthy()
    const body = JSON.parse(String((postCall?.[1] as RequestInit).body))
    expect(body.licensePlate).toBe('QUZ69')
    expect(body.arrivedAt).toBeTruthy()
  })

  it('shows the existing registration and extend link on 409', async () => {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return jsonResponse(
          {
            error: 'THIS PLATE IS ALREADY REGISTERED TODAY',
            registration: REGISTRATION,
            extendUrl: 'https://scan2pay.nz/Parking/SelectTime?LicensePlate=QUZ69',
            timezone: 'Pacific/Auckland',
          },
          409,
        )
      }
      return jsonResponse(BASE_DATA)
    })

    render(<WorkerParkingClient />)
    fireEvent.change(await screen.findByLabelText(/NUMBER PLATE/i), { target: { value: 'QUZ69' } })
    fireEvent.click(screen.getByRole('button', { name: /REGISTER 90 MINUTES/i }))

    expect(await screen.findByText('ALREADY REGISTERED TODAY')).toBeInTheDocument()
    const extend = screen.getByText(/EXTEND ON SCAN2PAY/i)
    expect(extend).toHaveAttribute('href', 'https://scan2pay.nz/Parking/SelectTime?LicensePlate=QUZ69')
  })

  it('adjusts the arrival time with the quick buttons', async () => {
    fetchMock.mockImplementation(() => jsonResponse(BASE_DATA))
    render(<WorkerParkingClient />)

    const input = (await screen.findByLabelText(/ARRIVAL TIME/i)) as HTMLInputElement
    const before = new Date(input.value).getTime()

    fireEvent.click(screen.getByRole('button', { name: '-15' }))
    await waitFor(() => {
      const after = new Date((screen.getByLabelText(/ARRIVAL TIME/i) as HTMLInputElement).value).getTime()
      expect(before - after).toBe(15 * 60 * 1000)
    })
  })

  it('shows an inline error when the API rejects the registration', async () => {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return jsonResponse({ error: 'ARRIVAL TIME IS IN THE FUTURE' }, 422)
      }
      return jsonResponse(BASE_DATA)
    })

    render(<WorkerParkingClient />)
    fireEvent.change(await screen.findByLabelText(/NUMBER PLATE/i), { target: { value: 'QUZ69' } })
    fireEvent.click(screen.getByRole('button', { name: /REGISTER 90 MINUTES/i }))

    expect(await screen.findByText('ARRIVAL TIME IS IN THE FUTURE')).toBeInTheDocument()
  })
})
