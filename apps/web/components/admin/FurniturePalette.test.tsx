import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FurniturePalette, FURNITURE_DRAG_PREFIX } from '@/components/admin/FurniturePalette'
import type { FurnitureView } from '@hospo-ops/types'

function furniture(over: Partial<FurnitureView> = {}): FurnitureView {
  return {
    id: 'f1',
    venueId: 'v1',
    name: 'BANQUET 180',
    furnitureType: 'TABLE',
    shape: 'RECTANGLE',
    width: 180,
    depth: 75,
    vertices: null,
    colour: '#e6c347',
    imageUrl: null,
    totalQty: 10,
    placedCount: 2,
    defaultChairCount: 6,
    seatingDensity: 60,
    maxHeadChairs: 1,
    tableNumbers: null,
    chairItemId: null,
    categoryId: 'c1',
    isActive: true,
    bomItems: [],
    ...over,
  }
}

describe('FurniturePalette', () => {
  it('renders a tile per placeable piece', () => {
    render(
      <FurniturePalette
        furniture={[furniture(), furniture({ id: 'f2', name: 'ROUND 8' })]}
        armedId={null}
        onArm={vi.fn()}
      />,
    )
    expect(screen.getByText('BANQUET 180')).toBeTruthy()
    expect(screen.getByText('ROUND 8')).toBeTruthy()
  })

  it('shows availability as remaining over total', () => {
    render(<FurniturePalette furniture={[furniture()]} armedId={null} onArm={vi.fn()} />)
    expect(screen.getByText('8/10')).toBeTruthy()
  })

  it('shows the real dimensions', () => {
    render(<FurniturePalette furniture={[furniture()]} armedId={null} onArm={vi.fn()} />)
    expect(screen.getByText('180×75')).toBeTruthy()
  })

  it('hides chairs — they are placed by seating a table, not dropped on the floor', () => {
    render(
      <FurniturePalette
        furniture={[furniture(), furniture({ id: 'c9', name: 'DINING CHAIR', furnitureType: 'CHAIR' })]}
        armedId={null}
        onArm={vi.fn()}
      />,
    )
    expect(screen.queryByText('DINING CHAIR')).toBeNull()
    expect(screen.getByText('BANQUET 180')).toBeTruthy()
  })

  it('sets a furniture drag payload the editor can read', () => {
    render(<FurniturePalette furniture={[furniture()]} armedId={null} onArm={vi.fn()} />)
    const setData = vi.fn()
    fireEvent.dragStart(screen.getByTitle(/DRAG OR CLICK TO PLACE/), {
      dataTransfer: { setData, effectAllowed: '' },
    })
    expect(setData).toHaveBeenCalledWith('text/plain', `${FURNITURE_DRAG_PREFIX}f1`)
  })

  it('arms a tile on click and disarms it on a second click', () => {
    const onArm = vi.fn()
    const { rerender } = render(
      <FurniturePalette furniture={[furniture()]} armedId={null} onArm={onArm} />,
    )
    fireEvent.click(screen.getByTitle(/DRAG OR CLICK TO PLACE/))
    expect(onArm).toHaveBeenCalledWith('f1')

    rerender(<FurniturePalette furniture={[furniture()]} armedId="f1" onArm={onArm} />)
    fireEvent.click(screen.getByTitle(/DRAG OR CLICK TO PLACE/))
    expect(onArm).toHaveBeenLastCalledWith(null)
  })

  it('explains how to place once a tile is armed', () => {
    render(<FurniturePalette furniture={[furniture()]} armedId="f1" onArm={vi.fn()} />)
    expect(screen.getByText(/CLICK THE PLAN TO PLACE/)).toBeTruthy()
  })

  it('marks a fully-placed piece as unavailable and blocks dragging it', () => {
    render(
      <FurniturePalette
        furniture={[furniture({ totalQty: 3, placedCount: 3 })]}
        armedId={null}
        onArm={vi.fn()}
      />,
    )
    const tile = screen.getByTitle(/ALL 3 ARE ALREADY PLACED/)
    expect(tile.getAttribute('draggable')).toBe('false')
    expect(screen.getByText('0/3')).toBeTruthy()
  })

  it('treats an unstocked piece as unlimited rather than unavailable', () => {
    render(
      <FurniturePalette
        furniture={[furniture({ totalQty: 0, placedCount: 0 })]}
        armedId={null}
        onArm={vi.fn()}
      />,
    )
    expect(screen.getByText('∞')).toBeTruthy()
  })

  it('filters by search', () => {
    render(
      <FurniturePalette
        furniture={[furniture(), furniture({ id: 'f2', name: 'ROUND 8' })]}
        armedId={null}
        onArm={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('SEARCH...'), { target: { value: 'round' } })
    expect(screen.getByText('ROUND 8')).toBeTruthy()
    expect(screen.queryByText('BANQUET 180')).toBeNull()
  })

  it('points at inventory when there is no furniture yet', () => {
    render(<FurniturePalette furniture={[]} armedId={null} onArm={vi.fn()} />)
    expect(screen.getByText(/ADD IT UNDER INVENTORY/)).toBeTruthy()
  })

  it('explains itself instead of offering furniture when no layout is active', () => {
    render(
      <FurniturePalette
        furniture={[furniture()]}
        armedId={null}
        onArm={vi.fn()}
        disabled
        disabledReason="SWITCH TO A TABLE LAYOUT TO PLACE FURNITURE"
      />,
    )
    expect(screen.getByText('SWITCH TO A TABLE LAYOUT TO PLACE FURNITURE')).toBeTruthy()
    expect(screen.queryByText('BANQUET 180')).toBeNull()
  })

  it('renders a custom polygon outline without crashing', () => {
    const { container } = render(
      <FurniturePalette
        furniture={[
          furniture({
            shape: 'POLYGON',
            width: 200,
            depth: 200,
            vertices: [
              { x: 0, y: 0 },
              { x: 200, y: 0 },
              { x: 200, y: 100 },
              { x: 100, y: 100 },
              { x: 100, y: 200 },
              { x: 0, y: 200 },
            ],
          }),
        ]}
        armedId={null}
        onArm={vi.fn()}
      />,
    )
    expect(container.querySelector('polygon')).toBeTruthy()
  })
})
