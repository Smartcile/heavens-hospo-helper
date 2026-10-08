import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MultiImagePicker } from './MultiImagePicker'

function pointerEvent(type: string, props: Record<string, unknown>) {
  const e = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(e, props)
  return e
}

describe('MultiImagePicker', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('renders every image in order', () => {
    render(<MultiImagePicker value={['/a.png', '/b.png']} onChange={() => {}} />)
    expect(screen.getByAltText('image 1').getAttribute('src')).toBe('/a.png')
    expect(screen.getByAltText('image 2').getAttribute('src')).toBe('/b.png')
  })

  it('removes an image', () => {
    const onChange = vi.fn()
    render(<MultiImagePicker value={['/a.png', '/b.png']} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Remove image 1'))
    expect(onChange).toHaveBeenCalledWith(['/b.png'])
  })

  it('reorders images by dragging the touch grip', () => {
    const onChange = vi.fn()
    // Distinct rects so the nearest-centre maths maps a point to a tile.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const idx = Number((this as HTMLElement).dataset.index ?? 0)
      const left = idx * 70
      return { left, top: 0, width: 64, height: 64, right: left + 64, bottom: 64, x: left, y: 0, toJSON: () => ({}) } as DOMRect
    })
    render(<MultiImagePicker value={['/a.png', '/b.png', '/c.png']} onChange={onChange} />)

    const first = screen.getByAltText('image 1').parentElement as HTMLElement
    const grip = first.querySelector('[data-grip]') as HTMLElement
    fireEvent(grip, pointerEvent('pointerdown', { pointerType: 'touch', pointerId: 1, button: 0, clientX: 32, clientY: 32 }))
    fireEvent(first, pointerEvent('pointermove', { pointerId: 1, clientX: 190, clientY: 32 }))
    fireEvent(first, pointerEvent('pointerup', { pointerId: 1 }))

    expect(onChange).toHaveBeenCalledWith(['/b.png', '/c.png', '/a.png'])
  })

  it('does not start a drag from a plain touch on the tile', () => {
    const onChange = vi.fn()
    render(<MultiImagePicker value={['/a.png', '/b.png']} onChange={onChange} />)
    const tile = screen.getByAltText('image 1').parentElement as HTMLElement
    fireEvent(tile, pointerEvent('pointerdown', { pointerType: 'touch', pointerId: 1, button: 0, clientX: 10, clientY: 10 }))
    fireEvent(tile, pointerEvent('pointermove', { pointerId: 1, clientX: 400, clientY: 10 }))
    fireEvent(tile, pointerEvent('pointerup', { pointerId: 1 }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('hides the remove control when disabled', () => {
    render(<MultiImagePicker value={['/a.png']} onChange={() => {}} disabled />)
    expect(screen.queryByLabelText('Remove image 1')).toBeNull()
  })

  it('opens the popup on a tap that does not drag (admin)', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/auth/session')) return { ok: true, json: async () => ({ user: { role: 'ADMIN' } }) } as Response
      if (url.includes('/api/admin/image-annotations')) return { ok: true, json: async () => [] } as Response
      return { ok: false, json: async () => null } as Response
    })
    render(<MultiImagePicker value={['/a.png']} onChange={() => {}} usageKey="guide-step:s1" />)

    const tile = screen.getByAltText('image 1').parentElement as HTMLElement
    fireEvent(tile, pointerEvent('pointerdown', { pointerType: 'touch', pointerId: 1, button: 0, clientX: 10, clientY: 10 }))
    fireEvent(tile, pointerEvent('pointerup', { pointerId: 1, clientX: 10, clientY: 10 }))

    await waitFor(() => expect(screen.getByText('✎ ANNOTATE')).toBeTruthy())
  })
})
