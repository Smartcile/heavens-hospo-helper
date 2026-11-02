import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { PathwaysClient } from '@/components/admin/PathwaysClient'

// The board is React Flow behind next/dynamic — it measures the DOM, which jsdom
// can't do. The board has its own concerns; this file covers the client's data
// flow and the TREE renderer.
vi.mock('@/components/admin/PathwayBoard', () => ({
  PathwayBoard: () => <div data-testid="board" />,
}))

vi.mock('@/lib/active-venue', () => ({ getActiveVenueId: () => 'v1' }))

const PATHWAYS = [
  {
    id: 'pw1', name: 'NEW BARTENDER', description: null, status: 'DRAFT',
    departmentId: null, sectionId: null, positionId: 'pos1',
    department: null, section: null, position: { name: 'BARTENDER' },
    _count: { nodes: 2 },
  },
]

const DETAIL = {
  id: 'pw1',
  nodes: [
    { id: 'n1', kind: 'GUIDE', targetId: 'g1', label: null, x: 60, y: 60, stage: 0, points: 10, sortOrder: 0 },
    { id: 'n2', kind: 'GUIDE', targetId: 'g2', label: null, x: 60, y: 160, stage: 0, points: 20, sortOrder: 1 },
    { id: 'n3', kind: 'GUIDE', targetId: 'g3', label: null, x: 320, y: 60, stage: 1, points: 30, sortOrder: 2 },
  ],
  edges: [{ fromNodeId: 'n1', toNodeId: 'n3' }],
}

const TARGETS = {
  ITEM: [], CHECKLIST: [], SECTION: [], RECIPE: [], TASK: [],
  GUIDE: [
    { value: 'g1', label: 'ESPRESSO 101' },
    { value: 'g2', label: 'LATTE ART' },
    { value: 'g3', label: 'MACCHIATO MASTERY' },
  ],
}

function mockFetch() {
  return vi.fn((url: string) => {
    const json = (data: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(data) })
    if (url.startsWith('/api/admin/pathways/pw1')) return json(DETAIL)
    if (url.startsWith('/api/admin/pathways')) return json(PATHWAYS)
    if (url.startsWith('/api/admin/guides/link-targets')) return json(TARGETS)
    if (url.startsWith('/api/admin/positions')) return json([{ id: 'pos1', name: 'BARTENDER' }])
    return json([])
  }) as unknown as typeof fetch
}

