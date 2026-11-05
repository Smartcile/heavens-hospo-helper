import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, waitFor, screen, within } from '@testing-library/react'

import { TasksClient } from '@/components/admin/TasksClient'

function json(data: unknown): Response {
  return { ok: true, status: 200, json: async () => data } as unknown as Response
}

const TASK_ONE = {
  id: 't1', title: 'TASK ONE', description: null, venueId: 'v1',
  departmentId: 'd1', sectionId: null, completionType: 'TICK', scheduleType: 'DAILY',
  scheduleDays: [], customCron: null, intervalMonths: 1, monthlyOption: null,
  monthlyDay: null, isActive: true, sortOrder: 0,
  department: { id: 'd1', name: 'KITCHEN', colour: null }, section: null,
  requiredTraining: [], taskGuides: [], trainingModules: [], progress: null,
  _count: { checklistLinks: 1 },
}

const TASK_TWO = {
  ...TASK_ONE, id: 't2', title: 'TASK TWO', sortOrder: 1, _count: { checklistLinks: 0 },
}

const PARENT_TASK = {
  ...TASK_ONE, id: 'p1', title: 'NEWSPAPERS', _count: { checklistLinks: 0 },
  parentTaskId: null, subtasks: [{ id: 'c1', title: 'THROW OUT PAPERS', isActive: true, subtaskOrder: 0 }],
}

const CHILD_TASK = {
  ...TASK_ONE, id: 'c1', title: 'THROW OUT PAPERS', sortOrder: 1, _count: { checklistLinks: 0 },
  parentTaskId: 'p1', parentTitle: 'NEWSPAPERS',
}

const CHECKLIST = {
  id: 'c1', name: 'OPENING', description: null, venueId: 'v1',
  departmentId: null, sectionId: null, appearFromTime: null, activatedOn: null,
  allowedOutcomes: [], requireOutcomeReason: false, department: null, section: null,
  events: [], tasks: [{ id: 't1', title: 'TASK ONE', isActive: true, version: 1 }],
}

const EVENT_ONE = {
  id: 'e1', venueId: 'v1', title: 'DINNER',
  startsAt: '2026-10-23T18:00:00.000Z', endsAt: '2026-10-23T22:00:00.000Z',
  date: '2026-10-23', startTime: '18:00', endTime: '22:00', allDay: false,
}

const CHECKLIST_WITH_EVENT = {
  ...CHECKLIST, id: 'c2', name: 'EVENT LIST', events: [EVENT_ONE],
}

function mockApi(tasks: unknown[] = [TASK_ONE, TASK_TWO], gate?: Promise<void>) {
  const fetchMock = vi.mocked(global.fetch)
  fetchMock.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
    if (gate) await gate
    const u = String(url)
    if (u.includes('/progress')) return json({ success: true })
    if (u.startsWith('/api/admin/tasks/assignees')) return json([{ id: 's1', name: 'SAM LEE' }])
    if (u.startsWith('/api/admin/tasks')) return json(tasks)
    if (u === '/api/admin/venues') return json([{ id: 'v1', name: 'VENUE' }])
    if (u === '/api/admin/departments') return json([{ id: 'd1', name: 'KITCHEN', venueId: 'v1', colour: null }])
    if (u === '/api/admin/sections') return json([])
    if (u.startsWith('/api/admin/guides')) return json([])
    if (u.startsWith('/api/admin/calendar-events')) return json([EVENT_ONE])
    if (u.startsWith('/api/admin/checklists')) return json([CHECKLIST, CHECKLIST_WITH_EVENT])
    void init
    return json({})
  })
  return fetchMock
}

