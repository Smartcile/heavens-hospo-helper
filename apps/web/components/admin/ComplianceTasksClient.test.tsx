import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}))

import { ComplianceTasksClient } from '@/components/admin/ComplianceTasksClient'

const summary = {
  health: { provedX: 1, provedY: 3, alertX: 1, alertY: 4 },
  counts: { active: 4, draft: 1, archived: 1 },
  tasks: [
    {
      id: 't1',
      title: 'FRIDGE 1 — WALK-IN TEMP',
      description: null,
      venueId: 'v1',
      departmentId: 'd1',
      sectionId: null,
      completionType: 'READING',
      scheduleType: 'DAILY',
      scheduleDays: [],
      customCron: null,
      intervalMonths: 1,
      monthlyOption: null,
      monthlyDay: null,
      isActive: true,
      isOneOff: false,
      dueDate: null,
      status: 'ACTIVE',
      hsCategory: 'EQUIPMENT',
      linkedItemId: 'i1',
      readingUnit: '°C',
      readingMin: 0,
      readingMax: 5,
      criticalMin: null,
      criticalMax: 10,
      createdAt: '2026-08-01T00:00:00Z',
      department: { id: 'd1', name: 'BACK OF HOUSE', colour: '#FACC15' },
      section: null,
      linkedItem: { id: 'i1', name: 'WALK-IN FRIDGE', storageType: 'CHILLED' },
      completions: [
        { id: 'c1', value: 4, valueStatus: 'PASS', completedAt: '2026-08-13T08:00:00Z' },
        { id: 'c2', value: 5, valueStatus: 'PASS', completedAt: '2026-08-12T08:00:00Z' },
        { id: 'c3', value: 7, valueStatus: 'FAIL', completedAt: '2026-08-11T08:00:00Z' },
      ],
      openAlertCount: 1,
    },
    {
      id: 't2',
      title: 'HOT HOLD — BAIN MARIE',
      description: null,
      venueId: 'v1',
      departmentId: 'd1',
      sectionId: null,
      completionType: 'READING',
      scheduleType: 'DAILY',
      scheduleDays: [],
      customCron: null,
      intervalMonths: 1,
      monthlyOption: null,
      monthlyDay: null,
      isActive: true,
      isOneOff: false,
      dueDate: null,
      status: 'ACTIVE',
      hsCategory: 'FOOD',
      linkedItemId: null,
      readingUnit: '°C',
      readingMin: 60,
      readingMax: null,
      criticalMin: null,
      criticalMax: null,
      createdAt: '2026-08-01T00:00:00Z',
      department: { id: 'd1', name: 'BACK OF HOUSE', colour: '#FACC15' },
      section: null,
      linkedItem: null,
      completions: [],
      openAlertCount: 0,
    },
    {
      id: 't3',
      title: 'PEST TRAP INSPECTION',
      description: null,
      venueId: 'v1',
      departmentId: 'd1',
      sectionId: null,
      completionType: 'TICK',
      scheduleType: 'MONTHLY',
      scheduleDays: [],
      customCron: null,
      intervalMonths: 1,
      monthlyOption: 'FIRST_DAY',
      monthlyDay: null,
      isActive: true,
      isOneOff: false,
      dueDate: null,
      status: 'ACTIVE',
      hsCategory: 'FACILITY',
      linkedItemId: null,
      readingUnit: null,
      readingMin: null,
      readingMax: null,
      criticalMin: null,
      criticalMax: null,
      createdAt: '2026-08-01T00:00:00Z',
      department: { id: 'd1', name: 'BACK OF HOUSE', colour: '#FACC15' },
      section: null,
      linkedItem: null,
      completions: [],
      openAlertCount: 0,
    },
    {
      id: 't4',
      title: 'DRAFT CHECK',
      description: null,
      venueId: 'v1',
      departmentId: null,
      sectionId: null,
      completionType: 'READING',
      scheduleType: 'DAILY',
      scheduleDays: [],
      customCron: null,
      intervalMonths: 1,
      monthlyOption: null,
      monthlyDay: null,
      isActive: true,
      isOneOff: false,
      dueDate: null,
      status: 'DRAFT',
      hsCategory: 'TEAM',
      linkedItemId: null,
      readingUnit: '°C',
      readingMin: 0,
      readingMax: 5,
      criticalMin: null,
      criticalMax: null,
      createdAt: '2026-08-01T00:00:00Z',
      department: null,
      section: null,
      linkedItem: null,
      completions: [],
      openAlertCount: 0,
    },
  ],
  catalog: [{ id: 'i1', name: 'WALK-IN FRIDGE', storageType: 'CHILLED', unit: 'EA' }],
  recentAlerts: [],
  todayKey: '2026-08-13',
}

