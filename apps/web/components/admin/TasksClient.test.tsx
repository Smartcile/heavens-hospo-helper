import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, waitFor, screen, within } from '@testing-library/react'

import { TasksClient } from '@/components/admin/TasksClient'

function json(data: unknown): Response {
  return { ok: true, status: 200, json: async () => data } as unknown as Response
}

/** The LAST <select> offering `optionText` — the task modal renders after the page filters. */
function selectWithOption(optionText: string): HTMLSelectElement {
  const selects = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[]
  const matches = selects.filter((s) => Array.from(s.options).some((o) => o.textContent === optionText))
  if (matches.length === 0) throw new Error(`no select with option ${optionText}`)
  return matches[matches.length - 1]
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
  sectionId: 'sec1', section: { id: 'sec1', name: 'BAR' },
  parentTaskId: null, subtasks: [{ id: 'c1', title: 'THROW OUT PAPERS', isActive: true, subtaskOrder: 0 }],
}

const CHILD_TASK = {
  ...TASK_ONE, id: 'c1', title: 'THROW OUT PAPERS', sortOrder: 1, _count: { checklistLinks: 0 },
  parentTaskId: 'p1', parentTitle: 'NEWSPAPERS',
  sectionId: 'sec1', section: { id: 'sec1', name: 'BAR' },
}

const TASK_BAR = {
  ...TASK_ONE, id: 'tb', title: 'TURN ON DISHWASHER', sectionId: 'sec1',
  section: { id: 'sec1', name: 'BAR' }, _count: { checklistLinks: 0 },
}

const TASK_KITCHEN = {
  ...TASK_ONE, id: 'tk', title: 'TURN ON DISHWASHER', sectionId: 'sec2',
  section: { id: 'sec2', name: 'KITCHEN' }, _count: { checklistLinks: 0 },
}

const TASK_EDIT = {
  ...TASK_ONE, id: 'te', title: 'EDIT ME', _count: { checklistLinks: 0 },
}

const SECTION_BAR = { id: 'sec1', name: 'BAR', departmentId: 'd1', venueId: 'v1' }

const GUIDE_ONE = { id: 'g1', title: 'BAR SOP', venueId: 'v1', isTracked: true, description: null }

