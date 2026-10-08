import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

import { WorkerGuidesClient } from '@/components/worker/WorkerGuidesClient'

const tracked = {
  id: 'g1',
  title: 'FOOD SAFETY BASICS',
  description: null,
  category: 'FOOD SAFETY',
  requiresSignOff: false,
  isOnboarding: true,
  isTracked: true,
  source: 'ONBOARDING',
  completed: false,
  department: null,
  steps: [
    {
      id: 's1', order: 0, heading: 'HYGIENE', content: 'Wash your hands.',
      imageUrl: null, videoUrl: null,
      links: [{ id: 'l1', kind: 'TASK', targetId: 't1', qty: null, note: null, target: { label: 'CHECK FRIDGE TEMPERATURES', missing: false } }],
    },
  ],
}

const reference = {
  id: 'g2',
  title: 'HOW TO READ THE FRIDGE TEMP LOG',
  description: 'Reference only.',
  category: 'BOH',
  requiresSignOff: false,
  isOnboarding: false,
  isTracked: false,
  source: 'DEPARTMENT',
  completed: false,
  department: { id: 'd1', name: 'BACK OF HOUSE' },
  steps: [
    { id: 's2', order: 0, heading: null, content: 'Find the clipboard.', imageUrl: null, videoUrl: null, links: [] },
  ],
}

function mockFetch(extra: Record<string, unknown> = {}, trackedOverride: unknown = tracked) {
  return vi.fn((url: string) => {
    const json = (data: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) })
    if (String(url).startsWith('/api/worker/guides')) {
      return json({ firstName: 'ALEX', items: [trackedOverride], reference: [reference], ...extra })
    }
    if (String(url).startsWith('/api/worker/pathway')) {
      return json({ pathway: null })
    }
    return json(null)
  }) as unknown as typeof fetch
}

function pointerEvent(type: string, props: Record<string, unknown>) {
  const e = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(e, props)
  return e
}

const rect = (left: number, top: number, width: number, height: number): DOMRect =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect)

