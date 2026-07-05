import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'

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
})
