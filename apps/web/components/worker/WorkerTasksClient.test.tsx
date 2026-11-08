import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, fireEvent, waitFor, screen, act } from '@testing-library/react'

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
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
  activatedToday: false,
  allowedOutcomes: [], requireOutcomeReason: false,
  tasks: [{ id: 't1', title: 'WIPE BENCHES', isActive: true, version: 1 }],
}

const CHECKLIST_SUMMARY = {
  id: 'c1', name: 'OPENING', appearFromTime: null, activatedToday: false, taskIds: ['t1'],
}

const EVENT_ONE = {
  id: 'e1', venueId: 'v1', title: 'DINNER',
  startsAt: '2026-10-23T18:00:00.000Z', endsAt: '2026-10-23T22:00:00.000Z',
  date: '2026-10-23', startTime: '18:00', endTime: '22:00', allDay: false,
}

const FULL_ACCESS: WorkerTaskAccess = {
  canCreateTask: true, canEditTask: true, canDeleteTask: true,
  canCreateList: true, canEditList: true, canDeleteList: true, canAuthor: true,
}

const EDIT_ONLY_ACCESS: WorkerTaskAccess = {
  canCreateTask: false, canEditTask: true, canDeleteTask: false,
  canCreateList: true, canEditList: true, canDeleteList: false, canAuthor: true,
}