describe('WorkerGuidesClient', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('shows tracked guides and untracked reference guides in the bible', async () => {
    globalThis.fetch = mockFetch()
    render(<WorkerGuidesClient />)
    await waitFor(() => expect(screen.getByText('FOOD SAFETY BASICS')).toBeTruthy())
    expect(screen.getByText('REFERENCE — READ ANY TIME')).toBeTruthy()
    expect(screen.getByText('HOW TO READ THE FRIDGE TEMP LOG')).toBeTruthy()
  })

  it('renders the task link inside a tracked guide step', async () => {
    globalThis.fetch = mockFetch()
    render(<WorkerGuidesClient />)
    fireEvent.click(await screen.findByText('FOOD SAFETY BASICS'))
    await waitFor(() => expect(screen.getByText('CHECK FRIDGE TEMPERATURES')).toBeTruthy())
  })

  it('opens a reference guide read-only with no complete button', async () => {
    globalThis.fetch = mockFetch()
    render(<WorkerGuidesClient />)
    fireEvent.click(await screen.findByText('HOW TO READ THE FRIDGE TEMP LOG'))
    await waitFor(() => expect(screen.getByText('REFERENCE — NOT TRACKED')).toBeTruthy())
    expect(screen.getByText('REFERENCE GUIDE — READ ONLY')).toBeTruthy()
    expect(screen.queryByText('MARK COMPLETE')).toBeNull()
  })

  it('offers MARK COMPLETE for a tracked guide', async () => {
    globalThis.fetch = mockFetch()
    render(<WorkerGuidesClient />)
    fireEvent.click(await screen.findByText('FOOD SAFETY BASICS'))
    await waitFor(() => expect(screen.getByText('MARK COMPLETE')).toBeTruthy())
  })

  it('renders a rich-text body above the steps', async () => {
    globalThis.fetch = mockFetch({}, { ...tracked, bodyHtml: '<h2>BEFORE YOU START</h2><p>Sanitise your station.</p>', guideType: 'HOW_TO' })
    render(<WorkerGuidesClient />)
    fireEvent.click(await screen.findByText('FOOD SAFETY BASICS'))
    await waitFor(() => expect(screen.getByText('Sanitise your station.')).toBeTruthy())
    expect(screen.getByText('BEFORE YOU START')).toBeTruthy()
    expect(screen.getByText('HOW TO')).toBeTruthy()
  })

  it('opens a step image full width and lets the reader dismiss it by clicking out', async () => {
    const withImage = { ...tracked, steps: [{ ...tracked.steps[0], imageUrl: '/uploads/step.png' }] }
    globalThis.fetch = mockFetch({}, withImage)
    render(<WorkerGuidesClient />)
    fireEvent.click(await screen.findByText('FOOD SAFETY BASICS'))
    const stepImage = await screen.findByAltText('step 1')
    expect(stepImage.className).toContain('w-full')
    fireEvent.click(stepImage)
    const dialog = screen.getByRole('dialog')
    expect(dialog.querySelector('img')?.getAttribute('src')).toBe('/uploads/step.png')
    fireEvent.click(dialog)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('pages a multi-image step with arrows, disabling the boundary direction', async () => {
    const withImages = {
      ...tracked,
      steps: [{ ...tracked.steps[0], imageUrls: ['/uploads/a.png', '/uploads/b.png', '/uploads/c.png'] }],
    }
    globalThis.fetch = mockFetch({}, withImages)
    render(<WorkerGuidesClient />)
    fireEvent.click(await screen.findByText('FOOD SAFETY BASICS'))

    const prev = (await screen.findByLabelText('Previous image')) as HTMLButtonElement
    const next = screen.getByLabelText('Next image') as HTMLButtonElement
    expect(screen.getByText('1 / 3')).toBeTruthy()
    expect(prev.disabled).toBe(true)
    expect(next.disabled).toBe(false)

    fireEvent.click(next)
    await waitFor(() => expect(screen.getByText('2 / 3')).toBeTruthy())
    expect(prev.disabled).toBe(false)

    fireEvent.click(next)
    await waitFor(() => expect(screen.getByText('3 / 3')).toBeTruthy())
    expect(next.disabled).toBe(true)

    fireEvent.click(screen.getByLabelText('Previous image'))
    await waitFor(() => expect(screen.getByText('2 / 3')).toBeTruthy())
  })

  it('shows authoring controls only when the user can edit', async () => {
    globalThis.fetch = mockFetch({ canEdit: true, canPublish: true })
    render(<WorkerGuidesClient />)
    expect(await screen.findByText('+ NEW')).toBeTruthy()
    fireEvent.click(await screen.findByText('FOOD SAFETY BASICS'))
    await waitFor(() => expect(screen.getByText('EDIT')).toBeTruthy())
  })

  it('groups the bible under bold collapsible folder headers', async () => {
    const folders = [
      { id: 'f1', name: 'BAR', sortOrder: 0 },
      { id: 'f2', name: 'KITCHEN', sortOrder: 1 },
    ]
    globalThis.fetch = mockFetch({ folders }, { ...tracked, folderId: 'f2' })
    render(<WorkerGuidesClient />)

    const kitchen = await screen.findByRole('button', { name: /KITCHEN/ })
    expect(kitchen.className).toContain('font-bold')
    expect(kitchen.className).toContain('text-base')
    // The reference guide is unfiled, so it lands in the UNFILED bucket.
    expect(screen.getByRole('button', { name: /UNFILED/ })).toBeTruthy()
    expect(screen.getByText('FOOD SAFETY BASICS')).toBeTruthy()

    fireEvent.click(kitchen)
    expect(screen.queryByText('FOOD SAFETY BASICS')).toBeNull()
    expect(screen.getByText('HOW TO READ THE FRIDGE TEMP LOG')).toBeTruthy()
  })

  it('files a guide into a folder when its grip is dragged onto the folder', async () => {
    const folders = [
      { id: 'f1', name: 'BAR', sortOrder: 0 },
      { id: 'f2', name: 'KITCHEN', sortOrder: 1 },
    ]
    const calls: { url: string; init?: RequestInit }[] = []
    globalThis.fetch = vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      const json = (data: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) })
      if (String(url).startsWith('/api/worker/guides')) return json({ firstName: 'ALEX', canEdit: true, folders, items: [tracked], reference: [reference] })
      if (String(url).startsWith('/api/worker/pathway')) return json({ pathway: null })
      return json({ ok: true })
    }) as unknown as typeof fetch

    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const key = (this as HTMLElement).dataset?.folderKey
      if (key === 'f1') return rect(0, 0, 300, 150)
      if (key === 'f2') return rect(0, 200, 300, 150)
      return rect(0, 0, 0, 0)
    })

    render(<WorkerGuidesClient />)
    await screen.findByText('FOOD SAFETY BASICS')

    const grip = document.querySelector('[data-guide-grip="1"]') as HTMLElement
    fireEvent(grip, pointerEvent('pointerdown', { pointerType: 'touch', pointerId: 1, button: 0, clientX: 10, clientY: 10 }))
    fireEvent(grip, pointerEvent('pointermove', { pointerId: 1, clientX: 150, clientY: 275 }))
    fireEvent(grip, pointerEvent('pointerup', { pointerId: 1, clientX: 150, clientY: 275 }))

    await waitFor(() => {
      const put = calls.find((c) => c.url === '/api/worker/guides/g1' && c.init?.method === 'PUT')
      expect(put).toBeDefined()
      expect(JSON.parse((put!.init as RequestInit).body as string)).toMatchObject({ folderId: 'f2' })
    })
  })

  it('reorders folders when a folder grip is dragged onto another folder', async () => {
    const folders = [
      { id: 'f1', name: 'BAR', sortOrder: 0 },
      { id: 'f2', name: 'KITCHEN', sortOrder: 1 },
    ]
    const calls: { url: string; init?: RequestInit }[] = []
    globalThis.fetch = vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      const json = (data: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) })
      if (String(url).startsWith('/api/worker/guides')) return json({ firstName: 'ALEX', canEdit: true, folders, items: [tracked], reference: [reference] })
      if (String(url).startsWith('/api/worker/pathway')) return json({ pathway: null })
      return json({ ok: true })
    }) as unknown as typeof fetch

    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const key = (this as HTMLElement).dataset?.folderHeader
      if (key === 'f1') return rect(0, 0, 300, 40)
      if (key === 'f2') return rect(0, 200, 300, 40)
      return rect(0, 0, 0, 0)
    })

    render(<WorkerGuidesClient />)
    await screen.findByRole('button', { name: /KITCHEN/ })

    const grips = document.querySelectorAll('[data-folder-grip="1"]')
    expect(grips.length).toBe(2)
    const first = grips[0] as HTMLElement
    fireEvent(first, pointerEvent('pointerdown', { pointerType: 'touch', pointerId: 1, button: 0, clientX: 10, clientY: 20 }))
    fireEvent(first, pointerEvent('pointermove', { pointerId: 1, clientX: 150, clientY: 220 }))
    fireEvent(first, pointerEvent('pointerup', { pointerId: 1, clientX: 150, clientY: 220 }))

    await waitFor(() => {
      const put = calls.find((c) => c.url === '/api/worker/guide-folders' && c.init?.method === 'PUT')
      expect(put).toBeDefined()
      expect(JSON.parse((put!.init as RequestInit).body as string)).toMatchObject({ orderedIds: ['f2', 'f1'] })
    })
  })
})
