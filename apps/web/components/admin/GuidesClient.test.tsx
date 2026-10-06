import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { GuidesClient } from '@/components/admin/GuidesClient'

vi.mock('@/lib/active-venue', () => ({ getActiveVenueId: () => 'v1' }))

const GUIDES = [
  {
    id: 'g1', title: 'FOOD SAFETY BASICS', description: null, category: 'FOOD SAFETY',
    venueId: 'v1', departmentId: null, status: 'PUBLISHED', isTracked: true,
    isOnboarding: true, requiresSignOff: false, legacyToolsNote: null,
    steps: [{ id: 's1', heading: null, content: 'Wash hands' }],
    taskGuides: [], audiences: [], department: null,
  },
  {
    id: 'g2', title: 'HOW TO READ THE FRIDGE TEMP LOG', description: null, category: 'BOH',
    venueId: 'v1', departmentId: null, status: 'DRAFT', isTracked: false,
    isOnboarding: false, requiresSignOff: false, legacyToolsNote: null,
    steps: [], taskGuides: [], audiences: [], department: null,
  },
]

// The single-guide GET resolves step links + adds image/video fields.
const RESOLVED_GUIDE = {
  ...GUIDES[0],
  guideType: 'HOW_TO',
  bodyHtml: '<p>Always sanitise.</p>',
  steps: [{ id: 's1', heading: null, content: 'Wash hands thoroughly', imageUrl: null, videoUrl: null, links: [] }],
}

function mockFetch() {
  return vi.fn((url: string) => {
    const json = (data: unknown) => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(data),
      blob: () => Promise.resolve(new Blob(['pdf'], { type: 'application/pdf' })),
      headers: { get: () => null },
    })
    const u = String(url)
    if (u === '/api/admin/guides/g1') return json(RESOLVED_GUIDE)
    if (u.startsWith('/api/admin/guides?') || u === '/api/admin/guides') return json(GUIDES)
    if (u.startsWith('/api/admin/guides/link-targets')) return json({ ITEM: [], TASK: [], CHECKLIST: [], GUIDE: [], SECTION: [], RECIPE: [] })
    if (u.startsWith('/api/admin/positions')) return json([])
    if (u.startsWith('/api/admin/departments')) return json([])
    if (u.startsWith('/api/admin/tasks')) return json([])
    if (u.startsWith('/api/admin/venues')) return json([{ id: 'v1', name: 'DEMO VENUE — AUCKLAND' }])
    return json(null)
  }) as unknown as typeof fetch
}

function cardFor(title: string): HTMLElement {
  return screen.getByText(title).closest('.bg-grey-dark') as HTMLElement
}

// One guide filed into WINE, one left unfiled.
const FOLDERS = [{ id: 'f1', name: 'WINE', venueId: 'v1', sortOrder: 0 }]
const FILED_GUIDES = [
  { ...GUIDES[0], folderId: 'f1' },
  { ...GUIDES[1], folderId: null },
]

function mockFetchWithFolders() {
  return vi.fn((url: string) => {
    const json = (data: unknown) => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve(data),
      blob: () => Promise.resolve(new Blob(['pdf'], { type: 'application/pdf' })),
      headers: { get: () => null },
    })
    const u = String(url)
    if (u.startsWith('/api/admin/guide-folders')) return json(FOLDERS)
    if (u.startsWith('/api/admin/guides?') || u === '/api/admin/guides') return json(FILED_GUIDES)
    if (u.startsWith('/api/admin/guides/link-targets')) return json({ ITEM: [], TASK: [], CHECKLIST: [], GUIDE: [], SECTION: [], RECIPE: [] })
    if (u.startsWith('/api/admin/positions')) return json([])
    if (u.startsWith('/api/admin/departments')) return json([])
    if (u.startsWith('/api/admin/tasks')) return json([])
    if (u.startsWith('/api/admin/venues')) return json([{ id: 'v1', name: 'DEMO VENUE — AUCKLAND' }])
    return json(null)
  }) as unknown as typeof fetch
}

