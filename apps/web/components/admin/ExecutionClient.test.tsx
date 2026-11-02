import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  params: new URLSearchParams(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => mocks.params,
}))

import { ExecutionClient } from '@/components/admin/ExecutionClient'

const props = { role: 'ADMIN', sessionVenueId: 'v-home' }

describe('ExecutionClient', () => {
  beforeEach(() => {
    mocks.push.mockClear()
    mocks.params = new URLSearchParams()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(global, 'fetch').mockImplementation(async () => {
      return { ok: true, json: async () => [] } as Response
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the 3 tab labels', () => {
    render(<ExecutionClient {...props} />)
    for (const label of ['TASKS', 'REVIEW', 'FOLLOW-UPS']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
  })

  it('defaults to the TASKS tab', async () => {
    render(<ExecutionClient {...props} />)
    expect(await screen.findByText('TASKS & CHECKLISTS')).toBeTruthy()
  })

  it('switching tabs pushes the execution URL', async () => {
    render(<ExecutionClient {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'REVIEW' }))
    expect(mocks.push).toHaveBeenCalledWith('/admin/execution?tab=review', { scroll: false })
  })

  it('mounts the REVIEW tab from the URL', async () => {
    mocks.params = new URLSearchParams('tab=review')
    render(<ExecutionClient {...props} />)
    expect(await screen.findByText('END-OF-DAY REVIEW')).toBeTruthy()
  })

  it('mounts the FOLLOW-UPS tab from the URL', async () => {
    mocks.params = new URLSearchParams('tab=followups')
    render(<ExecutionClient {...props} />)
    expect((await screen.findAllByText('FOLLOW-UPS')).length).toBeGreaterThan(0)
  })
})
