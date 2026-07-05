import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import { WorkerTasksClient } from '@/components/worker/WorkerTasksClient'

describe('WorkerTasksClient', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ tasks: [], checklists: [], firstName: 'BAR' }),
    } as Response)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders without crashing', () => {
    const { container } = render(<WorkerTasksClient />)
    expect(container).toBeTruthy()
  })
})
