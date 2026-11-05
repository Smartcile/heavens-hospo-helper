import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { WorkerGuideEditor } from '@/components/worker/WorkerGuideEditor'

const OPTIONS = {
  canEdit: true,
  canPublish: true,
  departments: [{ id: 'd1', name: 'BAR' }],
  tasks: [{ id: 't1', title: 'CLEAN THE MACHINE', departmentId: null }],
  positions: [{ id: 'p1', name: 'BARISTA' }],
  linkTargets: {
    ITEM: [{ value: 'i1', label: 'CLOTH' }],
    TASK: [{ value: 't1', label: 'CLEAN THE MACHINE' }],
    CHECKLIST: [],
    GUIDE: [],
    SECTION: [{ value: 's1', label: 'BAR → FRONT' }],
    RECIPE: [],
  },
}

const EXISTING_GUIDE = {
  id: 'g1',
  title: 'CLEANING BASICS',
  description: null,
  category: null,
  guideType: 'HOW_TO',
  bodyHtml: null,
  isTracked: true,
  requiresSignOff: false,
  status: 'DRAFT',
  steps: [
    {
      id: 's1',
      heading: null,
      content: 'Wipe the machine',
      imageUrl: null,
      imageUrls: [],
      videoUrl: null,
      videoPath: null,
      links: [{ id: 'l1', kind: 'ITEM', targetId: 'i1', qty: null, note: null, order: 0 }],
    },
  ],
  taskGuides: [],
  audiences: [{ kind: 'DEPARTMENT', targetId: 'd1' }],
}

type FetchSpy = typeof fetch & { mock: { calls: unknown[][] } }

function mockFetch(guide: unknown = null) {
  return vi.fn((url: string, init?: RequestInit) => {
    const json = (data: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) })
    const u = String(url)
    if (u.startsWith('/api/worker/guides/options')) return json(OPTIONS)
    if (guide && u === '/api/worker/guides/g1' && !init?.method) return json(guide)
    if (u.endsWith('/api/worker/guides') && init?.method === 'POST') return json({ id: 'g9' })
    if (u === '/api/worker/guides/g1' && init?.method === 'PUT') return json({ id: 'g1' })
    return json(null)
  }) as unknown as FetchSpy
}

function savedBody(spy: FetchSpy, method: 'POST' | 'PUT') {
  const call = spy.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === method)
  return JSON.parse((call![1] as RequestInit).body as string)
}

