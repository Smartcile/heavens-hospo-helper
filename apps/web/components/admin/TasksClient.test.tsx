import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, waitFor, screen } from '@testing-library/react'

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

const CHECKLIST = {
  id: 'c1', name: 'OPENING', description: null, venueId: 'v1',
  departmentId: null, sectionId: null, appearFromTime: null, activatedOn: null,
  allowedOutcomes: [], requireOutcomeReason: false, department: null, section: null,
  tasks: [{ id: 't1', title: 'TASK ONE', isActive: true, version: 1 }],
}

function mockApi(tasks: unknown[] = [TASK_ONE, TASK_TWO]) {
  const fetchMock = vi.mocked(global.fetch)
  fetchMock.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    if (u.includes('/progress')) return json({ success: true })
    if (u.startsWith('/api/admin/tasks')) return json(tasks)
    if (u === '/api/admin/venues') return json([{ id: 'v1', name: 'VENUE' }])
    if (u === '/api/admin/departments') return json([{ id: 'd1', name: 'KITCHEN', venueId: 'v1', colour: null }])
    if (u === '/api/admin/sections') return json([])
    if (u.startsWith('/api/admin/guides')) return json([])
    if (u.startsWith('/api/admin/checklists')) return json([CHECKLIST])
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

  it('restores the saved scroll position on mount (#16)', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    sessionStorage.setItem('hospo-tasks-scroll:window', '240')
    mockApi()

    render(<TasksClient role="ADMIN" sessionVenueId="v1" />)

    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 240))
  })
})
