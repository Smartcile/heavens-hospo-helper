import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { FloorplanToolbar } from '@/components/admin/FloorplanToolbar'

describe('FloorplanToolbar', () => {
  it('renders zoom slider', () => {
    const { container } = render(
      <FloorplanToolbar zoom={1} onZoomChange={vi.fn()} showDimensions={false} onShowDimensionsChange={vi.fn()} />
    )
    expect(container.querySelector('input[type="range"]')).toBeTruthy()
    expect(container.textContent).toContain('ZOOM')
  })

  it('displays DIM button with unchecked state', () => {
    const { getByText } = render(
      <FloorplanToolbar zoom={1} onZoomChange={vi.fn()} showDimensions={false} onShowDimensionsChange={vi.fn()} />
    )
    expect(getByText('[ ] DIM')).toBeTruthy()
  })

  it('displays DIM button with checked state', () => {
    const { getByText } = render(
      <FloorplanToolbar zoom={1} onZoomChange={vi.fn()} showDimensions={true} onShowDimensionsChange={vi.fn()} />
    )
    expect(getByText('[x] DIM')).toBeTruthy()
  })

  it('calls onZoomChange on slider input', () => {
    const onZoom = vi.fn()
    const { container } = render(
      <FloorplanToolbar zoom={1} onZoomChange={onZoom} showDimensions={false} onShowDimensionsChange={vi.fn()} />
    )
    fireEvent.input(container.querySelector('input[type="range"]')!, { target: { value: '2' } })
    expect(onZoom).toHaveBeenCalledWith(2)
  })

  it('toggles DIM on button click', () => {
    const onDim = vi.fn()
    const { getByText } = render(
      <FloorplanToolbar zoom={1} onZoomChange={vi.fn()} showDimensions={false} onShowDimensionsChange={onDim} />
    )
    fireEvent.click(getByText('[ ] DIM'))
    expect(onDim).toHaveBeenCalledWith(true)
  })
})