describe('PathwaysClient', () => {
  beforeEach(() => { globalThis.fetch = mockFetch() })
  afterEach(() => { vi.restoreAllMocks() })

  it('lists pathways with their target and node count', async () => {
    render(<PathwaysClient role="ADMIN" sessionVenueId="v1" />)
    await waitFor(() => expect(screen.getByText('NEW BARTENDER')).toBeTruthy())
    expect(screen.getByText(/BARTENDER · 2 NODES/)).toBeTruthy()
    expect(screen.getByText('DRAFT')).toBeTruthy()
  })

  it('shows an empty state with no pathways', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([]) }),
    ) as unknown as typeof fetch
    render(<PathwaysClient role="ADMIN" sessionVenueId="v1" />)
    await waitFor(() => expect(screen.getByText('NO PATHWAYS YET.')).toBeTruthy())
  })

  it('opens a pathway and resolves node titles from the picker lists', async () => {
    render(<PathwaysClient role="ADMIN" sessionVenueId="v1" />)
    await waitFor(() => expect(screen.getByText('NEW BARTENDER')).toBeTruthy())
    fireEvent.click(screen.getByText('NEW BARTENDER'))

    fireEvent.click(await screen.findByText('TREE'))

    // The titles also appear as <option>s in the add-node picker, so assert on
    // the tree rows specifically.
    const inTree = (label: string) =>
      screen.getAllByText(label).filter((el) => el.tagName !== 'OPTION')
    await waitFor(() => expect(inTree('ESPRESSO 101').length).toBeGreaterThan(0))
    expect(inTree('LATTE ART').length).toBeGreaterThan(0)
  })

  // The TREE preview shows a brand-new starter's view, so anything behind a
  // prerequisite must read as blocked.
  it('shows what blocks a downstream node in the tree preview', async () => {
    render(<PathwaysClient role="ADMIN" sessionVenueId="v1" />)
    await waitFor(() => expect(screen.getByText('NEW BARTENDER')).toBeTruthy())
    fireEvent.click(screen.getByText('NEW BARTENDER'))
    fireEvent.click(await screen.findByText('TREE'))

    await waitFor(() => expect(screen.getByText(/NEEDS ESPRESSO 101/)).toBeTruthy())
  })

  it('groups tree nodes by stage', async () => {
    render(<PathwaysClient role="ADMIN" sessionVenueId="v1" />)
    await waitFor(() => expect(screen.getByText('NEW BARTENDER')).toBeTruthy())
    fireEvent.click(screen.getByText('NEW BARTENDER'))
    fireEvent.click(await screen.findByText('TREE'))

    await waitFor(() => expect(screen.getByText('STAGE 1')).toBeTruthy())
    expect(screen.getByText('STAGE 2')).toBeTruthy()
  })

  it('renders the board by default', async () => {
    render(<PathwaysClient role="ADMIN" sessionVenueId="v1" />)
    await waitFor(() => expect(screen.getByText('NEW BARTENDER')).toBeTruthy())
    fireEvent.click(screen.getByText('NEW BARTENDER'))
    await waitFor(() => expect(screen.getByTestId('board')).toBeTruthy())
  })

  it('disables SAVE until something changes', async () => {
    render(<PathwaysClient role="ADMIN" sessionVenueId="v1" />)
    await waitFor(() => expect(screen.getByText('NEW BARTENDER')).toBeTruthy())
    fireEvent.click(screen.getByText('NEW BARTENDER'))
    const save = await screen.findByText('SAVE')
    expect((save.closest('button') as HTMLButtonElement).disabled).toBe(true)
  })

  // ── Tree quick actions ──────────────────────────────────────────────

  async function openTree() {
    render(<PathwaysClient role="ADMIN" sessionVenueId="v1" />)
    await waitFor(() => expect(screen.getByText('NEW BARTENDER')).toBeTruthy())
    fireEvent.click(screen.getByText('NEW BARTENDER'))
    fireEvent.click(await screen.findByText('TREE'))
    await waitFor(() => expect(screen.getByText('STAGE 1')).toBeTruthy())
  }

  // The tree row is the closest block containing the title text (titles also
  // appear as <option>s in the add-node picker, so skip those).
  const rowOf = (title: string) =>
    screen.getAllByText(title).filter((el) => el.tagName !== 'OPTION')[0].closest('div.py-1') as HTMLElement
  const btn = (row: HTMLElement, title: string) => row.querySelector(`[title="${title}"]`) as HTMLButtonElement
  const stageTitles = (stageHeader: string) => {
    const list = screen.getByText(stageHeader).nextSibling as HTMLElement
    return [...list.querySelectorAll('.text-white.min-w-0')].map((el) => el.textContent)
  }

  it('reorders a node up within its stage on the tree', async () => {
    await openTree()
    // stage 0 order starts ESPRESSO 101 → LATTE ART
    expect(stageTitles('STAGE 1')).toEqual(['ESPRESSO 101', 'LATTE ART'])
    fireEvent.click(btn(rowOf('LATTE ART'), 'MOVE UP IN STAGE'))
    expect(stageTitles('STAGE 1')).toEqual(['LATTE ART', 'ESPRESSO 101'])
    expect(screen.getByText('UNSAVED')).toBeTruthy()
  })

  it('reorders a node down within its stage on the tree', async () => {
    await openTree()
    fireEvent.click(btn(rowOf('ESPRESSO 101'), 'MOVE DOWN IN STAGE'))
    expect(stageTitles('STAGE 1')).toEqual(['LATTE ART', 'ESPRESSO 101'])
  })

  it('does not move the first node further up', async () => {
    await openTree()
    fireEvent.click(btn(rowOf('ESPRESSO 101'), 'MOVE UP IN STAGE'))
    expect(stageTitles('STAGE 1')).toEqual(['ESPRESSO 101', 'LATTE ART'])
  })

  it('shifts a node between stages with S−/S+', async () => {
    await openTree()
    fireEvent.click(btn(rowOf('LATTE ART'), 'STAGE DOWN'))
    expect(stageTitles('STAGE 2')).toEqual(['LATTE ART', 'MACCHIATO MASTERY'])
    expect(stageTitles('STAGE 1')).toEqual(['ESPRESSO 101'])
    fireEvent.click(btn(rowOf('LATTE ART'), 'STAGE UP'))
    expect(stageTitles('STAGE 1')).toEqual(['ESPRESSO 101', 'LATTE ART'])
  })

  it('deletes a node and its links from the tree', async () => {
    await openTree()
    fireEvent.click(btn(rowOf('LATTE ART'), 'DELETE NODE'))
    const inTree = (label: string) => screen.getAllByText(label).filter((el) => el.tagName !== 'OPTION')
    expect(inTree('LATTE ART').length).toBe(0)
    expect(stageTitles('STAGE 1')).toEqual(['ESPRESSO 101'])
  })

  it('edits points and stage inline on the tree', async () => {
    await openTree()
    fireEvent.click(btn(rowOf('ESPRESSO 101'), 'EDIT NODE'))
    const row = rowOf('ESPRESSO 101')
    const points = row.querySelectorAll('input[type="number"]')[0] as HTMLInputElement
    fireEvent.change(points, { target: { value: '25' } })
    fireEvent.click([...row.querySelectorAll('button')].find((b) => b.textContent === 'OK')!)
    expect(screen.getByText('25P')).toBeTruthy()
    expect(screen.queryByText('10P')).toBeNull()
  })
})
