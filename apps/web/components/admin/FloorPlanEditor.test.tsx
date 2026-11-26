import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react'

vi.stubGlobal('ResizeObserver', vi.fn(() => ({ observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() })))

vi.mock('@/components/admin/floorplan-pixi', () => ({
  FloorPlanPixiCanvas: () => null as any,
}))
vi.mock('@/components/admin/floorplan-elements', async () => {
  const actual = await vi.importActual('@/components/admin/floorplan-elements')
  return { ...(actual as any), computeSectionSummary: () => null }
})

const mockPlan = {
  id: 'plan-1',
  name: 'TEST FLOOR',
  slug: 'test-floor',
  isDefault: true,
  roomWidth: 2000,
  roomDepth: 1500,
  gridUnit: 50,
}
const mockSections: any[] = []

import { FloorPlanEditor } from '@/components/admin/FloorPlanEditor'

const wallElement = {
  id: 'el-1',
  type: 'WALL',
  shape: 'RECTANGLE',
  x: 123,
  y: 321,
  width: 200,
  depth: 15,
  rotation: 0,
  fillColour: '#4A4A4A',
  opacity: 1,
  zIndex: 0,
  sortOrder: 0,
  isActive: true,
  label: 'WALL A',
  chairCount: 0,
  labelVisible: true,
}

/** Load one element so the layer list and inspector are usable. */
function mockPlanWithElement() {
  vi.spyOn(global, 'fetch').mockImplementation(((url: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') {
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
    }
    if (url === '/api/admin/floorplan/plan-1') {
      return Promise.resolve({ ok: true, json: async () => ({ elements: [wallElement], zones: [] }) } as Response)
    }
    return Promise.resolve({ ok: true, json: async () => [] } as Response)
  }) as typeof fetch)
}

function numberInputValues(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('input[type="number"]')).map((el) => (el as HTMLInputElement).value)
}

async function selectWall(container: HTMLElement) {
  const label = await waitFor(() => {
    const el = Array.from(container.querySelectorAll('span')).find((s) => s.textContent === 'WALL A')
    if (!el) throw new Error('layer row not rendered')
    return el
  })
  fireEvent.click(label)
  await waitFor(() => expect(numberInputValues(container)).toContain('123'))
}

/** The editor root owns the keyboard handler. */
function canvasRoot(container: HTMLElement): HTMLElement {
  return container.querySelector('[tabindex="0"]') as HTMLElement
}

describe('FloorPlanEditor', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(global, 'fetch').mockImplementation((() =>
      Promise.resolve({
        ok: true,
        json: async () => [],
      } as Response)) as typeof fetch)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders loading state on mount', () => {
    const { getByText } = render(
      <FloorPlanEditor plan={mockPlan} sections={mockSections} onBack={vi.fn()} />
    )
    expect(getByText('LOADING')).toBeTruthy()
  })

  it('renders without crashing (hooks ordered correctly)', () => {
    const { container } = render(
      <FloorPlanEditor plan={mockPlan} sections={mockSections} onBack={vi.fn()} />
    )
    expect(container).toBeTruthy()
  })

  it('calls fetch to load plan data on mount', () => {
    render(<FloorPlanEditor plan={mockPlan} sections={mockSections} onBack={vi.fn()} />)
    expect(fetch).toHaveBeenCalled()
  })

  it('shows SAVED until an edit, then UNSAVED with the action', async () => {
    mockPlanWithElement()
    const { container, getByTestId } = render(
      <FloorPlanEditor plan={mockPlan} sections={mockSections} onBack={vi.fn()} />
    )
    await selectWall(container)
    expect(getByTestId('save-state').textContent).toBe('SAVED')
    fireEvent.keyDown(canvasRoot(container), { key: 'ArrowRight' })
    expect(getByTestId('save-state').textContent).toContain('UNSAVED')
    expect(getByTestId('save-state').textContent).toContain('NUDGED')
  })

  it('nudges the selected item by a grid unit and undo puts it back', async () => {
    mockPlanWithElement()
    const { container } = render(
      <FloorPlanEditor plan={mockPlan} sections={mockSections} onBack={vi.fn()} />
    )
    await selectWall(container)

    fireEvent.keyDown(canvasRoot(container), { key: 'ArrowRight' })
    await waitFor(() => expect(numberInputValues(container)).toContain('173')) // 123 + 50

    fireEvent.keyDown(canvasRoot(container), { key: 'z', ctrlKey: true })
    await waitFor(() => expect(numberInputValues(container)).toContain('123'))
  })

  it('nudges by 1cm with Shift held', async () => {
    mockPlanWithElement()
    const { container } = render(
      <FloorPlanEditor plan={mockPlan} sections={mockSections} onBack={vi.fn()} />
    )
    await selectWall(container)
    fireEvent.keyDown(canvasRoot(container), { key: 'ArrowDown', shiftKey: true })
    await waitFor(() => expect(numberInputValues(container)).toContain('322')) // 321 + 1
  })

  it('clamps a nudge inside the room', async () => {
    mockPlanWithElement()
    const { container } = render(
      <FloorPlanEditor plan={mockPlan} sections={mockSections} onBack={vi.fn()} />
    )
    await selectWall(container)
    // x=123 -> 73 -> 23 -> 0 (clamped), never negative
    fireEvent.keyDown(canvasRoot(container), { key: 'ArrowLeft' })
    fireEvent.keyDown(canvasRoot(container), { key: 'ArrowLeft' })
    fireEvent.keyDown(canvasRoot(container), { key: 'ArrowLeft' })
    await waitFor(() => expect(numberInputValues(container)).toContain('0'))
  })

  it('does not nudge while typing in a dimension field', async () => {
    mockPlanWithElement()
    const { container } = render(
      <FloorPlanEditor plan={mockPlan} sections={mockSections} onBack={vi.fn()} />
    )
    await selectWall(container)
    const xInput = Array.from(container.querySelectorAll('input[type="number"]'))
      .find((el) => (el as HTMLInputElement).value === '123') as HTMLInputElement
    fireEvent.keyDown(xInput, { key: 'ArrowRight' })
    expect(numberInputValues(container)).toContain('123')
  })

  it('undoes a rotate and a delete', async () => {
    mockPlanWithElement()
    const { container, getByText, queryByText } = render(
      <FloorPlanEditor plan={mockPlan} sections={mockSections} onBack={vi.fn()} />
    )
    await selectWall(container)

    const rotate90 = getByText('90°')
    expect(rotate90.className).not.toContain('bg-grey-mid')
    fireEvent.click(rotate90)
    await waitFor(() => expect(getByText('90°').className).toContain('bg-grey-mid'))
    fireEvent.keyDown(canvasRoot(container), { key: 'z', ctrlKey: true })
    await waitFor(() => expect(getByText('90°').className).not.toContain('bg-grey-mid'))

    // Delete the element, then undo the delete.
    fireEvent.keyDown(canvasRoot(container), { key: 'Delete' })
    await waitFor(() => expect(queryByText('WALL A')).toBeNull())
    fireEvent.keyDown(canvasRoot(container), { key: 'z', ctrlKey: true })
    await waitFor(() => expect(getByText('WALL A')).toBeTruthy())
  })
})
