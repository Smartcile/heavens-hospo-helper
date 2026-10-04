import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, fireEvent, waitFor, screen } from '@testing-library/react'

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

  it('hides a timed list until an admin activates it for today', async () => {
    const task = {
      id: 't1', title: 'WIPE BENCHES', description: null, completionType: 'TICK',
      departmentName: 'KITCHEN', sectionName: null, isCompleted: false,
      assigneeName: null, guide: null, isOneOff: false, dueDate: null,
      rolloverEnabled: false, rolledOverFrom: null,
      readingUnit: null, readingMin: null, readingMax: null, criticalMin: null, criticalMax: null,
    }
    let activated = false
    vi.spyOn(global, 'fetch').mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        tasks: [task],
        checklists: [{ id: 'c1', name: 'CLOSING LIST', appearFromTime: '23:59', activatedToday: activated, taskIds: ['t1'] }],
        firstName: 'BAR',
      }),
    } as Response))

    const first = render(<WorkerTasksClient role="STAFF" sessionVenueId="v1" />)
    await waitFor(() => expect(screen.getByText('OPENS LATER')).toBeDefined())
    expect(screen.queryByText('WIPE BENCHES')).toBeNull()
    first.unmount()

    activated = true
    render(<WorkerTasksClient role="STAFF" sessionVenueId="v1" />)
    await waitFor(() => expect(screen.getByText('WIPE BENCHES')).toBeDefined())
  })
})
