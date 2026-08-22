import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

import { WorkerGuidesClient } from '@/components/worker/WorkerGuidesClient'

const tracked = {
  id: 'g1',
  title: 'FOOD SAFETY BASICS',
  description: null,
  category: 'FOOD SAFETY',
  requiresSignOff: false,
  isOnboarding: true,
  isTracked: true,
  source: 'ONBOARDING',
  completed: false,
  department: null,
  steps: [
    {
      id: 's1', order: 0, heading: 'HYGIENE', content: 'Wash your hands.',
      imageUrl: null, videoUrl: null,
      links: [{ id: 'l1', kind: 'TASK', targetId: 't1', qty: null, note: null, target: { label: 'CHECK FRIDGE TEMPERATURES', missing: false } }],
    },
  ],
}

const reference = {
  id: 'g2',
  title: 'HOW TO READ THE FRIDGE TEMP LOG',
  description: 'Reference only.',
  category: 'BOH',
  requiresSignOff: false,
  isOnboarding: false,
  isTracked: false,
  source: 'DEPARTMENT',
  completed: false,
  department: { id: 'd1', name: 'BACK OF HOUSE' },
  steps: [
    { id: 's2', order: 0, heading: null, content: 'Find the clipboard.', imageUrl: null, videoUrl: null, links: [] },
  ],
}

function mockFetch() {
  return vi.fn((url: string) => {
    const json = (data: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) })
    if (String(url).startsWith('/api/worker/guides')) {
      return json({ firstName: 'ALEX', items: [tracked], reference: [reference] })
    }
    if (String(url).startsWith('/api/worker/pathway')) {
      return json({ pathway: null })
    }
    return json(null)
  }) as unknown as typeof fetch
}

describe('WorkerGuidesClient', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('shows tracked guides and untracked reference guides in the bible', async () => {
    globalThis.fetch = mockFetch()
    render(<WorkerGuidesClient />)
    await waitFor(() => expect(screen.getByText('FOOD SAFETY BASICS')).toBeTruthy())
    expect(screen.getByText('REFERENCE — READ ANY TIME')).toBeTruthy()
    expect(screen.getByText('HOW TO READ THE FRIDGE TEMP LOG')).toBeTruthy()
  })

  it('renders the task link inside a tracked guide step', async () => {
    globalThis.fetch = mockFetch()
    render(<WorkerGuidesClient />)
    fireEvent.click(await screen.findByText('FOOD SAFETY BASICS'))
    await waitFor(() => expect(screen.getByText('CHECK FRIDGE TEMPERATURES')).toBeTruthy())
  })

  it('opens a reference guide read-only with no complete button', async () => {
    globalThis.fetch = mockFetch()
    render(<WorkerGuidesClient />)
    fireEvent.click(await screen.findByText('HOW TO READ THE FRIDGE TEMP LOG'))
    await waitFor(() => expect(screen.getByText('REFERENCE — NOT TRACKED')).toBeTruthy())
    expect(screen.getByText('REFERENCE GUIDE — READ ONLY')).toBeTruthy()
    expect(screen.queryByText('MARK COMPLETE')).toBeNull()
  })

  it('offers MARK COMPLETE for a tracked guide', async () => {
    globalThis.fetch = mockFetch()
    render(<WorkerGuidesClient />)
    fireEvent.click(await screen.findByText('FOOD SAFETY BASICS'))
    await waitFor(() => expect(screen.getByText('MARK COMPLETE')).toBeTruthy())
  })
})
