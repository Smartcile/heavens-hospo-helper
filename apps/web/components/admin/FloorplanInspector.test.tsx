import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { FloorplanInspector } from '@/components/admin/FloorplanInspector'
import type { ElementData } from '@/components/admin/floorplan-elements'

const baseElement: ElementData = {
  id: 'el-1',
  type: 'TABLE',
  shape: 'RECTANGLE',
  label: 'T1',
  labelVisible: true,
  x: 100,
  y: 100,
  width: 80,
  depth: 80,
  radius: null,
  rotation: 0,
  fillColour: '#555',
  opacity: 1,
  zIndex: 1,
  sortOrder: 1,
  isActive: true,
  style: null,
  chairCount: 0,
}

describe('FloorplanInspector', () => {
  it('returns null when no element selected', () => {
    const { container } = render(<FloorplanInspector selectedElement={null} onChange={vi.fn()} />)
    expect(container.textContent).toBe('')
  })

  it('renders width and depth sliders for RECTANGLE', () => {
    const { container } = render(<FloorplanInspector selectedElement={baseElement} onChange={vi.fn()} />)
    const sliders = container.querySelectorAll('input[type="range"]')
    expect(sliders.length).toBe(2)
  })

  it('renders preset buttons', () => {
    const { getByText } = render(<FloorplanInspector selectedElement={baseElement} onChange={vi.fn()} />)
    expect(getByText('60×60')).toBeTruthy()
    expect(getByText('80×80')).toBeTruthy()
  })

  it('calls onChange when preset is clicked', () => {
    const onChange = vi.fn()
    const { getByText } = render(<FloorplanInspector selectedElement={baseElement} onChange={onChange} />)
    fireEvent.click(getByText('120×60'))
    expect(onChange).toHaveBeenCalledWith({ width: 120, depth: 60 })
  })

  it('renders seat capacity for BOOTH_BENCH polygon', () => {
    const booth: ElementData = { ...baseElement, type: 'BOOTH_BENCH', shape: 'POLYGON' }
    const { getByText } = render(<FloorplanInspector selectedElement={booth} onChange={vi.fn()} />)
    expect(getByText('Seat Capacity')).toBeTruthy()
  })
})