describe('TasksClient', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch')
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    sessionStorage.clear()
  })

  it('removes a dropped task from the available list and restores it on remove (#19)', async () => {
    mockApi()
    render(<TasksClient role="ADMIN" sessionVenueId="v1" />)

    // The default usage filter is NOT IN A LIST, so start from ANY USAGE.
    await waitFor(() => expect(screen.getByTestId('available-task-t2')).toBeDefined())
    fireEvent.change(screen.getByTestId('usage-filter'), { target: { value: '' } })
    await waitFor(() => expect(screen.getByTestId('available-task-t1')).toBeDefined())

    fireEvent.click(screen.getByLabelText('EDIT CHECKLIST OPENING'))

    await waitFor(() => expect(screen.getByText('EDIT CHECKLIST')).toBeDefined())
    // t1 is already in the checklist -> hidden from the left; t2 is available.
    expect(screen.getByTestId('available-task-t2')).toBeDefined()

    fireEvent.drop(screen.getByTestId('cl-dropzone'), {
      dataTransfer: { getData: () => 't2' },
    })
    await waitFor(() => expect(screen.queryByTestId('available-task-t2')).toBeNull())

    // Removing t1 from the live selection puts it back on the left.
    fireEvent.click(screen.getAllByText('✕')[0])
    await waitFor(() => expect(screen.getByTestId('available-task-t1')).toBeDefined())
  })

  it('also filters a brand-new list against the live selection (#19)', async () => {
    mockApi()
    render(<TasksClient role="ADMIN" sessionVenueId="v1" />)

    await waitFor(() => expect(screen.getByTestId('available-task-t2')).toBeDefined())
    fireEvent.click(screen.getByText('+ NEW CHECKLIST'))

    await waitFor(() => expect(screen.getByText('NEW CHECKLIST')).toBeDefined())
    expect((screen.getByTestId('usage-filter') as HTMLSelectElement).value).toBe('notinthis')

    fireEvent.drop(screen.getByTestId('cl-dropzone'), {
      dataTransfer: { getData: () => 't2' },
    })
    await waitFor(() => expect(screen.queryByTestId('available-task-t2')).toBeNull())
  })

  it('resets the usage filter to a real option when the editor closes', async () => {
    mockApi()
    render(<TasksClient role="ADMIN" sessionVenueId="v1" />)

    await waitFor(() => expect(screen.getByLabelText('EDIT CHECKLIST OPENING')).toBeDefined())
    fireEvent.click(screen.getByLabelText('EDIT CHECKLIST OPENING'))
    await waitFor(() => expect(screen.getByText('EDIT CHECKLIST')).toBeDefined())

    fireEvent.click(screen.getByText('CLOSE'))
    await waitFor(() => {
      expect((screen.getByTestId('usage-filter') as HTMLSelectElement).value).toBe('nolist')
    })
  })

  it('lets an admin clear a stale in-progress (PARTIAL) row', async () => {
    const fetchMock = mockApi([
      { ...TASK_ONE, progress: { note: 'HALF DONE', outcome: 'PARTIAL', updatedAt: '2026-10-20T08:00:00.000Z', staff: { firstName: 'SAM', lastName: 'LEE' } } },
      TASK_TWO,
    ])
    render(<TasksClient role="ADMIN" sessionVenueId="v1" />)

    await waitFor(() => expect(screen.getByTestId('available-task-t2')).toBeDefined())
    fireEvent.change(screen.getByTestId('usage-filter'), { target: { value: '' } })
    await waitFor(() => expect(screen.getByText(/IN PROGRESS · SAM LEE/)).toBeDefined())
    fireEvent.click(screen.getByText('CLEAR'))

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, init]) => String(url) === '/api/admin/tasks/t1/progress' && init?.method === 'DELETE',
      )
      expect(call).toBeDefined()
    })
  })

  it('saves custom schedule windows from the checklist editor', async () => {
    const fetchMock = mockApi()
    render(<TasksClient role="ADMIN" sessionVenueId="v1" />)

    await waitFor(() => expect(screen.getByLabelText('EDIT CHECKLIST OPENING')).toBeDefined())
    fireEvent.click(screen.getByLabelText('EDIT CHECKLIST OPENING'))
    await waitFor(() => expect(screen.getByText('EDIT CHECKLIST')).toBeDefined())

    fireEvent.click(screen.getByLabelText('SCHEDULE DAY MON'))
    fireEvent.change(screen.getByLabelText('SCHEDULE FROM MON 0'), { target: { value: '09:30' } })

    fireEvent.click(screen.getByText('SAVE CHECKLIST'))

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(
        ([url, init]) => String(url) === '/api/admin/checklists/c1' && init?.method === 'PUT',
      )
      expect(put).toBeDefined()
      const body = JSON.parse(String((put![1] as RequestInit).body))
      expect(body.schedules).toEqual([{ dayOfWeek: 1, fromTime: '09:30', toTime: null }])
    })
  })

  it('still saves a legacy list with no schedule rows', async () => {
    const fetchMock = mockApi()
    const { container } = render(<TasksClient role="ADMIN" sessionVenueId="v1" />)

    await waitFor(() => expect(screen.getByLabelText('EDIT CHECKLIST OPENING')).toBeDefined())
    fireEvent.click(screen.getByLabelText('EDIT CHECKLIST OPENING'))
    await waitFor(() => expect(screen.getByText('EDIT CHECKLIST')).toBeDefined())

    const appearFrom = container.querySelector('input[type="time"]') as HTMLInputElement
    fireEvent.change(appearFrom, { target: { value: '07:00' } })
    fireEvent.click(screen.getByText('SAVE CHECKLIST'))

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(
        ([url, init]) => String(url) === '/api/admin/checklists/c1' && init?.method === 'PUT',
      )
      expect(put).toBeDefined()
      const body = JSON.parse(String((put![1] as RequestInit).body))
      expect(body.appearFromTime).toBe('07:00')
      expect(body.schedules).toEqual([])
    })
  })

  it('shows an EVENT badge for an event-linked list', async () => {
    mockApi()
    render(<TasksClient role="ADMIN" sessionVenueId="v1" />)

    await waitFor(() => expect(screen.getAllByText(/EVENT:\s*DINNER/).length).toBeGreaterThan(0))
  })

  it('saves the selected calendar event from the checklist editor', async () => {
    const fetchMock = mockApi()
    render(<TasksClient role="ADMIN" sessionVenueId="v1" />)

    await waitFor(() => expect(screen.getByLabelText('EDIT CHECKLIST OPENING')).toBeDefined())
    fireEvent.click(screen.getByLabelText('EDIT CHECKLIST OPENING'))
    await waitFor(() => expect(screen.getByText('EDIT CHECKLIST')).toBeDefined())

    fireEvent.focus(screen.getByPlaceholderText('+ LINK AN EVENT...'))
    fireEvent.click(await screen.findByText(/DINNER · 2026-10-23/))
    fireEvent.click(screen.getByText('SAVE CHECKLIST'))

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(
        ([url, init]) => String(url) === '/api/admin/checklists/c1' && init?.method === 'PUT',
      )
      expect(put).toBeDefined()
      const body = JSON.parse(String((put![1] as RequestInit).body))
      expect(body.eventIds).toEqual(['e1'])
    })
  })

  it('indents a subtask under its parent in the admin task list', async () => {
    mockApi([PARENT_TASK, CHILD_TASK])
    render(<TasksClient role="ADMIN" sessionVenueId="v1" />)

    await waitFor(() => expect(screen.getByTestId('available-task-c1')).toBeDefined())
    const child = screen.getByTestId('available-task-c1')
    expect(child.textContent).toContain('↳')
    expect(child.className).toContain('ml-4')
    expect(screen.getByTestId('available-task-p1').textContent).toContain('1 SUBTASK')
  })

  it('creates a linked child from ADD SUBTASK', async () => {
    const fetchMock = mockApi([PARENT_TASK, CHILD_TASK])
    render(<TasksClient role="ADMIN" sessionVenueId="v1" />)

    await waitFor(() => expect(screen.getByTestId('available-task-p1')).toBeDefined())
    fireEvent.click(within(screen.getByTestId('available-task-p1')).getByText('EDIT'))
    await waitFor(() => expect(screen.getByText('EDIT TASK')).toBeDefined())

    fireEvent.click(screen.getByText('+ ADD SUBTASK'))
    await waitFor(() => expect(screen.getByText('NEW SUBTASK')).toBeDefined())

    fireEvent.change(screen.getByPlaceholderText('WIPE DOWN ALL BAR SURFACES'), {
      target: { value: 'THROW OUT PAPERS' },
    })
    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([url, init]) => String(url) === '/api/admin/tasks' && init?.method === 'POST',
      )
      expect(post).toBeDefined()
      const body = JSON.parse(String((post![1] as RequestInit).body))
      expect(body.parentTaskId).toBe('p1')
      expect(body.departmentId).toBe('d1')
      expect(body.scheduleType).toBe('DAILY')
      expect(body.completionType).toBe('TICK')
    })
  })

  it('saves the selected parent task from the picker', async () => {
    const fetchMock = mockApi([TASK_ONE, TASK_TWO])
    render(<TasksClient role="ADMIN" sessionVenueId="v1" />)

    await waitFor(() => expect(screen.getByTestId('available-task-t2')).toBeDefined())
    fireEvent.click(within(screen.getByTestId('available-task-t2')).getByText('EDIT'))
    await waitFor(() => expect(screen.getByText('EDIT TASK')).toBeDefined())

    fireEvent.change(screen.getByTestId('task-parent-select'), { target: { value: 't1' } })
    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(
        ([url, init]) => String(url) === '/api/admin/tasks/t2' && init?.method === 'PUT',
      )
      expect(put).toBeDefined()
      const body = JSON.parse(String((put![1] as RequestInit).body))
      expect(body.parentTaskId).toBe('t1')
    })
  })

  it('searches lists and people from the task editor and saves both', async () => {
    const fetchMock = mockApi([TASK_ONE, TASK_TWO])
    render(<TasksClient role="ADMIN" sessionVenueId="v1" />)

    await waitFor(() => expect(screen.getByTestId('available-task-t2')).toBeDefined())
    fireEvent.click(within(screen.getByTestId('available-task-t2')).getByText('EDIT'))
    await waitFor(() => expect(screen.getByText('EDIT TASK')).toBeDefined())

    expect(screen.getByText('Lists (which checklists this task appears in)')).toBeDefined()
    expect(screen.getByText('Assigned to (optional)')).toBeDefined()

    // Pick a list from the search dropdown (the last OPENING is the option,
    // the first is the checklist card in the right panel).
    fireEvent.focus(screen.getByPlaceholderText('Search lists...'))
    fireEvent.click(screen.getAllByText('OPENING').at(-1)!)

    // Pick a person from the searchable single-select.
    fireEvent.focus(screen.getByPlaceholderText('Search people...'))
    fireEvent.click(await screen.findByText('SAM LEE'))

    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(
        ([url, init]) => String(url) === '/api/admin/tasks/t2' && init?.method === 'PUT',
      )
      expect(put).toBeDefined()
      const body = JSON.parse(String((put![1] as RequestInit).body))
      expect(body.checklistIds).toEqual(['c1'])
      expect(body.assignedToStaffId).toBe('s1')
    })
  })

  it('restores the saved scroll position after the lists render (#16)', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    sessionStorage.setItem('hospo-tasks-scroll:window', '240')

    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    mockApi([TASK_ONE, TASK_TWO], gate)

    render(<TasksClient role="ADMIN" sessionVenueId="v1" />)

    // Still loading: do not restore against an empty page.
    expect(scrollTo).not.toHaveBeenCalled()

    release()
    await waitFor(() => expect(screen.getByTestId('available-task-t2')).toBeDefined())
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 240))
  })
})
