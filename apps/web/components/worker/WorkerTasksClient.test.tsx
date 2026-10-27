import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, fireEvent, waitFor, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import { WorkerTasksClient } from '@/components/worker/WorkerTasksClient'
import type { WorkerTaskAccess } from '@/lib/worker-task-access'

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

const FULL_TASK = {
  ...BASE_TASK, venueId: 'v1', departmentId: 'd1', sectionId: null,
  scheduleType: 'DAILY', scheduleDays: [], customCron: null, intervalMonths: 1,
  monthlyOption: null, monthlyDay: null, isActive: true,
  allowedOutcomes: ['DONE', 'PARTIAL', 'NOT_REQUIRED', 'DID_NOT_COMPLETE'],
  overrideOutcomes: false, requireOutcomeReason: false,
  department: { id: 'd1', name: 'KITCHEN' }, section: null,
  requiredTraining: [], taskGuides: [],
}

const CHECKLIST_FULL = {
  id: 'c1', name: 'OPENING', description: null, venueId: 'v1',
  departmentId: null, sectionId: null, appearFromTime: '00:00', activatedOn: null,
  allowedOutcomes: [], requireOutcomeReason: false,
  tasks: [{ id: 't1', title: 'WIPE BENCHES', isActive: true, version: 1 }],
}

const CHECKLIST_SUMMARY = {
  id: 'c1', name: 'OPENING', appearFromTime: null, activatedToday: false, taskIds: ['t1'],
}

const FULL_ACCESS: WorkerTaskAccess = {
  canCreateTask: true, canEditTask: true, canDeleteTask: true,
  canCreateList: true, canEditList: true, canDeleteList: true, canAuthor: true,
}

const EDIT_ONLY_ACCESS: WorkerTaskAccess = {
  canCreateTask: false, canEditTask: true, canDeleteTask: false,
  canCreateList: true, canEditList: true, canDeleteList: false, canAuthor: true,
}

function json(data: unknown): Response {
  return { ok: true, status: 200, json: async () => data } as unknown as Response
}

function mockTasks(tasks: unknown[], checklists: unknown[] = []) {
  const fetchMock = vi.mocked(global.fetch)
  fetchMock.mockImplementation(async (url: string | URL | Request) => {
    const u = String(url)
    if (u === '/api/worker/tasks') {
      return json({ tasks, checklists, firstName: 'BAR' })
    }
    return json({})
  })
  return fetchMock
}

/**
 * Stateful edit-mode API: POSTing a task appends it to the edit-task list so
 * the checklist picker can render it without a second fixture.
 */
function mockEditApi(opts: {
  floorTasks?: unknown[]
  editTasks?: unknown[]
  checklists?: unknown[]
  guides?: unknown[]
  access?: WorkerTaskAccess
} = {}) {
  const floorTasks = opts.floorTasks ?? [BASE_TASK]
  const editTasks = [...(opts.editTasks ?? [FULL_TASK])]
  const checklists = opts.checklists ?? [CHECKLIST_SUMMARY]
  const guides = opts.guides ?? [{ id: 'g1', title: 'SAFE FOOD', venueId: 'v1', isTracked: true, description: null }]
  const access = opts.access ?? FULL_ACCESS

  const fetchMock = vi.mocked(global.fetch)
  fetchMock.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    const method = init?.method ?? 'GET'
    if (u === '/api/worker/tasks' && method === 'GET') {
      return json({ tasks: floorTasks, checklists, firstName: 'BAR', access })
    }
    if (u === '/api/worker/tasks' && method === 'POST') {
      const body = JSON.parse(String(init?.body))
      const created = { ...FULL_TASK, id: 'new1', title: body.title, ...body }
      editTasks.push(created)
      return json(created)
    }
    if (u.startsWith('/api/worker/tasks/') && method === 'PUT') {
      return json({ ...FULL_TASK, ...JSON.parse(String(init?.body)) })
    }
    if (u === '/api/worker/tasks?edit=1') return json(editTasks)
    if (u === '/api/worker/departments') return json([{ id: 'd1', name: 'KITCHEN', venueId: 'v1', colour: null }])
    if (u === '/api/worker/sections') return json([])
    if (u === '/api/worker/guides?edit=1') return json(guides)
    if (u === '/api/worker/checklists') return json([CHECKLIST_FULL])
    if (u.startsWith('/api/worker/checklists/') && u.endsWith('/activate')) {
      return json({ ...CHECKLIST_FULL, activatedOn: new Date().toISOString() })
    }
    return json({})
  })
  return fetchMock
}