// A venue with one menu ("TAP BEER") holding two products.
function mockFetchWithMenu() {
  return vi.fn((url: string) => {
    const json = (data: unknown) => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve(data),
      blob: () => Promise.resolve(new Blob(['pdf'], { type: 'application/pdf' })),
      headers: { get: () => null },
    })
    const u = String(url)
    if (u.startsWith('/api/admin/guides/link-targets')) {
      return json({
        ITEM: [], TASK: [], CHECKLIST: [], GUIDE: [], SECTION: [], RECIPE: [],
        MENU_ITEM: [
          { value: 'p1', label: 'ASAHI — $16.50', name: 'ASAHI', price: 16.5, description: null, imageUrl: null, dietaryInfo: null },
          { value: 'p2', label: 'PERONI — $16.50', name: 'PERONI', price: 16.5, description: null, imageUrl: null, dietaryInfo: null },
        ],
        MENU: [{ value: 'menu1', label: 'TAP BEER', itemIds: ['p1', 'p2'] }],
      })
    }
    if (u.startsWith('/api/admin/guides?') || u === '/api/admin/guides') return json(GUIDES)
    if (u.startsWith('/api/admin/positions')) return json([])
    if (u.startsWith('/api/admin/departments')) return json([])
    if (u.startsWith('/api/admin/tasks')) return json([])
    if (u.startsWith('/api/admin/venues')) return json([{ id: 'v1', name: 'DEMO VENUE — AUCKLAND' }])
    return json(null)
  }) as unknown as typeof fetch
}

function selectWithOptionValue(value: string): HTMLSelectElement | undefined {
  return [...document.querySelectorAll('select')].find((s) =>
    [...s.options].some((o) => o.value === value),
  ) as HTMLSelectElement | undefined
}

