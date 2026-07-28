import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { TaskEditModal } from '@/components/admin/TaskEditModal'

function mockFetch() {
  vi.spyOn(global, 'fetch').mockImplementation((url: string | URL | Request) => {
    const u = String(url)
    let body: unknown = []
    if (u.includes('/api/admin/tasks/')) {
      body = {
        id: 't1', title: 'CLEAN BAR', description: null, venueId: 'v1',
        departmentId: null, sectionId: null, completionType: 'TICK', scheduleType: 'DAILY',
        scheduleDays: [], customCron: null, intervalMonths: 1, monthlyOption: null, monthlyDay: null,
        requiredTraining: [],
      }
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
})
