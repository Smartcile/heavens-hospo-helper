import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { TrainingEditModal } from '@/components/admin/TrainingEditModal'

function mockFetch() {
  vi.spyOn(global, 'fetch').mockImplementation((url: string | URL | Request) => {
    const u = String(url)
    let body: unknown = []
    if (/\/api\/admin\/training\/[^/]+$/.test(u)) {
      body = {
        id: 'm1', title: 'COFFEE MACHINE', description: null, category: null, kind: 'TRAINING',
        departmentId: null, linkedTaskId: null, requiresSignOff: false, isOnboarding: false, venueId: 'v1',
        steps: [{ title: 'STEP', content: 'DO IT', imageUrl: null, videoUrl: null, linkedTaskId: null, linkedChecklistId: null, stepTasks: [], stepModules: [] }],
        resourceSections: [], moduleDepartments: [], moduleTasks: [],
      }
    }
    return Promise.resolve({ ok: true, json: async () => body } as Response)
  })
}

describe('TrainingEditModal', () => {
  beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); mockFetch() })
  afterEach(() => { vi.restoreAllMocks() })

  it('renders loading then the loaded module (no hook-order crash)', async () => {
    const { getByText, getByDisplayValue } = render(
      <TrainingEditModal moduleId="m1" onClose={() => {}} onSaved={() => {}} />
    )
    expect(getByText('LOADING')).toBeTruthy()
    await waitFor(() => expect(getByDisplayValue('COFFEE MACHINE')).toBeTruthy())
  })

  it('shows the EDIT MODULE title', () => {
    const { getByText } = render(
      <TrainingEditModal moduleId="m1" onClose={() => {}} onSaved={() => {}} />
    )
    expect(getByText('EDIT MODULE')).toBeTruthy()
  })
})