describe('GuidesClient', () => {
  beforeEach(() => { globalThis.fetch = mockFetch() })
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

  it('lists guides with status badges', async () => {
    render(<GuidesClient role="ADMIN" sessionVenueId="v1" />)
    await waitFor(() => expect(screen.getByText('FOOD SAFETY BASICS')).toBeTruthy())
    expect(screen.getByText('HOW TO READ THE FRIDGE TEMP LOG')).toBeTruthy()
  })

  it('downloads the single-guide PDF from a card', async () => {
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:fake'), revokeObjectURL: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(<GuidesClient role="ADMIN" sessionVenueId="v1" />)
    await waitFor(() => expect(screen.getByText('FOOD SAFETY BASICS')).toBeTruthy())

    fireEvent.click([...cardFor('FOOD SAFETY BASICS').querySelectorAll('button')].find((b) => b.textContent === '⬇ PDF')!)
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith('/api/admin/guides/g1/pdf'))
  })

  it('bulk downloads the selected guides as one PDF', async () => {
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:fake'), revokeObjectURL: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(<GuidesClient role="ADMIN" sessionVenueId="v1" />)
    await waitFor(() => expect(screen.getByText('FOOD SAFETY BASICS')).toBeTruthy())

    fireEvent.click(screen.getByText('SELECT ALL'))
    expect(screen.getByText('⬇ PDF (2)')).toBeTruthy()
    fireEvent.click(screen.getByText('⬇ PDF (2)'))
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith('/api/admin/guides/pdf?ids=g1,g2&venueId=v1'))
  })

  it('opens the worker-style preview from a card', async () => {
    render(<GuidesClient role="ADMIN" sessionVenueId="v1" />)
    await waitFor(() => expect(screen.getByText('FOOD SAFETY BASICS')).toBeTruthy())

    fireEvent.click([...cardFor('FOOD SAFETY BASICS').querySelectorAll('button')].find((b) => b.textContent === 'VIEW')!)
    // The resolved step body only exists in the popup, not the card.
    await waitFor(() => expect(screen.getByText('Wash hands thoroughly')).toBeTruthy())
    expect(screen.getByText('Always sanitise.')).toBeTruthy()
  })

  it('groups guides into collapsible folders with an UNFILED bucket', async () => {
    globalThis.fetch = mockFetchWithFolders()
    render(<GuidesClient role="ADMIN" sessionVenueId="v1" />)
    await waitFor(() => expect(screen.getByText(/WINE/)).toBeTruthy())
    expect(screen.getByText(/UNFILED/)).toBeTruthy()

    // Both cards start visible under their folders.
    expect(screen.getByText('FOOD SAFETY BASICS')).toBeTruthy()
    expect(screen.getByText('HOW TO READ THE FRIDGE TEMP LOG')).toBeTruthy()

    // Collapsing WINE hides its card but leaves the other folder alone.
    fireEvent.click(screen.getByText(/WINE/))
    await waitFor(() => expect(screen.queryByText('FOOD SAFETY BASICS')).toBeNull())
    expect(screen.getByText('HOW TO READ THE FRIDGE TEMP LOG')).toBeTruthy()
  })

  it('pulls a menu\'s products into the reference table on SYNC FROM MENU', async () => {
    globalThis.fetch = mockFetchWithMenu()
    render(<GuidesClient role="ADMIN" sessionVenueId="v1" />)
    await waitFor(() => expect(screen.getByText('FOOD SAFETY BASICS')).toBeTruthy())

    fireEvent.click(screen.getByText('+ NEW GUIDE'))

    // Switch the guide type to PRODUCT_REFERENCE (seeds the default columns).
    const typeSelect = selectWithOptionValue('PRODUCT_REFERENCE')!
    fireEvent.change(typeSelect, { target: { value: 'PRODUCT_REFERENCE' } })

    // The source menu arrives with the link-targets payload.
    await waitFor(() => expect(selectWithOptionValue('menu1')).toBeTruthy())
    fireEvent.change(selectWithOptionValue('menu1')!, { target: { value: 'menu1' } })

    fireEvent.click(screen.getByText('↻ SYNC FROM MENU'))

    // Both menu products become rows, drawn from the linked product.
    await waitFor(() => expect(screen.getByText('Items (2)')).toBeTruthy())
    expect(screen.getByText('ASAHI')).toBeTruthy()
    expect(screen.getByText('PERONI')).toBeTruthy()
  })

  it('files a guide into a folder when its card is dragged onto the folder', async () => {
    globalThis.fetch = mockFetchWithFolders()
    render(<GuidesClient role="ADMIN" sessionVenueId="v1" />)
    await waitFor(() => expect(screen.getByText(/UNFILED/)).toBeTruthy())

    const card = cardFor('HOW TO READ THE FRIDGE TEMP LOG')
    const target = document.querySelector('[data-folder-key="f1"]') as HTMLElement
    expect(target).toBeTruthy()

    const dataTransfer = {
      store: {} as Record<string, string>,
      setData(key: string, value: string) { this.store[key] = value },
      getData(key: string) { return this.store[key] ?? '' },
      dropEffect: '',
      effectAllowed: '',
    }

    fireEvent.dragStart(card, { dataTransfer })
    fireEvent.dragOver(target, { dataTransfer })
    fireEvent.drop(target, { dataTransfer })

    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
      const put = calls.find(
        (c) =>
          (c[1] as RequestInit | undefined)?.method === 'PUT' &&
          String(c[0]).includes('/api/admin/guides/g2'),
      )
      expect(put).toBeTruthy()
      expect(JSON.parse((put![1] as RequestInit).body as string)).toMatchObject({ folderId: 'f1' })
    })
  })

  it('adds a step from the small button at the bottom of the steps list', async () => {
    render(<GuidesClient role="ADMIN" sessionVenueId="v1" />)
    await waitFor(() => expect(screen.getByText('FOOD SAFETY BASICS')).toBeTruthy())

    fireEvent.click(screen.getByText('+ NEW GUIDE'))
    expect(screen.getByText('STEP 1')).toBeTruthy()

    fireEvent.click(screen.getByText('+ ADD STEP'))
    expect(screen.getByText('STEP 2')).toBeTruthy()
  })

  // A guide created in this session must reach other guides' `+ LINK → GUIDE`
  // picker — the list is fetched on mount and must be refreshed after a save.
  it('refreshes the link-targets after a guide is saved', async () => {
    let linkCalls = 0
    globalThis.fetch = vi.fn((url: string, init?: RequestInit) => {
      const json = (data: unknown) =>
        Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) } as Response)
      const u = String(url)
      if (u.startsWith('/api/admin/guides/link-targets')) {
        linkCalls += 1
        return json({ ITEM: [], TASK: [], CHECKLIST: [], GUIDE: [], SECTION: [], RECIPE: [] })
      }
      if (u === '/api/admin/guides' && (init?.method ?? 'GET') === 'POST') return json({ id: 'g3' })
      if (u.startsWith('/api/admin/guides')) return json(GUIDES)
      if (u.startsWith('/api/admin/guide-folders')) return json([])
      if (u.startsWith('/api/admin/positions')) return json([])
      if (u.startsWith('/api/admin/departments')) return json([])
      if (u.startsWith('/api/admin/tasks')) return json([])
      if (u.startsWith('/api/admin/venues')) return json([{ id: 'v1', name: 'DEMO VENUE — AUCKLAND' }])
      return json(null)
    }) as unknown as typeof fetch

    render(<GuidesClient role="ADMIN" sessionVenueId="v1" />)
    await waitFor(() => expect(screen.getByText('FOOD SAFETY BASICS')).toBeTruthy())
    await waitFor(() => expect(linkCalls).toBeGreaterThan(0))
    const before = linkCalls

    fireEvent.click(screen.getByText('+ NEW GUIDE'))
    fireEvent.change(screen.getByPlaceholderText('HOW TO CLEAN THE COFFEE MACHINE'), {
      target: { value: 'NEW TIPS GUIDE' },
    })
    fireEvent.click(screen.getByText('SAVE GUIDE'))

    await waitFor(() => expect(linkCalls).toBeGreaterThan(before))
  })

  it('adds an "applies to" audience from the grouped picker, then hides it from the list', async () => {
    globalThis.fetch = vi.fn((url: string) => {
      const json = (data: unknown) =>
        Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) } as Response)
      const u = String(url)
      if (u.startsWith('/api/admin/departments')) return json([{ id: 'd1', name: 'BAR', venueId: 'v1' }])
      if (u.startsWith('/api/admin/guides/link-targets')) {
        return json({ ITEM: [], TASK: [], CHECKLIST: [], GUIDE: [], SECTION: [], RECIPE: [] })
      }
      if (u.startsWith('/api/admin/guides')) return json(GUIDES)
      if (u.startsWith('/api/admin/guide-folders')) return json([])
      if (u.startsWith('/api/admin/positions')) return json([])
      if (u.startsWith('/api/admin/tasks')) return json([])
      if (u.startsWith('/api/admin/venues')) return json([{ id: 'v1', name: 'DEMO VENUE — AUCKLAND' }])
      return json(null)
    }) as unknown as typeof fetch

    render(<GuidesClient role="ADMIN" sessionVenueId="v1" />)
    await waitFor(() => expect(screen.getByText('FOOD SAFETY BASICS')).toBeTruthy())
    fireEvent.click(screen.getByText('+ NEW GUIDE'))

    const input = screen.getByPlaceholderText('+ ADD DEPARTMENT / SECTION / ROLE')
    fireEvent.focus(input)
    // The picker option is a button (the native department <select> option is not).
    fireEvent.click(screen.getByRole('button', { name: 'BAR' }))

    // Reopening the picker no longer offers BAR — it's already added.
    fireEvent.focus(input)
    expect(screen.queryAllByRole('button', { name: 'BAR' })).toHaveLength(0)

    // And the audience is actually saved.
    fireEvent.change(screen.getByPlaceholderText('HOW TO CLEAN THE COFFEE MACHINE'), {
      target: { value: 'NEW GUIDE' },
    })
    fireEvent.click(screen.getByText('SAVE GUIDE'))
    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
      const post = calls.find(
        (c) => String(c[0]) === '/api/admin/guides' && (c[1] as RequestInit | undefined)?.method === 'POST',
      )
      expect(post).toBeTruthy()
      expect(JSON.parse((post![1] as RequestInit).body as string).audiences).toEqual([
        { kind: 'DEPARTMENT', targetId: 'd1' },
      ])
    })
  })
})
