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

import { TrainingClient } from '@/components/admin/TrainingClient'

const props = { role: 'ADMIN', sessionVenueId: 'v-home' }

describe('TrainingClient', () => {
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

  it('renders the 2 tab labels', () => {
    render(<TrainingClient {...props} />)
    for (const label of ['PLAYBOOK', 'PATHWAYS']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
  })

  it('defaults to the PLAYBOOK tab', async () => {
    render(<TrainingClient {...props} />)
    expect(await screen.findByText('PLAYBOOK GUIDES')).toBeTruthy()
  })

  it('switching tabs pushes the training URL', async () => {
    render(<TrainingClient {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'PATHWAYS' }))
    expect(mocks.push).toHaveBeenCalledWith('/admin/training?tab=pathways', { scroll: false })
  })

  it('mounts the PATHWAYS tab from the URL', async () => {
    mocks.params = new URLSearchParams('tab=pathways')
    render(<TrainingClient {...props} />)
    expect((await screen.findAllByText('PATHWAYS')).length).toBeGreaterThan(0)
  })
})