const NO_ACCESS: WorkerTaskAccess = {
  canCreateTask: false, canEditTask: false, canDeleteTask: false,
  canCreateList: false, canEditList: false, canDeleteList: false, canAuthor: false,
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
  fullChecklists?: unknown[]
  guides?: unknown[]
  access?: WorkerTaskAccess
  activated?: boolean
} = {}) {
  const floorTasks = opts.floorTasks ?? [BASE_TASK]
  const editTasks = [...(opts.editTasks ?? [FULL_TASK])]
  const checklists = opts.checklists ?? [CHECKLIST_SUMMARY]
  const fullChecklists = opts.fullChecklists ?? [CHECKLIST_FULL]
  const guides = opts.guides ?? [{ id: 'g1', title: 'SAFE FOOD', venueId: 'v1', isTracked: true, description: null }]
  const access = opts.access ?? FULL_ACCESS
  // One mutable activation flag is enough for these single-list fixtures; the
  // floor payload and the edit payload both read from it so a toggle sticks.
  let activatedToday = opts.activated ?? false

  const fetchMock = vi.mocked(global.fetch)
  fetchMock.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    const method = init?.method ?? 'GET'
    if (u === '/api/worker/tasks' && method === 'GET') {
      return json({
        tasks: floorTasks,
        checklists: checklists.map((c) => ({ ...(c as object), activatedToday })),
        firstName: 'BAR',
        access,
      })
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
    if (u === '/api/worker/calendar-events') return json([EVENT_ONE])
    if (u === '/api/worker/checklists') {
      return json(fullChecklists.map((c) => ({ ...(c as object), activatedToday })))
    }
    if (u.startsWith('/api/worker/checklists/') && u.endsWith('/activate')) {
      activatedToday = method === 'POST'
      return json({
        ...CHECKLIST_FULL,
        activatedOn: activatedToday ? new Date().toISOString() : null,
        activatedToday,
      })
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
    expect(screen.getByText('NOT OPEN YET TODAY')).toBeDefined()
    fireEvent.click(screen.getByText('ACTIVATE NOW'))

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([url, init]) => String(url) === '/api/worker/checklists/c1/activate' && init?.method === 'POST',
      )
      expect(post).toBeDefined()
    })

    // The server says it is activated for the venue-local day, so the editor
    // must switch to DEACTIVATE from that fact (not a client UTC-day compare).
    await waitFor(() => expect(screen.getByText('DEACTIVATE')).toBeDefined())
    expect(screen.getByText('FORCED OPEN FOR TODAY')).toBeDefined()
    expect(screen.queryByText('ACTIVATE NOW')).toBeNull()
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

  it('shows UNLOCK on a hidden list for a manager and opens it', async () => {
    const fetchMock = mockEditApi({
      checklists: [{ ...CHECKLIST_SUMMARY, appearFromTime: '23:59' }],
    })
    render(<WorkerTasksClient role="MANAGER" sessionVenueId="v1" />)

    await waitFor(() => expect(screen.getByText('OPENS LATER')).toBeDefined())
    expect(screen.queryByText('WIPE BENCHES')).toBeNull()

    fireEvent.click(screen.getByLabelText('UNLOCK CHECKLIST OPENING'))

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([url, init]) => String(url) === '/api/worker/checklists/c1/activate' && init?.method === 'POST',
      )
      expect(post).toBeDefined()
    })
    // The refetch now reports the list as activated, so its task reaches the floor.
    await waitFor(() => expect(screen.getByText('WIPE BENCHES')).toBeDefined())
  })

  it('shows hidden lists in the manager MANAGE LISTS strip', async () => {
    mockEditApi({
      checklists: [{ ...CHECKLIST_SUMMARY, appearFromTime: '23:59' }],
      fullChecklists: [{ ...CHECKLIST_FULL, appearFromTime: '23:59' }],
    })
    render(<WorkerTasksClient role="MANAGER" sessionVenueId="v1" />)

    await waitFor(() => expect(screen.getByText('OPENS LATER')).toBeDefined())
    fireEvent.click(screen.getByText('EDIT MODE'))

    await waitFor(() => expect(screen.getByText('MANAGE LISTS')).toBeDefined())
    await waitFor(() => expect(screen.getByLabelText('MANAGE UNLOCK CHECKLIST OPENING')).toBeDefined())
    expect(screen.getByText('HIDDEN')).toBeDefined()
    expect(screen.getByText('FROM 23:59')).toBeDefined()
    expect(screen.getByLabelText('MANAGE CHECKLIST OPENING')).toBeDefined()
  })

  it('deactivates a forced-open list from MANAGE LISTS', async () => {
    const fetchMock = mockEditApi({
      activated: true,
      checklists: [{ ...CHECKLIST_SUMMARY, appearFromTime: '23:59' }],
      fullChecklists: [{ ...CHECKLIST_FULL, appearFromTime: '23:59' }],
    })
    render(<WorkerTasksClient role="MANAGER" sessionVenueId="v1" />)

    // Activated today, so the floor shows the task despite the late FROM time.
    await waitFor(() => expect(screen.getByText('WIPE BENCHES')).toBeDefined())
    fireEvent.click(screen.getByText('EDIT MODE'))

    await waitFor(() => expect(screen.getByLabelText('MANAGE DEACTIVATE CHECKLIST OPENING')).toBeDefined())
    expect(screen.getByText('OPEN')).toBeDefined()
    fireEvent.click(screen.getByLabelText('MANAGE DEACTIVATE CHECKLIST OPENING'))

    await waitFor(() => {
      const del = fetchMock.mock.calls.find(
        ([url, init]) => String(url) === '/api/worker/checklists/c1/activate' && init?.method === 'DELETE',
      )
      expect(del).toBeDefined()
    })
  })

  it('does not show UNLOCK or MANAGE LISTS without list-edit rights', async () => {
    mockEditApi({
      access: NO_ACCESS,
      checklists: [{ ...CHECKLIST_SUMMARY, appearFromTime: '23:59' }],
    })
    render(<WorkerTasksClient role="STAFF" sessionVenueId="v1" access={NO_ACCESS} />)

    await waitFor(() => expect(screen.getByText('OPENS LATER')).toBeDefined())
    expect(screen.queryByText('UNLOCK')).toBeNull()
    expect(screen.queryByText('MANAGE LISTS')).toBeNull()
    expect(screen.queryByText('EDIT MODE')).toBeNull()
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

  it('resets the save button and shows an error when the completion request fails', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (url: string | URL | Request) => {
      const u = String(url)
      if (u === '/api/worker/tasks') {
        return json({ tasks: [BASE_TASK], checklists: [], firstName: 'BAR' })
      }
      if (u.includes('/complete')) throw new TypeError('network down')
      return json({})
    })
    render(<WorkerTasksClient role="STAFF" sessionVenueId="v1" />)
    await waitFor(() => expect(screen.getByText('WIPE BENCHES')).toBeDefined())
    fireEvent.click(screen.getByText('WIPE BENCHES'))

    await waitFor(() => expect(screen.getByText('WHAT HAPPENED?')).toBeDefined())
    fireEvent.click(screen.getByText('MARK DONE'))

    await waitFor(() => expect(screen.getByText(/COULD NOT CONNECT/)).toBeDefined())
    expect(screen.getByText('MARK DONE')).toBeDefined()
    expect(screen.queryByText('SAVING_')).toBeNull()
  })

  it('redirects to the login page when the completion request returns 401', async () => {
    pushMock.mockClear()
    vi.spyOn(global, 'fetch').mockImplementation(async (url: string | URL | Request) => {
      const u = String(url)
      if (u === '/api/worker/tasks') {
        return json({ tasks: [BASE_TASK], checklists: [], firstName: 'BAR' })
      }
      if (u.includes('/complete')) {
        return { ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) } as unknown as Response
      }
      return json({})
    })
    render(<WorkerTasksClient role="STAFF" sessionVenueId="v1" />)
    await waitFor(() => expect(screen.getByText('WIPE BENCHES')).toBeDefined())
    fireEvent.click(screen.getByText('WIPE BENCHES'))

    await waitFor(() => expect(screen.getByText('WHAT HAPPENED?')).toBeDefined())
    fireEvent.click(screen.getByText('MARK DONE'))

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/w/login'))
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

  it('saves custom schedule windows from the worker list editor', async () => {
    const fetchMock = mockEditApi()
    render(<WorkerTasksClient role="STAFF" sessionVenueId="v1" access={FULL_ACCESS} />)

    await waitFor(() => expect(screen.getByText('WIPE BENCHES')).toBeDefined())
    fireEvent.click(screen.getByText('EDIT MODE'))
    await waitFor(() => expect(screen.getByLabelText('EDIT CHECKLIST OPENING')).toBeDefined())
    fireEvent.click(screen.getByLabelText('EDIT CHECKLIST OPENING'))
    await waitFor(() => expect(screen.getByText('EDIT CHECKLIST')).toBeDefined())

    fireEvent.click(screen.getByLabelText('SCHEDULE DAY TUE'))
    fireEvent.change(screen.getByLabelText('SCHEDULE FROM TUE 0'), { target: { value: '18:00' } })
    fireEvent.click(screen.getByTestId('worker-checklist-save'))

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(
        ([url, init]) => String(url) === '/api/worker/checklists/c1' && init?.method === 'PUT',
      )
      expect(put).toBeDefined()
      const body = JSON.parse(String((put![1] as RequestInit).body))
      expect(body.schedules).toEqual([{ dayOfWeek: 2, fromTime: '18:00', toTime: null }])
    })
  })

  it('uses the server opensNext label for a hidden list', async () => {
    mockEditApi({
      checklists: [{
        ...CHECKLIST_SUMMARY,
        appearFromTime: null,
        openNow: false,
        opensNext: 'OPENS THU 06:00',
        schedules: [{ dayOfWeek: 4, fromTime: '06:00', toTime: null }],
      }],
      fullChecklists: [{
        ...CHECKLIST_FULL,
        appearFromTime: null,
        schedules: [{ dayOfWeek: 4, fromTime: '06:00', toTime: null }],
      }],
    })
    render(<WorkerTasksClient role="STAFF" sessionVenueId="v1" />)

    await waitFor(() => expect(screen.getByText(/OPENS THU 06:00/)).toBeDefined())
    expect(screen.queryByText('WIPE BENCHES')).toBeNull()
  })

  it('shows an EVENT badge on an event-linked list', async () => {
    mockEditApi({
      checklists: [{ ...CHECKLIST_SUMMARY, events: [EVENT_ONE] }],
      fullChecklists: [{ ...CHECKLIST_FULL, events: [EVENT_ONE] }],
    })
    render(<WorkerTasksClient role="STAFF" sessionVenueId="v1" />)

    await waitFor(() => expect(screen.getAllByText(/EVENT:\s*DINNER/).length).toBeGreaterThan(0))
    // The event-linked list still only shows its own tasks (audience/task filters unchanged).
    expect(screen.getByText('WIPE BENCHES')).toBeDefined()
  })

  it('saves the selected calendar event from the worker list editor', async () => {
    const fetchMock = mockEditApi()
    render(<WorkerTasksClient role="STAFF" sessionVenueId="v1" access={FULL_ACCESS} />)

    await waitFor(() => expect(screen.getByText('WIPE BENCHES')).toBeDefined())
    fireEvent.click(screen.getByText('EDIT MODE'))
    await waitFor(() => expect(screen.getByLabelText('EDIT CHECKLIST OPENING')).toBeDefined())
    fireEvent.click(screen.getByLabelText('EDIT CHECKLIST OPENING'))
    await waitFor(() => expect(screen.getByText('EDIT CHECKLIST')).toBeDefined())

    fireEvent.focus(screen.getByPlaceholderText('+ LINK AN EVENT...'))
    fireEvent.click(await screen.findByText(/DINNER · 2026-10-23/))
    fireEvent.click(screen.getByTestId('worker-checklist-save'))

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(
        ([url, init]) => String(url) === '/api/worker/checklists/c1' && init?.method === 'PUT',
      )
      expect(put).toBeDefined()
      const body = JSON.parse(String((put![1] as RequestInit).body))
      expect(body.eventIds).toEqual(['e1'])
    })
  })

  it('indents a child under its parent when both are in the same open list', async () => {
    const parent = {
      ...BASE_TASK, id: 'p1', title: 'NEWSPAPERS', parentTaskId: null,
      subtasks: [{ id: 'c1', title: 'THROW OUT PAPERS', isActive: true, subtaskOrder: 0, isCompleted: false, isDone: false, inProgress: false }],
    }
    const child = {
      ...BASE_TASK, id: 'c1', title: 'THROW OUT PAPERS', parentTaskId: 'p1', parentTitle: 'NEWSPAPERS',
    }
    mockEditApi({
      floorTasks: [parent, child],
      checklists: [{ ...CHECKLIST_SUMMARY, openNow: true, taskIds: ['p1', 'c1'] }],
      fullChecklists: [{ ...CHECKLIST_FULL, tasks: [{ id: 'p1', title: 'NEWSPAPERS', isActive: true, version: 1 }, { id: 'c1', title: 'THROW OUT PAPERS', isActive: true, version: 1 }] }],
    })
    render(<WorkerTasksClient role="STAFF" sessionVenueId="v1" />)

    await waitFor(() => expect(screen.getByText('NEWSPAPERS')).toBeDefined())
    expect(screen.getByText('↳ THROW OUT PAPERS')).toBeDefined()
    expect(screen.queryByText(/PART OF NEWSPAPERS/)).toBeNull()
  })

  it('labels a child PART OF its parent when they are in different lists', async () => {
    const parent = {
      ...BASE_TASK, id: 'p1', title: 'NEWSPAPERS', parentTaskId: null,
      subtasks: [{ id: 'c1', title: 'THROW OUT PAPERS', isActive: true, subtaskOrder: 0, isCompleted: false, isDone: false, inProgress: false }],
    }
    const child = {
      ...BASE_TASK, id: 'c1', title: 'THROW OUT PAPERS', parentTaskId: 'p1', parentTitle: 'NEWSPAPERS',
    }
    mockEditApi({
      floorTasks: [parent, child],
      checklists: [
        { ...CHECKLIST_SUMMARY, id: 'c1', name: 'SETUP', openNow: true, taskIds: ['p1'] },
        { ...CHECKLIST_SUMMARY, id: 'c2', name: 'CLOSE', openNow: true, taskIds: ['c1'] },
      ],
      fullChecklists: [
        { ...CHECKLIST_FULL, id: 'c1', name: 'SETUP', tasks: [{ id: 'p1', title: 'NEWSPAPERS', isActive: true, version: 1 }] },
        { ...CHECKLIST_FULL, id: 'c2', name: 'CLOSE', tasks: [{ id: 'c1', title: 'THROW OUT PAPERS', isActive: true, version: 1 }] },
      ],
    })
    render(<WorkerTasksClient role="STAFF" sessionVenueId="v1" />)

    await waitFor(() => expect(screen.getByText('NEWSPAPERS')).toBeDefined())
    expect(screen.getByText('THROW OUT PAPERS')).toBeDefined()
    expect(screen.getByText(/PART OF NEWSPAPERS/)).toBeDefined()
    expect(screen.getByText('SUBTASKS IN OTHER LISTS')).toBeDefined()
  })

  it('creates a linked child from ADD SUBTASK in the worker task modal', async () => {
    const fetchMock = mockEditApi()
    render(<WorkerTasksClient role="STAFF" sessionVenueId="v1" access={FULL_ACCESS} />)

    await waitFor(() => expect(screen.getByText('WIPE BENCHES')).toBeDefined())
    fireEvent.click(screen.getByText('EDIT MODE'))
    await waitFor(() => expect(screen.getByText('EDIT MODE ACTIVE // ARMED')).toBeDefined())
    const editButtons = screen.getAllByText('EDIT')
    fireEvent.click(editButtons[editButtons.length - 1])
    await waitFor(() => expect(screen.getByText('EDIT TASK')).toBeDefined())

    fireEvent.click(screen.getByText('+ ADD SUBTASK'))
    await waitFor(() => expect(screen.getByText('NEW SUBTASK')).toBeDefined())

    fireEvent.change(screen.getByPlaceholderText('WIPE DOWN ALL BAR SURFACES'), {
      target: { value: 'THROW OUT PAPERS' },
    })
    fireEvent.click(screen.getByTestId('worker-task-save'))

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([url, init]) => String(url) === '/api/worker/tasks' && init?.method === 'POST',
      )
      expect(post).toBeDefined()
      const body = JSON.parse(String((post![1] as RequestInit).body))
      expect(body.parentTaskId).toBe('t1')
      expect(body.departmentId).toBe('d1')
    })
  })

  it('hides settled outcomes by default and reveals them below the pending tasks', async () => {
    mockTasks([
      { ...BASE_TASK, id: 't1', title: 'STILL TO DO' },
      {
        ...BASE_TASK, id: 't2', title: 'WAS NOT NEEDED', isCompleted: true, isSettled: true,
        outcome: 'NOT_REQUIRED', canUndo: true,
        completion: { id: 'c2', note: null, photoUrl: null, completedAt: new Date(), outcome: 'NOT_REQUIRED' },
      },
    ])
    render(<WorkerTasksClient role="STAFF" sessionVenueId="v1" />)

    await waitFor(() => expect(screen.getByText('STILL TO DO')).toBeDefined())
    // Settlement work is collapsed behind SHOW FINISHED.
    expect(screen.queryByText('WAS NOT NEEDED')).toBeNull()
    expect(screen.queryByText('HANDLED — NOT DONE')).toBeNull()

    fireEvent.click(screen.getByText('SHOW FINISHED (1)'))

    await waitFor(() => expect(screen.getByText('WAS NOT NEEDED')).toBeDefined())
    expect(screen.getByText('NOT REQUIRED')).toBeDefined()
    expect(screen.getByText('REOPEN')).toBeDefined()
  })

  it('undoes a settled completion through the DELETE route', async () => {
    const fetchMock = mockTasks([
      {
        ...BASE_TASK, id: 't2', title: 'MIS-TAPPED', isCompleted: true, isSettled: true,
        outcome: 'DONE', isDone: true, canUndo: true,
        completion: { id: 'c2', note: null, photoUrl: null, completedAt: new Date(), outcome: 'DONE' },
      },
    ])
    render(<WorkerTasksClient role="STAFF" sessionVenueId="v1" />)

    fireEvent.click(await screen.findByText('SHOW FINISHED (1)'))
    await waitFor(() => expect(screen.getByText('UNTICK')).toBeDefined())
    fireEvent.click(screen.getByText('UNTICK'))

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, init]) => String(url) === '/api/worker/tasks/t2/complete' && init?.method === 'DELETE',
      )
      expect(call).toBeDefined()
    })
  })

  it('renders a distinct status box per outcome and strikes NOT_REQUIRED', async () => {
    mockTasks([
      {
        ...BASE_TASK, id: 't1', title: 'DONE ONE', isCompleted: true, isSettled: true,
        isDone: true, outcome: 'DONE', canUndo: true,
        completion: { id: 'c1', note: null, photoUrl: null, completedAt: new Date(), outcome: 'DONE' },
      },
      {
        ...BASE_TASK, id: 't2', title: 'NOT NEEDED', isCompleted: true, isSettled: true,
        outcome: 'NOT_REQUIRED', canUndo: true,
        completion: { id: 'c2', note: null, photoUrl: null, completedAt: new Date(), outcome: 'NOT_REQUIRED' },
      },
      {
        ...BASE_TASK, id: 't3', title: 'FAILED', isCompleted: true, isSettled: true,
        outcome: 'DID_NOT_COMPLETE', canUndo: true,
        completion: { id: 'c3', note: null, photoUrl: null, completedAt: new Date(), outcome: 'DID_NOT_COMPLETE' },
      },
      {
        ...BASE_TASK, id: 't4', title: 'HALF DONE',
        inProgress: { note: null, byName: null, since: new Date().toISOString() },
      },
    ])
    render(<WorkerTasksClient role="STAFF" sessionVenueId="v1" />)

    await waitFor(() => expect(screen.getByText('HALF DONE')).toBeDefined())
    expect(screen.getByLabelText('IN PROGRESS STATUS')).toBeDefined()

    fireEvent.click(screen.getByText('SHOW FINISHED (3)'))

    await waitFor(() => expect(screen.getByText('NOT NEEDED')).toBeDefined())
    expect(screen.getByLabelText('DONE STATUS')).toBeDefined()
    expect(screen.getByLabelText('NOT REQUIRED STATUS')).toBeDefined()
    expect(screen.getByLabelText('DID NOT COMPLETE STATUS')).toBeDefined()

    const notNeeded = screen.getByText('NOT NEEDED')
    expect(notNeeded.className).toContain('line-through')
    expect(notNeeded.className).toContain('text-grey-light')
  })

  it('sorts a fully finished list below an unfinished one and keeps it collapsed', async () => {
    const openTask = { ...BASE_TASK, id: 'o1', title: 'OPEN JOB' }
    const doneTask = {
      ...BASE_TASK, id: 'd1', title: 'DONE JOB', isCompleted: true, isSettled: true,
      isDone: true, outcome: 'DONE', canUndo: true,
      completion: { id: 'cd', note: null, photoUrl: null, completedAt: new Date(), outcome: 'DONE' },
    }
    const list = (id: string, name: string, taskIds: string[]) =>
      ({ id, name, appearFromTime: null, activatedToday: false, openNow: true, taskIds })
    mockTasks(
      [openTask, doneTask],
      [list('c1', 'SETUP', ['o1']), list('c2', 'CLOSE', ['d1'])],
    )
    render(<WorkerTasksClient role="STAFF" sessionVenueId="v1" />)

    await waitFor(() => expect(screen.getByText('SETUP')).toBeDefined())
    const setup = screen.getByText('SETUP')
    const close = screen.getByText('CLOSE')
    // CLOSE is fully settled, so it moves below the unfinished SETUP list.
    expect(setup.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText('ALL FINISHED · TAP TO VIEW')).toBeDefined()
    // Its finished work is collapsed until toggled.
    expect(screen.queryByText('DONE JOB')).toBeNull()
  })

  it('saves the multi-day flag from the worker list editor', async () => {
    const fetchMock = mockEditApi()
    render(<WorkerTasksClient role="STAFF" sessionVenueId="v1" access={FULL_ACCESS} />)

    await waitFor(() => expect(screen.getByText('WIPE BENCHES')).toBeDefined())
    fireEvent.click(screen.getByText('EDIT MODE'))
    await waitFor(() => expect(screen.getByLabelText('EDIT CHECKLIST OPENING')).toBeDefined())
    fireEvent.click(screen.getByLabelText('EDIT CHECKLIST OPENING'))
    await waitFor(() => expect(screen.getByText('EDIT CHECKLIST')).toBeDefined())

    fireEvent.click(screen.getByRole('checkbox', { name: /SIDE WORK/ }))
    fireEvent.click(screen.getByTestId('worker-checklist-save'))

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(
        ([url, init]) => String(url) === '/api/worker/checklists/c1' && init?.method === 'PUT',
      )
      expect(put).toBeDefined()
      const body = JSON.parse(String((put![1] as RequestInit).body))
      expect(body.multiDay).toBe(true)
    })
  })

  it("reloads and shows another worker's completion when the window regains focus", async () => {
    let call = 0
    const doneTask = {
      ...BASE_TASK, isCompleted: true, isSettled: true, isDone: true, outcome: 'DONE', canUndo: true,
      completion: { id: 'c1', note: null, photoUrl: null, completedAt: new Date(), outcome: 'DONE' },
    }
    vi.mocked(global.fetch).mockImplementation(async (url: string | URL | Request) => {
      const u = String(url)
      if (u === '/api/worker/tasks') {
        call++
        return json({
          tasks: call === 1 ? [BASE_TASK] : [doneTask],
          checklists: [CHECKLIST_SUMMARY],
          firstName: 'BAR',
        })
      }
      return json({})
    })

    render(<WorkerTasksClient role="STAFF" sessionVenueId="v1" />)
    await waitFor(() => expect(screen.getByText('WIPE BENCHES')).toBeDefined())
    expect(screen.queryByText(/SHOW FINISHED/)).toBeNull()

    act(() => { window.dispatchEvent(new Event('focus')) })

    await waitFor(() => expect(screen.getByText('SHOW FINISHED (1)')).toBeDefined())
    expect(call).toBeGreaterThanOrEqual(2)
  })

  it('pauses live-refresh while the task modal is open', async () => {
    let call = 0
    vi.mocked(global.fetch).mockImplementation(async (url: string | URL | Request) => {
      const u = String(url)
      if (u === '/api/worker/tasks') {
        call++
        return json({ tasks: [BASE_TASK], checklists: [CHECKLIST_SUMMARY], firstName: 'BAR' })
      }
      return json({})
    })

    render(<WorkerTasksClient role="STAFF" sessionVenueId="v1" />)
    await waitFor(() => expect(screen.getByText('WIPE BENCHES')).toBeDefined())
    const before = call

    fireEvent.click(screen.getByText('WIPE BENCHES'))
    await waitFor(() => expect(screen.getByText('WHAT HAPPENED?')).toBeDefined())

    act(() => { window.dispatchEvent(new Event('focus')) })
    await Promise.resolve()
    expect(call).toBe(before)
  })
})