describe('WorkerTasksClient', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(global, 'fetch').mockResolvedValue(
      json({ tasks: [], checklists: [], firstName: 'BAR' }),
    )
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
    const { findByText, getByText, queryByText } = render(<WorkerTasksClient role="ADMIN" sessionVenueId="v1" />)
    const toggle = await findByText('EDIT MODE')
    fireEvent.click(toggle)

    await waitFor(() => {
      expect(getByText('EDIT MODE ACTIVE // ARMED')).toBeDefined()
      expect(getByText('+ NEW TASK')).toBeDefined()
    })
    // ADMIN fallback has every authoring flag.
    expect(queryByText('+ NEW CHECKLIST')).toBeDefined()
  })

  it('shows EDIT MODE to a granted STAFF member and only permitted actions', async () => {
    mockEditApi({ access: EDIT_ONLY_ACCESS })
    render(<WorkerTasksClient role="STAFF" sessionVenueId="v1" access={EDIT_ONLY_ACCESS} />)

    await waitFor(() => expect(screen.getByText('WIPE BENCHES')).toBeDefined())
    fireEvent.click(screen.getByText('EDIT MODE'))
    await waitFor(() => expect(screen.getByText('EDIT MODE ACTIVE // ARMED')).toBeDefined())

    // edit + list grants, no task create / delete
    expect(screen.getByText('+ NEW CHECKLIST')).toBeDefined()
    expect(screen.queryByText('+ NEW TASK')).toBeNull()
    expect(screen.queryByText('DEL')).toBeNull()
  })

  it('does not show EDIT MODE to STAFF with no grants even if the API says so', async () => {
    mockEditApi({ access: { ...FULL_ACCESS, canAuthor: false } })
    render(<WorkerTasksClient role="STAFF" sessionVenueId="v1" />)
    await waitFor(() => expect(screen.getByText('WIPE BENCHES')).toBeDefined())
    expect(screen.queryByText('EDIT MODE')).toBeNull()
  })

  it('adds a new task created from the list and keeps the list open', async () => {
    const fetchMock = mockEditApi()
    render(<WorkerTasksClient role="STAFF" sessionVenueId="v1" access={FULL_ACCESS} />)

    await waitFor(() => expect(screen.getByText('WIPE BENCHES')).toBeDefined())
    fireEvent.click(screen.getByText('EDIT MODE'))
    await waitFor(() => expect(screen.getByLabelText('EDIT CHECKLIST OPENING')).toBeDefined())
    fireEvent.click(screen.getByLabelText('EDIT CHECKLIST OPENING'))

    await waitFor(() => expect(screen.getByText('EDIT CHECKLIST')).toBeDefined())
    fireEvent.click(screen.getByTestId('checklist-create-task'))

    await waitFor(() => expect(screen.getByText('NEW TASK')).toBeDefined())
    fireEvent.change(screen.getByPlaceholderText('WIPE DOWN ALL BAR SURFACES'), {
      target: { value: 'NEW LIST JOB' },
    })
    // Competency link uses the same TaskGuide-backed picker as admin.
    fireEvent.focus(screen.getByPlaceholderText('Search guides...'))
    await waitFor(() => expect(screen.getByText('SAFE FOOD')).toBeDefined())
    fireEvent.click(screen.getByText('SAFE FOOD'))

    fireEvent.click(screen.getByTestId('worker-task-save'))

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([url, init]) => String(url) === '/api/worker/tasks' && init?.method === 'POST',
      )
      expect(post).toBeDefined()
      const body = JSON.parse(String((post![1] as RequestInit).body))
      expect(body.title).toBe('NEW LIST JOB')
      expect(body.competencyGuideIds).toEqual(['g1'])
      expect('requiredTrainingIds' in body).toBe(false)
    })

    // The list modal never closed, and the new task is in the selection.
    await waitFor(() => expect(screen.getByText('EDIT CHECKLIST')).toBeDefined())
    await waitFor(() => expect(screen.getByText(/NEW LIST JOB/)).toBeDefined())
    expect(screen.queryByText('NEW TASK')).toBeNull()
  })

  it('toggles a task ON/OFF through the worker PUT', async () => {
    const fetchMock = mockEditApi()
    render(<WorkerTasksClient role="STAFF" sessionVenueId="v1" access={FULL_ACCESS} />)

    await waitFor(() => expect(screen.getByText('WIPE BENCHES')).toBeDefined())
    fireEvent.click(screen.getByText('EDIT MODE'))
    await waitFor(() => expect(screen.getByText('OFF')).toBeDefined())
    fireEvent.click(screen.getByText('OFF'))

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(
        ([url, init]) => String(url) === '/api/worker/tasks/t1' && init?.method === 'PUT',
      )
      expect(put).toBeDefined()
      expect(JSON.parse(String((put![1] as RequestInit).body))).toEqual({ isActive: false })
    })
  })

  it('activates a timed list from the worker editor', async () => {
    const fetchMock = mockEditApi()
    render(<WorkerTasksClient role="STAFF" sessionVenueId="v1" access={FULL_ACCESS} />)

    await waitFor(() => expect(screen.getByText('WIPE BENCHES')).toBeDefined())
    fireEvent.click(screen.getByText('EDIT MODE'))
    await waitFor(() => expect(screen.getByLabelText('EDIT CHECKLIST OPENING')).toBeDefined())
    fireEvent.click(screen.getByLabelText('EDIT CHECKLIST OPENING'))

    await waitFor(() => expect(screen.getByText('ACTIVATE NOW')).toBeDefined())
    fireEvent.click(screen.getByText('ACTIVATE NOW'))

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([url, init]) => String(url) === '/api/worker/checklists/c1/activate' && init?.method === 'POST',
      )
      expect(post).toBeDefined()
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
    vi.spyOn(global, 'fetch').mockImplementation(async () =>
      json({
        tasks: [task],
        checklists: [{ id: 'c1', name: 'CLOSING LIST', appearFromTime: '23:59', activatedToday: activated, taskIds: ['t1'] }],
        firstName: 'BAR',
      }),
    )

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
