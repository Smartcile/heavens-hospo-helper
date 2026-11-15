import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { buildParkingMetrics } from '@/lib/parking-metrics'
import { ParkingMetricsClient } from './ParkingMetricsClient'

const METRICS = buildParkingMetrics({
  timezone: 'Pacific/Auckland',
  kiosk90: [{ createdAt: '2026-11-12T10:00:00Z', status: 'CONFIRMED' }],
  worker90: [],
  claims: [],
  staff: {
    activePlates: 2,
    entered: 1,
    awaitingEntry: 1,
    pending: 0,
    approved: 1,
    rejected: 0,
  },
  members: 3,
  memberPlates: 4,
  health: { ok: 1, failed: 0, lastCheckAt: null, lastCheckOk: true, message: 'OK' },
})

const RANGE = { from: null, to: '2026-11-12T10:00:00.000Z', timezone: 'Pacific/Auckland' }

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ metrics: METRICS, range: RANGE }),
  } as Response)
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ParkingMetricsClient', () => {
  it('renders the summary and per-system counts', async () => {
    render(<ParkingMetricsClient />)
    expect(await screen.findByText(/plate entries/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /90 MINUTE/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /4 HOUR/i })).toBeInTheDocument()
    expect(screen.getByText('STAFF CARPARK')).toBeInTheDocument()
    expect(screen.getByText('MEMBERS')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/parking/metrics?range=30d', {
      cache: 'no-store',
    })
  })

  it('refetches when the range changes', async () => {
    render(<ParkingMetricsClient />)
    await screen.findByText(/plate entries/i)
    fireEvent.click(screen.getByRole('button', { name: '7 DAYS' }))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith('/api/admin/parking/metrics?range=7d', {
        cache: 'no-store',
      }),
    )
  })
})
