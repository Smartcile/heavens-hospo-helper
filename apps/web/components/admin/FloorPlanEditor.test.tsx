import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, waitFor, cleanup, act } from '@testing-library/react'

vi.stubGlobal('ResizeObserver', vi.fn(() => ({ observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() })))

/** Captures the canvas props so tests can drive the callbacks the Pixi canvas would fire. */
const canvas = vi.hoisted(() => ({ props: null as any }))
vi.mock('@/components/admin/floorplan-pixi', () => ({
  FloorPlanPixiCanvas: (props: any) => {
    canvas.props = props
    return null
  },
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

/** Load a plan carrying a reference-image underlay and record PUT bodies. */
function mockPlanWithUnderlay(
  puts: { url: string; body: Record<string, unknown> }[],
  overrides: Partial<Record<'backgroundScale' | 'backgroundOpacity' | 'backgroundOffsetX' | 'backgroundOffsetY', number>> = {},
) {
  const underlayPlan = {
    roomWidth: 2000,
    roomDepth: 1500,
    gridUnit: 50,
    elements: [] as any[],
    zones: [] as any[],
    backgroundImageUrl: '/api/upload/drawing.png',
    backgroundOpacity: 0.5,
    backgroundOffsetX: 0,
    backgroundOffsetY: 0,
    backgroundScale: 1,
    ...overrides,
  }
  vi.spyOn(global, 'fetch').mockImplementation(((url: string, init?: RequestInit) => {
    if (init?.method === 'POST' && url === '/api/admin/upload') {
      return Promise.resolve({ ok: true, json: async () => ({ url: '/api/upload/replaced.png' }) } as Response)
    }
    if (init?.method === 'PUT') {
      puts.push({ url, body: JSON.parse(String(init.body ?? '{}')) })
      return Promise.resolve({ ok: true, json: async () => ({ saved: [] }) } as Response)
    }
    if (init?.method && init.method !== 'GET') {
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
    }
    if (url === '/api/admin/floorplan/plan-1') {
      return Promise.resolve({ ok: true, json: async () => underlayPlan } as Response)
    }
    return Promise.resolve({ ok: true, json: async () => [] } as Response)
  }) as typeof fetch)
}

function numberInputValues(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('input[type="number"]')).map((el) => (el as HTMLInputElement).value)
}

/** Layer list row → select the wall element. */
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

  it('marks a chair move as an unsaved change (blocking review item)', async () => {
    mockPlanWithElement()
    const { container, getByTestId } = render(
      <FloorPlanEditor plan={mockPlan} sections={mockSections} onBack={vi.fn()} />
    )
    await selectWall(container)
    expect(getByTestId('save-state').textContent).toBe('SAVED')

    // The canvas commits a chair drag once, on release.
    act(() => { canvas.props.onSetupChairMove('el-1', 'chair-1', 0.25) })

    await waitFor(() => expect(getByTestId('save-state').textContent).toBe('UNSAVED · MOVED CHAIR'))
  })

  it('marks undo/redo dirty and clears history after a save', async () => {
    mockPlanWithElement()
    const { container, getByTestId, getByText } = render(
      <FloorPlanEditor plan={mockPlan} sections={mockSections} onBack={vi.fn()} />
    )
    await selectWall(container)

    // Undo itself is an unsaved change.
    fireEvent.keyDown(canvasRoot(container), { key: 'ArrowRight' })
    fireEvent.keyDown(canvasRoot(container), { key: 'z', ctrlKey: true })
    await waitFor(() => expect(getByTestId('save-state').textContent).toBe('UNSAVED · UNDO'))

    // SAVE is a commit point: history is dropped and the badge goes clean.
    fireEvent.click(getByText('SAVE'))
    await waitFor(() => expect(getByTestId('save-state').textContent).toBe('SAVED'))

    // An undo after SAVE cannot resurrect the pre-save snapshot.
    const before = numberInputValues(container)
    fireEvent.keyDown(canvasRoot(container), { key: 'z', ctrlKey: true })
    expect(getByTestId('save-state').textContent).toBe('SAVED')
    expect(numberInputValues(container)).toEqual(before)
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

  it('loads the reference underlay and passes it to the canvas', async () => {
    canvas.props = null
    mockPlanWithUnderlay([])
    const { getByTestId } = render(
      <FloorPlanEditor plan={mockPlan} sections={mockSections} onBack={vi.fn()} />
    )

    await waitFor(() => expect(canvas.props?.background?.imageUrl).toBe('/api/upload/drawing.png'))
    expect(canvas.props.background.opacity).toBe(0.5)
    expect(canvas.props.backgroundVisible).toBe(true)
    expect(getByTestId('underlay-panel').textContent).toContain('SHOWN')
  })

  it('hides and shows the underlay without touching the layout', async () => {
    canvas.props = null
    mockPlanWithUnderlay([])
    const { getByText } = render(
      <FloorPlanEditor plan={mockPlan} sections={mockSections} onBack={vi.fn()} />
    )
    await waitFor(() => expect(canvas.props?.background).toBeTruthy())

    fireEvent.click(getByText('HIDE'))
    await waitFor(() => expect(canvas.props.backgroundVisible).toBe(false))
    expect(getByText('SHOW')).toBeTruthy()

    fireEvent.click(getByText('SHOW'))
    await waitFor(() => expect(canvas.props.backgroundVisible).toBe(true))
  })

  it('locks the underlay controls by default', async () => {
    canvas.props = null
    mockPlanWithUnderlay([])
    const { getByTestId, getByText } = render(
      <FloorPlanEditor plan={mockPlan} sections={mockSections} onBack={vi.fn()} />
    )
    await waitFor(() => expect(canvas.props?.background).toBeTruthy())

    const panel = getByTestId('underlay-panel')
    const opacity = () => panel.querySelectorAll('input[type="number"]')[0] as HTMLInputElement
    expect(opacity().disabled).toBe(true)
    // LOCK protects the numeric settings only — calibration is always available.
    expect((getByText('CALIBRATE').closest('button') as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(getByText('LOCKED'))
    await waitFor(() => expect(opacity().disabled).toBe(false))
    expect(getByText('UNLOCKED')).toBeTruthy()
    expect((getByText('CALIBRATE').closest('button') as HTMLButtonElement).disabled).toBe(false)
  })

  it('calibrates the scale and resizes the plan immediately', async () => {
    const puts: { url: string; body: Record<string, unknown> }[] = []
    canvas.props = null
    mockPlanWithUnderlay(puts)
    const { getByText, getByTestId, queryByTestId } = render(
      <FloorPlanEditor plan={mockPlan} sections={mockSections} onBack={vi.fn()} />
    )
    await waitFor(() => expect(canvas.props?.background).toBeTruthy())

    fireEvent.click(getByText('LOCKED'))
    await waitFor(() => expect(getByText('UNLOCKED')).toBeTruthy())
    fireEvent.click(getByText('CALIBRATE'))
    await waitFor(() => expect(getByTestId('floorplan-calibration')).toBeTruthy())

    // The operator clicks two points on the drawing, then types the real distance.
    act(() => canvas.props.onCalibrationPoint(100, 100))
    act(() => canvas.props.onCalibrationPoint(300, 100))
    act(() => canvas.props.onBackgroundImageLoad({ width: 2000, height: 1000 }))
    await waitFor(() => expect(getByTestId('floorplan-calibration').textContent).toContain('POINTS: 2/2'))

    fireEvent.change(getByTestId('floorplan-calibration').querySelector('input[type="number"]')!, {
      target: { value: '400' },
    })
    await waitFor(() =>
      expect((getByText('APPLY CALIBRATION').closest('button') as HTMLButtonElement).disabled).toBe(false)
    )
    fireEvent.click(getByText('APPLY CALIBRATION'))

    // Scale = 400 cm / 200 px = 2; the room becomes the drawing extent at that scale.
    await waitFor(() => expect(canvas.props.roomWidth).toBe(4000))
    expect(canvas.props.roomDepth).toBe(2000)
    const saved = puts.find((p) => p.url === '/api/admin/floorplan/plan-1')
    expect(saved?.body).toMatchObject({ roomWidth: 4000, roomDepth: 2000, backgroundScale: 2 })
    expect(queryByTestId('floorplan-calibration')).toBeNull()
  })

  it('saves the underlay settings with the plan', async () => {
    const puts: { url: string; body: Record<string, unknown> }[] = []
    canvas.props = null
    mockPlanWithUnderlay(puts)
    const { getByText, getByTestId } = render(
      <FloorPlanEditor plan={mockPlan} sections={mockSections} onBack={vi.fn()} />
    )
    await waitFor(() => expect(canvas.props?.background).toBeTruthy())

    fireEvent.click(getByText('LOCKED'))
    await waitFor(() => expect(getByText('UNLOCKED')).toBeTruthy())
    const opacity = getByTestId('underlay-panel').querySelectorAll('input[type="number"]')[0] as HTMLInputElement
    fireEvent.change(opacity, { target: { value: '70' } })

    fireEvent.click(getByText('SAVE'))
    await waitFor(() => expect(puts.some((p) => p.url === '/api/admin/floorplan/plan-1')).toBe(true))
    const saved = puts.find((p) => p.url === '/api/admin/floorplan/plan-1')!
    expect(saved.body).toMatchObject({
      backgroundImageUrl: '/api/upload/drawing.png',
      backgroundOpacity: 0.7,
      backgroundScale: 1,
    })
  })

  it('removing the drawing keeps the calibration and the geometry', async () => {
    const puts: { url: string; body: Record<string, unknown> }[] = []
    canvas.props = null
    mockPlanWithUnderlay(puts)
    const { getByText } = render(
      <FloorPlanEditor plan={mockPlan} sections={mockSections} onBack={vi.fn()} />
    )
    await waitFor(() => expect(canvas.props?.background).toBeTruthy())

    fireEvent.click(getByText('REMOVE'))
    await waitFor(() => expect(canvas.props.background.imageUrl).toBeNull())
    // Offsets/scale/opacity survive the removal; only the drawing goes away.
    expect(canvas.props.background.scale).toBe(1)
    expect(canvas.props.background.opacity).toBe(0.5)

    fireEvent.click(getByText('SAVE'))
    await waitFor(() => expect(puts.some((p) => p.url === '/api/admin/floorplan/plan-1')).toBe(true))
    const saved = puts.find((p) => p.url === '/api/admin/floorplan/plan-1')!
    expect(saved.body).toMatchObject({
      backgroundImageUrl: null,
      backgroundOpacity: 0.5,
      backgroundScale: 1,
    })
  })

  it('replacing the drawing keeps the calibration', async () => {
    canvas.props = null
    mockPlanWithUnderlay([], {
      backgroundScale: 2,
      backgroundOffsetX: 40,
      backgroundOffsetY: 10,
      backgroundOpacity: 0.5,
    })
    const { container } = render(
      <FloorPlanEditor plan={mockPlan} sections={mockSections} onBack={vi.fn()} />
    )
    await waitFor(() => expect(canvas.props?.background?.scale).toBe(2))

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, {
      target: { files: [new File(['drawing'], 'new.png', { type: 'image/png' })] },
    })

    await waitFor(() => expect(canvas.props.background.imageUrl).toBe('/api/upload/replaced.png'))
    expect(canvas.props.background.scale).toBe(2)
    expect(canvas.props.background.offsetX).toBe(40)
    expect(canvas.props.background.offsetY).toBe(10)
    expect(canvas.props.background.opacity).toBe(0.5)
  })

  it('keeps the typed scale string without snapping mid-edit', async () => {
    canvas.props = null
    mockPlanWithUnderlay([])
    const { getByText, getByTestId } = render(
      <FloorPlanEditor plan={mockPlan} sections={mockSections} onBack={vi.fn()} />
    )
    await waitFor(() => expect(canvas.props?.background).toBeTruthy())
    fireEvent.click(getByText('LOCKED'))
    await waitFor(() => expect(getByText('UNLOCKED')).toBeTruthy())

    const scaleInput = getByTestId('underlay-panel').querySelectorAll('input[type="number"]')[3] as HTMLInputElement
    fireEvent.change(scaleInput, { target: { value: '' } })
    expect(scaleInput.value).toBe('')
    expect(canvas.props.background.scale).toBe(1)

    fireEvent.change(scaleInput, { target: { value: '0.05' } })
    await waitFor(() => expect(canvas.props.background.scale).toBe(0.05))
  })
})
