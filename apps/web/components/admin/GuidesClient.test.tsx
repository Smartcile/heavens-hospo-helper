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
})