const CHECKLIST = {
  id: 'c1', name: 'OPENING', description: null, venueId: 'v1',
  departmentId: null, sectionId: null, appearFromTime: null, activatedOn: null,
  allowedOutcomes: [], requireOutcomeReason: false, department: null, section: null,
  events: [], tasks: [{ id: 't1', title: 'TASK ONE', isActive: true, version: 1, sectionName: 'BAR', sectionCount: 2 }],
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
    if (u.includes('/comments')) return json({ comments: [], canAdd: true, canDeleteAny: true, canSignOff: true, threadClosedAt: null })
    if (u.includes('/sign-off')) return json({ closed: true })
    if (u.startsWith('/api/admin/tasks/assignees')) return json([{ id: 's1', name: 'SAM LEE' }])
    if (u.startsWith('/api/admin/tasks/item-options')) {
      return json([
        {
          id: 'i1', name: 'SPRAY BOTTLE', unit: 'EA', storageNotes: null,
          storageLocations: [{ notes: 'TOP SHELF', section: { name: 'UNDER SINK', department: { name: 'BAR' } } }],
        },
      ])
    }
    // #166: the create route returns the created row (with its id).
    if (u === '/api/admin/tasks' && init?.method === 'POST') {
      const body = init.body ? JSON.parse(String(init.body)) : {}
      return json({ id: 'created-1', ...body })
    }
    if (u.startsWith('/api/admin/tasks')) return json(tasks)
    if (u === '/api/admin/venues') return json([{ id: 'v1', name: 'VENUE' }])
    if (u === '/api/admin/departments') return json([{ id: 'd1', name: 'KITCHEN', venueId: 'v1', colour: null }])
    if (u === '/api/admin/sections') return json([SECTION_BAR])
    if (u.startsWith('/api/admin/guides')) return json([GUIDE_ONE])
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

  it('shows a linked item and renders a rich description as plain text', async () => {
    mockApi([
      {
        ...TASK_ONE,
        description: '<ul><li>Chocolate Powder</li><li>Sprinkles</li></ul>',
        linkedItemId: 'i1',
        linkedItem: {
          id: 'i1', name: 'SPRAY BOTTLE', unit: 'EA', storageNotes: null, deletedAt: null,
          storageLocations: [{ notes: 'TOP SHELF', section: { name: 'UNDER SINK', department: { name: 'BAR' } } }],
        },
      },
    ])
    render(<TasksClient role="ADMIN" sessionVenueId="v1" />)

    await waitFor(() => expect(screen.getByTestId('usage-filter')).toBeDefined())
    fireEvent.change(screen.getByTestId('usage-filter'), { target: { value: '' } })
    await waitFor(() => expect(screen.getByText(/LINKED: SPRAY BOTTLE/)).toBeDefined())
    expect(screen.getByText(/Chocolate Powder/)).toBeDefined()
    expect(screen.queryByText(/<ul>/)).toBeNull()
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

  it('saves the multi-day flag from the checklist editor', async () => {
    const fetchMock = mockApi()
    render(<TasksClient role="ADMIN" sessionVenueId="v1" />)

    await waitFor(() => expect(screen.getByLabelText('EDIT CHECKLIST OPENING')).toBeDefined())
    fireEvent.click(screen.getByLabelText('EDIT CHECKLIST OPENING'))
    await waitFor(() => expect(screen.getByText('EDIT CHECKLIST')).toBeDefined())

    fireEvent.click(screen.getByRole('checkbox', { name: /SIDE WORK/ }))
    fireEvent.click(screen.getByText('SAVE CHECKLIST'))

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(
        ([url, init]) => String(url) === '/api/admin/checklists/c1' && init?.method === 'PUT',
      )
      expect(put).toBeDefined()
      const body = JSON.parse(String((put![1] as RequestInit).body))
      expect(body.multiDay).toBe(true)
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

    // A task with subtasks can never become a subtask itself.
    const parentInput = within(screen.getByTestId('task-parent-select'))
      .getByPlaceholderText('NONE (TOP-LEVEL TASK)') as HTMLInputElement
    expect(parentInput.disabled).toBe(true)

    // The subtask list labels each child with its section.
    const subtaskPanel = screen.getByText(/Subtasks \(1\)/).closest('div.border') as HTMLElement
    expect(subtaskPanel.textContent).toContain('[BAR] THROW OUT PAPERS')

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
    // Saving a subtask never offers another subtask.
    expect(screen.queryByText('ADD A SUBTASK?')).toBeNull()
  })

  it('saves the selected parent task from the grouped picker', async () => {
    const fetchMock = mockApi([TASK_ONE, TASK_TWO])
    render(<TasksClient role="ADMIN" sessionVenueId="v1" />)

    await waitFor(() => expect(screen.getByTestId('available-task-t2')).toBeDefined())
    fireEvent.click(within(screen.getByTestId('available-task-t2')).getByText('EDIT'))
    await waitFor(() => expect(screen.getByText('EDIT TASK')).toBeDefined())

    const picker = screen.getByTestId('task-parent-select')
    fireEvent.focus(within(picker).getByPlaceholderText('NONE (TOP-LEVEL TASK)'))
    fireEvent.click(within(picker).getByText('TASK ONE'))
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

  it('saves checklist task group labels (#104)', async () => {
    mockApi()
    render(<TasksClient role="ADMIN" sessionVenueId="v1" />)

    await waitFor(() => expect(screen.getByLabelText('EDIT CHECKLIST OPENING')).toBeDefined())
    fireEvent.click(screen.getByLabelText('EDIT CHECKLIST OPENING'))

    const groupInput = await screen.findByLabelText('GROUP FOR TASK ONE')
    fireEvent.change(groupInput, { target: { value: 'outside' } })
    fireEvent.click(screen.getByText('SAVE CHECKLIST'))

    await waitFor(() => {
      const put = vi.mocked(global.fetch).mock.calls.find(
        (c) => String(c[0]) === '/api/admin/checklists/c1' && (c[1] as RequestInit)?.method === 'PUT',
      )
      expect(put).toBeDefined()
      const body = JSON.parse(String((put![1] as RequestInit).body))
      expect(body.taskGroups).toEqual({ t1: 'OUTSIDE' })
    })
  })

  it('warns how many tasks a deleted list has', async () => {
    mockApi()
    vi.mocked(window.confirm).mockReturnValue(false)
    render(<TasksClient role="ADMIN" sessionVenueId="v1" />)

    await waitFor(() => expect(screen.getByLabelText('EDIT CHECKLIST OPENING')).toBeDefined())
    fireEvent.click(screen.getByLabelText('EDIT CHECKLIST OPENING'))
    await waitFor(() => expect(screen.getByText('EDIT CHECKLIST')).toBeDefined())

    fireEvent.click(screen.getByText('DELETE'))

    expect(window.confirm).toHaveBeenCalled()
    expect(String(vi.mocked(window.confirm).mock.calls.at(-1)![0])).toContain(
      'THIS LIST HAS 1 TASK; THE TASKS STAY, THE LIST IS REMOVED',
    )
  })

  // --- #165 section labels + grouped search ---

  it('labels every admin task row with its section (#165)', async () => {
    mockApi([TASK_BAR, TASK_KITCHEN])
    render(<TasksClient role="ADMIN" sessionVenueId="v1" />)

    await waitFor(() => expect(screen.getByTestId('available-task-tb')).toBeDefined())
    expect(screen.getByTestId('available-task-tb').textContent).toContain('[BAR] TURN ON DISHWASHER')
    expect(screen.getByTestId('available-task-tk').textContent).toContain('[KITCHEN] TURN ON DISHWASHER')
  })

  it('shows the section on the checklist card task preview (#165)', async () => {
    mockApi()
    render(<TasksClient role="ADMIN" sessionVenueId="v1" />)

    await waitFor(() => expect(screen.getAllByText('[BAR +1]').length).toBeGreaterThan(0))
  })

  it('groups the parent picker by section and saves the chosen parent (#165)', async () => {
    const fetchMock = mockApi([TASK_BAR, TASK_KITCHEN, TASK_EDIT])
    render(<TasksClient role="ADMIN" sessionVenueId="v1" />)

    await waitFor(() => expect(screen.getByTestId('available-task-te')).toBeDefined())
    fireEvent.click(within(screen.getByTestId('available-task-te')).getByText('EDIT'))
    await waitFor(() => expect(screen.getByText('EDIT TASK')).toBeDefined())

    const picker = screen.getByTestId('task-parent-select')
    const pickerInput = within(picker).getByPlaceholderText('NONE (TOP-LEVEL TASK)')
    // The label still points at the focusable input after the native Select swap.
    expect(screen.getByLabelText('Parent task (optional)')).toBe(pickerInput)
    fireEvent.focus(pickerInput)
    expect(within(picker).getByText('BAR')).toBeDefined()
    expect(within(picker).getByText('KITCHEN')).toBeDefined()
    fireEvent.click(within(picker).getAllByText('TURN ON DISHWASHER')[0])

    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(
        ([url, init]) => String(url) === '/api/admin/tasks/te' && init?.method === 'PUT',
      )
      expect(put).toBeDefined()
      const body = JSON.parse(String((put![1] as RequestInit).body))
      expect(body.parentTaskId).toBe('tb')
    })
  })

  it('groups the checklist + ADD A TASK picker by section and adds one task (#165)', async () => {
    mockApi([TASK_BAR, TASK_KITCHEN])
    render(<TasksClient role="ADMIN" sessionVenueId="v1" />)

    await waitFor(() => expect(screen.getByTestId('available-task-tb')).toBeDefined())
    fireEvent.click(screen.getByText('+ NEW CHECKLIST'))
    await waitFor(() => expect(screen.getByText('NEW CHECKLIST')).toBeDefined())

    const add = screen.getByTestId('cl-add-task')
    fireEvent.focus(within(add).getByPlaceholderText('+ ADD A TASK...'))
    expect(within(add).getByText('BAR')).toBeDefined()
    expect(within(add).getByText('KITCHEN')).toBeDefined()
    fireEvent.click(within(add).getAllByText('TURN ON DISHWASHER')[0])

    const groupInput = await screen.findByLabelText('GROUP FOR TURN ON DISHWASHER')
    expect(groupInput.closest('div.border')?.textContent).toContain('[BAR] TURN ON DISHWASHER')
  })

  // --- #166 offer a linked subtask after saving a new task ---

  it('offers a linked subtask after saving a new top-level task (#166)', async () => {
    mockApi()
    render(<TasksClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await waitFor(() => expect(screen.getByText('+ NEW TASK')).toBeDefined())
    fireEvent.click(screen.getByText('+ NEW TASK'))
    await waitFor(() => expect(screen.getByText('NEW TASK')).toBeDefined())

    fireEvent.change(screen.getByPlaceholderText('WIPE DOWN ALL BAR SURFACES'), {
      target: { value: 'NEWSPAPERS' },
    })
    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(() => expect(screen.getByText('ADD A SUBTASK?')).toBeDefined())
    expect(screen.getByText("CREATE A SUBTASK UNDER 'NEWSPAPERS'?")).toBeDefined()
    expect(screen.getByText('ADD SUBTASK')).toBeDefined()
    expect(screen.getByText('NO THANKS')).toBeDefined()
  })

  it('creates nothing when the subtask offer is dismissed (#166)', async () => {
    const fetchMock = mockApi()
    render(<TasksClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await waitFor(() => expect(screen.getByText('+ NEW TASK')).toBeDefined())
    fireEvent.click(screen.getByText('+ NEW TASK'))
    await waitFor(() => expect(screen.getByText('NEW TASK')).toBeDefined())

    fireEvent.change(screen.getByPlaceholderText('WIPE DOWN ALL BAR SURFACES'), {
      target: { value: 'NEWSPAPERS' },
    })
    fireEvent.click(screen.getByText('SAVE'))
    await waitFor(() => expect(screen.getByText('ADD A SUBTASK?')).toBeDefined())

    fireEvent.click(screen.getByText('NO THANKS'))

    await waitFor(() => expect(screen.queryByText('ADD A SUBTASK?')).toBeNull())
    expect(screen.queryByText('NEW SUBTASK')).toBeNull()
    const posts = fetchMock.mock.calls.filter(
      ([url, init]) => String(url) === '/api/admin/tasks' && init?.method === 'POST',
    )
    expect(posts).toHaveLength(1)
  })

  it('opens a prefilled child and copies the saved fields when confirmed (#166)', async () => {
    const fetchMock = mockApi([TASK_ONE, TASK_TWO])
    render(<TasksClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await waitFor(() => expect(screen.getByText('+ NEW TASK')).toBeDefined())
    fireEvent.click(screen.getByText('+ NEW TASK'))
    await waitFor(() => expect(screen.getByText('NEW TASK')).toBeDefined())

    fireEvent.change(screen.getByPlaceholderText('WIPE DOWN ALL BAR SURFACES'), {
      target: { value: 'NEWSPAPERS' },
    })
    const desc = document.querySelector('[contenteditable="true"]') as HTMLDivElement
    desc.innerHTML = '<p>USE THE GOOD PAPER</p>'
    fireEvent.input(desc)

    fireEvent.change(selectWithOption('KITCHEN'), { target: { value: 'd1' } })
    await waitFor(() => expect(() => selectWithOption('BAR')).not.toThrow())
    fireEvent.change(selectWithOption('BAR'), { target: { value: 'sec1' } })

    fireEvent.change(selectWithOption('TICK (CHECK OFF)'), { target: { value: 'TICK_NOTE' } })
    fireEvent.change(selectWithOption('DAILY'), { target: { value: 'WEEKLY' } })
    fireEvent.click(screen.getByText('MON'))
    fireEvent.click(screen.getByText('TUE'))

    // Outcome policy: opt into a task override and change it from the default.
    fireEvent.click(screen.getByRole('checkbox', { name: /Custom for this task/ }))
    fireEvent.click(screen.getByRole('button', { name: 'PARTIAL' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Require a reason/ }))

    fireEvent.focus(screen.getByPlaceholderText('Search lists...'))
    fireEvent.click(screen.getAllByText('OPENING').at(-1)!)

    fireEvent.focus(screen.getByPlaceholderText('Search guides...'))
    fireEvent.click(await screen.findByText('BAR SOP'))

    fireEvent.focus(screen.getByPlaceholderText('SEARCH ITEMS...'))
    fireEvent.click(await screen.findByText(/SPRAY BOTTLE/))

    fireEvent.click(screen.getByText('SAVE'))
    await waitFor(() => expect(screen.getByText('ADD A SUBTASK?')).toBeDefined())
    fireEvent.click(screen.getByText('ADD SUBTASK'))

    await waitFor(() => expect(screen.getByText('NEW SUBTASK')).toBeDefined())
    expect(
      (screen.getByPlaceholderText('WIPE DOWN ALL BAR SURFACES') as HTMLInputElement).value,
    ).toBe('NEWSPAPERS SUBTASK')

    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(() => {
      const posts = fetchMock.mock.calls.filter(
        ([url, init]) => String(url) === '/api/admin/tasks' && init?.method === 'POST',
      )
      expect(posts).toHaveLength(2)
      const body = JSON.parse(String((posts[1][1] as RequestInit).body))
      expect(body.parentTaskId).toBe('created-1')
      expect(body.title).toBe('NEWSPAPERS SUBTASK')
      expect(body.departmentId).toBe('d1')
      expect(body.sectionId).toBe('sec1')
      expect(body.completionType).toBe('TICK_NOTE')
      expect(body.scheduleType).toBe('WEEKLY')
      expect(body.scheduleDays).toEqual([1, 2])
      expect(body.checklistIds).toEqual(['c1'])
      expect(body.linkedItemId).toBe('i1')
      expect(String(body.description)).toContain('USE THE GOOD PAPER')
      expect(body.competencyGuideIds).toEqual(['g1'])
      expect(body.overrideOutcomes).toBe(true)
      expect(body.requireOutcomeReason).toBe(true)
      expect(body.allowedOutcomes).toEqual(['DONE', 'NOT_REQUIRED', 'DID_NOT_COMPLETE'])
      expect(body.requiredTrainingIds).toEqual([])
    })
  })

  it('never offers a subtask when editing an existing task (#166)', async () => {
    mockApi([TASK_ONE, TASK_TWO])
    render(<TasksClient role="ADMIN" sessionVenueId="v1" />)

    await waitFor(() => expect(screen.getByTestId('available-task-t2')).toBeDefined())
    fireEvent.click(within(screen.getByTestId('available-task-t2')).getByText('EDIT'))
    await waitFor(() => expect(screen.getByText('EDIT TASK')).toBeDefined())

    fireEvent.change(screen.getByPlaceholderText('WIPE DOWN ALL BAR SURFACES'), {
      target: { value: 'TASK TWO EDITED' },
    })
    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(() => expect(screen.queryByText('EDIT TASK')).toBeNull())
    expect(screen.queryByText('ADD A SUBTASK?')).toBeNull()
  })

  it('creates an ad-hoc custom task with assignee, scope, due date and rollover (#145)', async () => {
    const fetchMock = mockApi([TASK_ONE, TASK_TWO])
    const { container } = render(<TasksClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await waitFor(() => expect(screen.getByText('+ CUSTOM TASK')).toBeDefined())
    fireEvent.click(screen.getByText('+ CUSTOM TASK'))

    // The assignee options load when the compact modal opens.
    await waitFor(() => expect(screen.getByText('CUSTOM TASK')).toBeDefined())
    await waitFor(() => expect(screen.getByText('SAM LEE')).toBeDefined())

    fireEvent.change(screen.getByPlaceholderText('E.G. RESEARCH HIGH CHAIRS'), {
      target: { value: 'RESEARCH HIGH CHAIRS' },
    })

    const selectFor = (label: string) =>
      screen.getByText(label).parentElement!.querySelector('select') as HTMLSelectElement
    fireEvent.change(selectFor('Assign to (optional)'), { target: { value: 's1' } })
    fireEvent.change(selectFor('Department'), { target: { value: 'd1' } })

    const dueInput = container.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(dueInput, { target: { value: '2026-11-25' } })
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0]) // roll over
    fireEvent.click(checkboxes[1]) // thread
    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(() => {
      const posts = fetchMock.mock.calls.filter(
        ([url, init]) => String(url) === '/api/admin/tasks' && init?.method === 'POST',
      )
      expect(posts).toHaveLength(1)
      const body = JSON.parse(String((posts[0][1] as RequestInit).body))
      expect(body).toMatchObject({
        title: 'RESEARCH HIGH CHAIRS',
        venueId: 'v1',
        departmentId: 'd1',
        assignedToStaffId: 's1',
        isOneOff: true,
        dueDate: '2026-11-25',
        rolloverEnabled: true,
        isThread: true,
      })
    })
  })

  it('shows the thread panel for a thread task and fetches its comments (#145 Wave B)', async () => {
    const fetchMock = mockApi([
      { ...TASK_ONE, id: 'th1', title: 'RESEARCH HIGH CHAIRS', isThread: true, _count: { checklistLinks: 0 } },
    ])
    render(<TasksClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await waitFor(() => expect(screen.getByTestId('available-task-th1')).toBeDefined())
    fireEvent.click(within(screen.getByTestId('available-task-th1')).getByText('EDIT'))

    await waitFor(() => expect(screen.getByText('TASK THREAD')).toBeDefined())
    expect(
      fetchMock.mock.calls.some(([u]) => String(u) === '/api/admin/tasks/th1/comments'),
    ).toBe(true)
  })
})
