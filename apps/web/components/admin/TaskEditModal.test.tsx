import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { TaskEditModal } from '@/components/admin/TaskEditModal'

const LOADED_TASK = {
  id: 't1', title: 'CLEAN BAR', description: null, venueId: 'v1',
  departmentId: null, sectionId: null, completionType: 'TICK', scheduleType: 'DAILY',
  scheduleDays: [], customCron: null, intervalMonths: 1, monthlyOption: null, monthlyDay: null,
  requiredTraining: [],
}

const PARENT_TASK = {
  ...LOADED_TASK, title: 'NEWSPAPERS',
  subtasks: [{ id: 'c1', title: 'THROW OUT PAPERS', isActive: true, subtaskOrder: 0 }],
}

const CHILD_TASK = {
  ...LOADED_TASK, id: 'c1', title: 'THROW OUT PAPERS', parentTaskId: 't1',
  departmentId: 'd1', sectionId: 'sec1', section: { id: 'sec1', name: 'BAR' },
}

function mockFetch(overrides?: { task?: unknown; allTasks?: unknown[] }) {
  vi.spyOn(global, 'fetch').mockImplementation((url: string | URL | Request) => {
    const u = String(url)
    let body: unknown = []
    if (u.endsWith('/api/admin/tasks')) {
      body = overrides?.allTasks ?? []
    } else if (u.includes('/api/admin/tasks/')) {
      body = overrides?.task ?? LOADED_TASK
    } else if (u.includes('/api/admin/venues')) {
      body = [{ id: 'v1', name: 'MAIN' }]
    }
    return Promise.resolve({ ok: true, json: async () => body } as Response)
  })
}

describe('TaskEditModal', () => {
  beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); mockFetch() })
  afterEach(() => { vi.restoreAllMocks() })

  it('renders loading then the loaded task title (no hook-order crash)', async () => {
    const { getByText, getByDisplayValue } = render(
      <TaskEditModal taskId="t1" role="ADMIN" onClose={() => {}} onSaved={() => {}} />
    )
    expect(getByText('LOADING')).toBeTruthy()
    await waitFor(() => expect(getByDisplayValue('CLEAN BAR')).toBeTruthy())
  })

  it('shows the EDIT TASK title', () => {
    const { getByText } = render(
      <TaskEditModal taskId="t1" role="MANAGER" onClose={() => {}} onSaved={() => {}} />
    )
    expect(getByText('EDIT TASK')).toBeTruthy()
  })

  it('labels a subtask row with its section (#165)', async () => {
    mockFetch({ task: PARENT_TASK, allTasks: [PARENT_TASK, CHILD_TASK] })
    const { getByText, getByDisplayValue } = render(
      <TaskEditModal taskId="t1" role="ADMIN" onClose={() => {}} onSaved={() => {}} />
    )
    await waitFor(() => expect(getByDisplayValue('NEWSPAPERS')).toBeTruthy())
    expect(getByText('[BAR]')).toBeTruthy()
  })
})
