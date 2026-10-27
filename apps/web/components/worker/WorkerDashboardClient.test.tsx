import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, waitFor, screen, act } from '@testing-library/react'

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: replaceMock }),
}))

import { WorkerDashboardClient } from '@/components/worker/WorkerDashboardClient'

function json(data: unknown): Response {
  return { ok: true, status: 200, json: async () => data } as unknown as Response
}

function mockApi() {
  vi.spyOn(global, 'fetch').mockImplementation(async (url: string | URL | Request) => {
    const u = String(url)
    if (u === '/api/worker/tasks') return json({ tasks: [], firstName: 'ALEX' })
    if (u === '/api/worker/notices') return json({ unackedRequired: 0, items: [] })
    if (u === '/api/worker/calendar') return json({ shifts: [], openShiftCount: 0 })
    if (u === '/api/worker/guides') return json({ items: [] })
    if (u === '/api/worker/pathway') return json({ pathway: null })
    if (u === '/api/worker/stocktake') return json([])
    if (u === '/api/worker/timeclock/status') return json({ isClockedIn: false })
    if (u === '/api/worker/events/access') return json({ allowed: false })
    return json({})
  })
}

describe('WorkerDashboardClient chrome', () => {
  beforeEach(() => {
    replaceMock.mockClear()
    mockApi()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('hides the bottom BACK TO DASHBOARD bar while a full-screen view is open', async () => {
    render(<WorkerDashboardClient role="STAFF" />)

    await waitFor(() => expect(screen.getByText('TASKS')).toBeDefined())
    fireEvent.click(screen.getByText('TASKS'))

    await waitFor(() => expect(screen.getByText(/BACK TO DASHBOARD/)).toBeDefined())

    // The embedded page tells the shell a detail view opened.
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'worker-immersive', immersive: true } }))
    })
    await waitFor(() => expect(screen.queryByText(/BACK TO DASHBOARD/)).toBeNull())

    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'worker-immersive', immersive: false } }))
    })
    await waitFor(() => expect(screen.getByText(/BACK TO DASHBOARD/)).toBeDefined())
  })

  it('keeps browser back inside the worker dashboard (history guard)', async () => {
    const pushState = vi.spyOn(window.history, 'pushState')
    render(<WorkerDashboardClient role="STAFF" />)

    await waitFor(() =>
      expect(pushState).toHaveBeenCalledWith({ workerGuard: true }, '', '/w/dashboard'),
    )

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/w/dashboard'))
    // Re-armed after the pop so the next back is caught too.
    await waitFor(() =>
      expect(pushState.mock.calls.filter(([, , url]) => url === '/w/dashboard').length).toBeGreaterThan(1),
    )
  })
})
