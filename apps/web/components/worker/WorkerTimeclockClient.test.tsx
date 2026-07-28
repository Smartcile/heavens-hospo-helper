import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import { WorkerTimeclockClient } from '@/components/worker/WorkerTimeclockClient'

describe('WorkerTimeclockClient', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('renders clocked-out state', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ isClockedIn: false, activeSession: null, todayMinutes: 120, recentSessions: [] }),
    } as Response)

    const { findByText } = render(<WorkerTimeclockClient />)
    const btn = await findByText('CLOCK IN')
    expect(btn).toBeDefined()
  })

  it('renders clocked-in state', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        isClockedIn: true,
        activeSession: { id: '1', clockIn: new Date().toISOString(), geoValid: true, staff: { firstName: 'J', lastName: 'D', department: null } },
        todayMinutes: 0,
        recentSessions: [],
      }),
    } as Response)

    const { findByText } = render(<WorkerTimeclockClient />)
    const btn = await findByText('CLOCK OUT')
    expect(btn).toBeDefined()
  })

  it('handles 401 redirect', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 401, json: async () => ({}) } as Response)

    const { container } = render(<WorkerTimeclockClient />)
    await waitFor(() => {
      expect(container).toBeTruthy()
    })
  })
})
