import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'

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
    const { container } = render(<WorkerTasksClient role={null} sessionVenueId={null} />)
    expect(container).toBeTruthy()
  })

  it('does not show edit mode button for STAFF role', async () => {
    const { queryByText } = render(<WorkerTasksClient role="STAFF" sessionVenueId="v1" />)
    await waitFor(() => {
      expect(queryByText('EDIT MODE')).toBeNull()
    })
  })

  it('shows edit mode button for MANAGER role', async () => {
    const { findByText } = render(<WorkerTasksClient role="MANAGER" sessionVenueId="v1" />)
    const btn = await findByText('EDIT MODE')
    expect(btn).toBeDefined()
  })

  it('toggling edit mode shows ARMED banner and action buttons', async () => {
    const { findByText, getByText } = render(<WorkerTasksClient role="ADMIN" sessionVenueId="v1" />)
    const toggle = await findByText('EDIT MODE')
    fireEvent.click(toggle)

    await waitFor(() => {
      expect(getByText('MANAGER EDIT MODE ACTIVE // ARMED')).toBeDefined()
      expect(getByText('+ NEW TASK')).toBeDefined()
    })
  })
})