/** Route by URL — the client fires three parallel fetches (summary, departments, sections). */
function mockRoutes(routes: Record<string, unknown>) {
  return vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    const hit = Object.entries(routes).find(([key]) => url.includes(key))?.[1]
    return {
      ok: true,
      json: async () => hit ?? [],
    } as Response
  })
}

describe('ComplianceTasksClient', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('renders the health widget and task table grouped by category', async () => {
    mockRoutes({ summary, departments: [], sections: [] })

    render(<ComplianceTasksClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    expect(await screen.findByText('TASK MANAGER')).toBeDefined()
    expect(screen.getByText('TASKS PROVED')).toBeDefined()
    expect(screen.getByText(/PASS: 2\/3/)).toBeDefined() // t1: 2 pass of 3
    expect(screen.getAllByText('EQUIPMENT').length).toBeGreaterThan(0)
    expect(screen.getAllByText('FOOD').length).toBeGreaterThan(0)
    expect(screen.getAllByText('FACILITY').length).toBeGreaterThan(0)
    expect(screen.getByText(/1 ALERT/)).toBeDefined() // t1 open alert link
    expect(screen.getByText('0–5°C')).toBeDefined() // reading band on t1
    expect(screen.getByText('≥ 60°C')).toBeDefined() // reading band on t2
    expect(screen.getByText(/LINKED: WALK-IN FRIDGE/)).toBeDefined()
  })

  it('DRAFT tab shows only draft tasks', async () => {
    mockRoutes({ summary, departments: [], sections: [] })

    render(<ComplianceTasksClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findByText('TASK MANAGER')
    fireEvent.click(screen.getByText(/DRAFT TASKS/))
    expect(screen.getByText('DRAFT CHECK')).toBeDefined()
    expect(screen.queryByText('FRIDGE 1 — WALK-IN TEMP')).toBeNull()
  })

  it('grid view renders task cards', async () => {
    mockRoutes({ summary, departments: [], sections: [] })

    render(<ComplianceTasksClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findByText('TASK MANAGER')
    fireEvent.click(screen.getByText('GRID'))
    expect(screen.getByText('FRIDGE 1 — WALK-IN TEMP')).toBeDefined()
  })

  it('+ ADD opens the form; GFMP FRIDGE preset fills the band fields; save sends the reading fields', async () => {
    const fetchMock = mockRoutes({ summary, departments: [], sections: [] })

    render(<ComplianceTasksClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await screen.findByText('TASK MANAGER')
    fireEvent.click(screen.getAllByText('+ ADD TASK')[0])

    const title = await screen.findByPlaceholderText('TASK TITLE') as HTMLInputElement
    fireEvent.change(title, { target: { value: 'FREEZER 2 TEMP' } })

    fireEvent.click(screen.getByText('FREEZER'))
    const min = screen.getByLabelText('MIN (PASS)') as HTMLInputElement
    const max = screen.getByLabelText('MAX (PASS)') as HTMLInputElement
    expect(min.value).toBe('-25')
    expect(max.value).toBe('-18')

    fireEvent.click(screen.getByText('CREATE TASK'))
    await waitFor(() => {
      const post = fetchMock.mock.calls.find((c) => c[0] === '/api/admin/tasks' && c[1]?.method === 'POST')
      expect(post).toBeDefined()
      const body = JSON.parse(post![1].body as string)
      expect(body.hsCategory).toBe('FOOD')
      expect(body.completionType).toBe('READING')
      expect(body.readingMin).toBe(-25)
      expect(body.readingMax).toBe(-18)
      expect(body.readingUnit).toBe('°C')
    })
  })
})
