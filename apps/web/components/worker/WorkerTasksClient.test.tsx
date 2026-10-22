import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, fireEvent, waitFor, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import { WorkerTasksClient } from '@/components/worker/WorkerTasksClient'

const BASE_TASK = {
  id: 't1', title: 'WIPE BENCHES', description: null, completionType: 'TICK',
  departmentName: 'KITCHEN', sectionName: null, isCompleted: false,
  isDone: false, isSettled: false, outcome: null,
  allowedOutcomes: ['DONE', 'PARTIAL', 'NOT_REQUIRED', 'DID_NOT_COMPLETE'],
  requireOutcomeReason: false, inProgress: null,
  assigneeName: null, guide: null, isOneOff: false, dueDate: null,
  rolloverEnabled: false, rolledOverFrom: null,
  readingUnit: null, readingMin: null, readingMax: null, criticalMin: null, criticalMax: null,
  linkedItemName: null, completedByName: null, completion: null,
}

function mockTasks(tasks: unknown[], checklists: unknown[] = []) {
  const fetchMock = vi.mocked(global.fetch)
  fetchMock.mockImplementation(async (url: string | URL | Request) => {
    const u = String(url)
    if (u === '/api/worker/tasks') {
      return { ok: true, json: async () => ({ tasks, checklists, firstName: 'BAR' }) } as Response
    }
    return { ok: true, json: async () => ({}) } as Response
  })
  return fetchMock
}

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

  it('lets the worker choose NOT REQUIRED and sends the outcome', async () => {
    const fetchMock = mockTasks([BASE_TASK])
    render(<WorkerTasksClient role="STAFF" sessionVenueId="v1" />)
    await waitFor(() => expect(screen.getByText('WIPE BENCHES')).toBeDefined())
    fireEvent.click(screen.getByText('WIPE BENCHES'))

    await waitFor(() => expect(screen.getByText('WHAT HAPPENED?')).toBeDefined())
    expect(screen.getByText('PARTIAL')).toBeDefined()
    expect(screen.getByText('DID NOT COMPLETE')).toBeDefined()

    fireEvent.click(screen.getByText('NOT REQUIRED'))
    fireEvent.click(screen.getByText('MARK NOT REQUIRED'))

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([url]) => String(url).includes('/complete'))
      expect(post).toBeDefined()
      const body = JSON.parse(String((post![1] as RequestInit).body))
      expect(body.outcome).toBe('NOT_REQUIRED')
    })
  })

  it('requires a reason for a non-done outcome when configured', async () => {
    const fetchMock = mockTasks([
      { ...BASE_TASK, allowedOutcomes: ['DONE', 'DID_NOT_COMPLETE'], requireOutcomeReason: true },
    ])
    render(<WorkerTasksClient role="STAFF" sessionVenueId="v1" />)
    await waitFor(() => expect(screen.getByText('WIPE BENCHES')).toBeDefined())
    fireEvent.click(screen.getByText('WIPE BENCHES'))

    await waitFor(() => expect(screen.getByText('WHAT HAPPENED?')).toBeDefined())
    fireEvent.click(screen.getByText('DID NOT COMPLETE'))
    fireEvent.click(screen.getByText('MARK DID NOT COMPLETE'))

    await waitFor(() => expect(screen.getByText('A REASON IS REQUIRED')).toBeDefined())
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/complete'))).toBe(false)
  })

  it('shows an in-progress task on the list', async () => {
    mockTasks([
      {
        ...BASE_TASK,
        inProgress: { note: 'HALF DONE', byName: 'SAM', since: '2026-10-21T08:00:00.000Z' },
      },
    ])
    render(<WorkerTasksClient role="STAFF" sessionVenueId="v1" />)
    await waitFor(() => expect(screen.getByText('WIPE BENCHES')).toBeDefined())
    expect(screen.getByText('IN PROGRESS · SAM')).toBeDefined()
    expect(screen.getByText('HALF DONE')).toBeDefined()
  })

  it('shows settled non-done outcomes separately from completed work', async () => {
    mockTasks([
      { ...BASE_TASK, id: 't1', title: 'STILL TO DO' },
      {
        ...BASE_TASK, id: 't2', title: 'WAS NOT NEEDED', isCompleted: true, isSettled: true,
        outcome: 'NOT_REQUIRED', completion: { id: 'c2', note: null, photoUrl: null, completedAt: new Date(), outcome: 'NOT_REQUIRED' },
      },
    ])
    render(<WorkerTasksClient role="STAFF" sessionVenueId="v1" />)
    await waitFor(() => expect(screen.getByText('HANDLED — NOT DONE')).toBeDefined())
    expect(screen.getByText('WAS NOT NEEDED')).toBeDefined()
    expect(screen.getByText('NOT REQUIRED')).toBeDefined()
  })
})
