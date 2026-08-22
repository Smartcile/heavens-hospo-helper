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

function mockFetch() {
  return vi.fn((url: string) => {
    const json = (data: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) })
    const u = String(url)
    if (u.startsWith('/api/admin/guides?') || u === '/api/admin/guides') return json(GUIDES)
    if (u.startsWith('/api/admin/guides/link-targets')) return json({ ITEM: [], TASK: [], CHECKLIST: [], GUIDE: [], SECTION: [], RECIPE: [] })
    if (u.startsWith('/api/admin/positions')) return json([])
    if (u.startsWith('/api/admin/departments')) return json([])
    if (u.startsWith('/api/admin/tasks')) return json([])
    if (u.startsWith('/api/admin/venues')) return json([{ id: 'v1', name: 'DEMO VENUE — AUCKLAND' }])
    return json(null)
  }) as unknown as typeof fetch
}

describe('GuidesClient', () => {
  beforeEach(() => { globalThis.fetch = mockFetch() })
  afterEach(() => { vi.restoreAllMocks() })

  it('lists guides with status badges', async () => {
    render(<GuidesClient role="ADMIN" sessionVenueId="v1" />)
    await waitFor(() => expect(screen.getByText('FOOD SAFETY BASICS')).toBeTruthy())
    expect(screen.getByText('HOW TO READ THE FRIDGE TEMP LOG')).toBeTruthy()
  })

  it('opens the single-guide PDF from a card', async () => {
    const open = vi.fn()
    vi.stubGlobal('open', open)
    render(<GuidesClient role="ADMIN" sessionVenueId="v1" />)
    await waitFor(() => expect(screen.getByText('FOOD SAFETY BASICS')).toBeTruthy())
    const card = screen.getByText('FOOD SAFETY BASICS').closest('.bg-grey-dark') as HTMLElement
    fireEvent.click([...card.querySelectorAll('button')].find((b) => b.textContent === '⬇ PDF')!)
    expect(open).toHaveBeenCalledWith('/api/admin/guides/g1/pdf', '_blank', 'noopener')
  })

  it('bulk downloads the selected guides as one PDF', async () => {
    const open = vi.fn()
    vi.stubGlobal('open', open)
    render(<GuidesClient role="ADMIN" sessionVenueId="v1" />)
    await waitFor(() => expect(screen.getByText('FOOD SAFETY BASICS')).toBeTruthy())
    fireEvent.click(screen.getByText('SELECT ALL'))
    expect(screen.getByText('⬇ PDF (2)')).toBeTruthy()
    fireEvent.click(screen.getByText('⬇ PDF (2)'))
    expect(open).toHaveBeenCalledWith('/api/admin/guides/pdf?ids=g1,g2&venueId=v1', '_blank', 'noopener')
  })
})