describe('WorkerGuideEditor', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('creates a new guide with a type, body and linked task', async () => {
    const spy = mockFetch()
    globalThis.fetch = spy
    const onSaved = vi.fn()

    render(<WorkerGuideEditor guideId={null} canPublish role="MANAGER" onClose={() => {}} onSaved={onSaved} />)

    expect(await screen.findByText('NEW GUIDE')).toBeTruthy()

    // The legacy department + onboarding targeting controls are gone.
    expect(screen.queryByText('Department')).toBeNull()
    expect(screen.queryByText('Onboarding')).toBeNull()

    fireEvent.change(screen.getByPlaceholderText('FOOD SAFETY BASICS'), { target: { value: 'how to clean the machine' } })
    // Link a task (toggle the row).
    fireEvent.click(await screen.findByText('CLEAN THE MACHINE'))
    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(() => {
      const body = savedBody(spy, 'POST')
      expect(body.title).toBe('how to clean the machine')
      expect(body.guideType).toBe('HOW_TO')
      expect(body.taskGuides).toEqual([{ taskId: 't1', isRequiredForCompetency: false }])
      expect(body).not.toHaveProperty('departmentId')
      expect(body).not.toHaveProperty('isOnboarding')
    })
    expect(onSaved).toHaveBeenCalled()
  })

  it('renders the steps section after the linked-tasks picker', async () => {
    globalThis.fetch = mockFetch()
    render(<WorkerGuideEditor guideId={null} canPublish role="MANAGER" onClose={() => {}} onSaved={() => {}} />)
    await screen.findByText('NEW GUIDE')

    const linked = screen.getByText('Link to tasks')
    const steps = screen.getByText('Steps (optional)')
    expect(linked.compareDocumentPosition(steps) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('adds an "applies to" audience and sends it as audiences', async () => {
    const spy = mockFetch()
    globalThis.fetch = spy
    render(<WorkerGuideEditor guideId={null} canPublish role="MANAGER" onClose={() => {}} onSaved={() => {}} />)
    await screen.findByText('NEW GUIDE')

    fireEvent.change(screen.getByPlaceholderText('FOOD SAFETY BASICS'), { target: { value: 'ROLE GUIDE' } })
    const picker = screen.getByPlaceholderText('+ ADD DEPARTMENT / SECTION / ROLE')
    fireEvent.focus(picker)
    fireEvent.click(screen.getByRole('button', { name: 'BARISTA' }))
    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(() => {
      expect(savedBody(spy, 'POST').audiences).toEqual([{ kind: 'POSITION', targetId: 'p1' }])
    })
  })

  it('adds a step link and sends it as steps[].links', async () => {
    const spy = mockFetch()
    globalThis.fetch = spy
    render(<WorkerGuideEditor guideId={null} canPublish role="MANAGER" onClose={() => {}} onSaved={() => {}} />)
    await screen.findByText('NEW GUIDE')

    fireEvent.change(screen.getByPlaceholderText('FOOD SAFETY BASICS'), { target: { value: 'LINK GUIDE' } })
    fireEvent.change(screen.getByPlaceholderText('What to do...'), { target: { value: 'Grab the cloth' } })

    const linkPicker = screen.getByPlaceholderText('+ LINK A TOOL / TASK / LIST / GUIDE')
    fireEvent.focus(linkPicker)
    fireEvent.click(screen.getByRole('button', { name: 'CLOTH' }))
    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(() => {
      expect(savedBody(spy, 'POST').steps[0].links).toEqual([
        { kind: 'ITEM', targetId: 'i1', qty: null, note: null },
      ])
    })
  })

  it('loads existing audiences and step links and round-trips them on save', async () => {
    const spy = mockFetch(EXISTING_GUIDE)
    globalThis.fetch = spy
    render(<WorkerGuideEditor guideId="g1" canPublish role="MANAGER" onClose={() => {}} onSaved={() => {}} />)

    expect(await screen.findByDisplayValue('CLEANING BASICS')).toBeTruthy()
    // The stored link is labelled from the options payload, not shown as REMOVED.
    expect(screen.getByText('CLOTH')).toBeTruthy()
    // The stored audience chip is shown.
    expect(screen.getByText('BAR')).toBeTruthy()

    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(() => {
      const body = savedBody(spy, 'PUT')
      expect(body.audiences).toEqual([{ kind: 'DEPARTMENT', targetId: 'd1' }])
      expect(body.steps[0].links).toEqual([
        { kind: 'ITEM', targetId: 'i1', qty: null, note: null },
      ])
    })
  })

  it('shows the re-training control only on edit, and only for managers', async () => {
    globalThis.fetch = mockFetch(EXISTING_GUIDE)
    const { rerender } = render(
      <WorkerGuideEditor guideId="g1" canPublish role="STAFF" onClose={() => {}} onSaved={() => {}} />,
    )
    await screen.findByDisplayValue('CLEANING BASICS')
    expect(screen.queryByText(/Require re-training/)).toBeNull()

    rerender(<WorkerGuideEditor guideId="g1" canPublish role="MANAGER" onClose={() => {}} onSaved={() => {}} />)
    await screen.findByDisplayValue('CLEANING BASICS')
    expect(screen.getByText(/Require re-training/)).toBeTruthy()

    // Creating a guide never offers it.
    rerender(<WorkerGuideEditor guideId={null} canPublish role="MANAGER" onClose={() => {}} onSaved={() => {}} />)
    await screen.findByText('NEW GUIDE')
    expect(screen.queryByText(/Require re-training/)).toBeNull()
  })

  it('sends requireRetrain + changeSummary on PUT when a manager ticks it', async () => {
    const spy = mockFetch(EXISTING_GUIDE)
    globalThis.fetch = spy
    render(<WorkerGuideEditor guideId="g1" canPublish role="MANAGER" onClose={() => {}} onSaved={() => {}} />)
    await screen.findByDisplayValue('CLEANING BASICS')

    fireEvent.click(screen.getByText(/Require re-training/))
    fireEvent.change(screen.getByPlaceholderText('e.g. NEW GLASS-RINSE STEP ADDED'), {
      target: { value: 'Added rinse step' },
    })
    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(() => {
      const body = savedBody(spy, 'PUT')
      expect(body.requireRetrain).toBe(true)
      expect(body.changeSummary).toBe('Added rinse step')
    })
  })
})
