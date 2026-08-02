import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FurnitureShapeEditor } from '@/components/admin/FurnitureShapeEditor'

const L_SHAPE = [
  { x: 0, y: 0 },
  { x: 200, y: 0 },
  { x: 200, y: 100 },
  { x: 100, y: 100 },
  { x: 100, y: 200 },
  { x: 0, y: 200 },
]

function base(over: Partial<Parameters<typeof FurnitureShapeEditor>[0]> = {}) {
  return {
    shape: 'RECTANGLE' as const,
    width: 120,
    depth: 60,
    vertices: null,
    seatingDensity: 60,
    maxHeadChairs: 1,
    onChange: vi.fn(),
    ...over,
  }
}

describe('FurnitureShapeEditor', () => {
  it('previews a rectangle without offering drawing tools', () => {
    render(<FurnitureShapeEditor {...base()} />)
    expect(screen.getByText('PREVIEW')).toBeTruthy()
    expect(screen.queryByText('DRAW SHAPE')).toBeNull()
  })

  it('offers drawing tools for a custom shape', () => {
    render(<FurnitureShapeEditor {...base({ shape: 'POLYGON', vertices: null })} />)
    expect(screen.getByText('SHAPE OUTLINE')).toBeTruthy()
    expect(screen.getByText('DRAW SHAPE')).toBeTruthy()
  })

  it('reports live seat count from the shape', () => {
    // A 120x60 at 60cm/chair seats 2 per long side, none on the 60cm heads
    // once the head cap of 1 is applied -> 4 total.
    render(<FurnitureShapeEditor {...base({ maxHeadChairs: 0 })} />)
    expect(screen.getByText(/4 SEATS/)).toBeTruthy()
  })

  it('reports area and edge length', () => {
    render(<FurnitureShapeEditor {...base()} />)
    // 120x60 cm = 0.72 m², perimeter 360cm
    expect(screen.getByText(/0\.72 m²/)).toBeTruthy()
    expect(screen.getByText(/360 cm EDGE/)).toBeTruthy()
  })

  it('offers REDRAW once a shape exists', () => {
    render(<FurnitureShapeEditor {...base({ shape: 'POLYGON', vertices: L_SHAPE })} />)
    expect(screen.getByText('REDRAW')).toBeTruthy()
  })

  it('draws a polygon outline for a custom shape', () => {
    const { container } = render(
      <FurnitureShapeEditor {...base({ shape: 'POLYGON', vertices: L_SHAPE, width: 200, depth: 200 })} />,
    )
    expect(container.querySelector('polygon')).toBeTruthy()
  })

  it('renders a draggable handle per vertex of a custom shape', () => {
    const { container } = render(
      <FurnitureShapeEditor {...base({ shape: 'POLYGON', vertices: L_SHAPE, width: 200, depth: 200 })} />,
    )
    // Chairs are circles too, so count only the vertex handles by their stroke.
    const handles = [...container.querySelectorAll('circle')].filter(
      (c) => c.getAttribute('stroke') === '#4488FF',
    )
    expect(handles.length).toBe(L_SHAPE.length)
  })

  it('shows drawing guidance and DONE while drawing', () => {
    render(<FurnitureShapeEditor {...base({ shape: 'POLYGON', vertices: null })} />)
    fireEvent.click(screen.getByText('DRAW SHAPE'))
    expect(screen.getByText(/CLICK TO PLACE POINTS/)).toBeTruthy()
    expect(screen.getByText('DONE (0)')).toBeTruthy()
  })

  it('cannot finish a shape with fewer than 3 points', () => {
    render(<FurnitureShapeEditor {...base({ shape: 'POLYGON', vertices: null })} />)
    fireEvent.click(screen.getByText('DRAW SHAPE'))
    expect(screen.getByText('DONE (0)').hasAttribute('disabled')).toBe(true)
  })

  it('returns to the idle state on cancel', () => {
    render(<FurnitureShapeEditor {...base({ shape: 'POLYGON', vertices: null })} />)
    fireEvent.click(screen.getByText('DRAW SHAPE'))
    fireEvent.click(screen.getByText('CANCEL'))
    expect(screen.getByText('DRAW SHAPE')).toBeTruthy()
  })

  it('warns about a self-crossing outline', () => {
    const bowtie = [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { x: 100, y: 0 },
      { x: 0, y: 100 },
    ]
    render(<FurnitureShapeEditor {...base({ shape: 'POLYGON', vertices: bowtie, width: 100, depth: 100 })} />)
    expect(screen.getByText('EDGES CROSS OVER EACH OTHER')).toBeTruthy()
  })

  it('falls back to the bounding box when a custom shape has no vertices yet', () => {
    const { container } = render(
      <FurnitureShapeEditor {...base({ shape: 'POLYGON', vertices: null })} />,
    )
    // Still draws something rather than rendering an empty canvas.
    expect(container.querySelector('polygon')).toBeTruthy()
  })

  it('seats a round table all the way around', () => {
    render(<FurnitureShapeEditor {...base({ shape: 'CIRCLE', width: 150, depth: 150 })} />)
    // ~471cm circumference at 60cm each
    expect(screen.getByText(/7 SEATS/)).toBeTruthy()
  })
})
