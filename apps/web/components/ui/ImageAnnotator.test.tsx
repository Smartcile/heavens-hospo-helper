import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ImageAnnotator } from './ImageAnnotator'

function pointerEvent(type: string, props: Record<string, unknown>) {
  const e = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(e, props)
  return e
}

describe('ImageAnnotator', () => {
  afterEach(() => { vi.restoreAllMocks() })

  function mount(onSave = vi.fn()) {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({
      left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect))
    const utils = render(<ImageAnnotator src="/a.png" initial={null} onCancel={() => {}} onSave={onSave} />)
    const surface = utils.container.querySelector('img')!.parentElement as HTMLElement
    return { ...utils, surface, onSave }
  }

  it('draws a pen stroke and saves it as layer data', () => {
    const { surface, onSave } = mount()
    fireEvent(surface, pointerEvent('pointerdown', { pointerType: 'mouse', button: 0, clientX: 10, clientY: 10 }))
    fireEvent(surface, pointerEvent('pointermove', { clientX: 60, clientY: 60 }))
    fireEvent(surface, pointerEvent('pointerup', { clientX: 60, clientY: 60 }))

    fireEvent.click(screen.getByText('SAVE LAYER'))
    expect(onSave).toHaveBeenCalledTimes(1)
    const data = onSave.mock.calls[0][0]
    expect(data.shapes).toHaveLength(1)
    expect(data.shapes[0].tool).toBe('pen')
    expect(data.shapes[0].points[0]).toEqual({ x: 0.1, y: 0.1 })
  })

  it('undo removes the last stroke; clear removes them all', () => {
    const { surface, onSave } = mount()
    fireEvent(surface, pointerEvent('pointerdown', { pointerType: 'mouse', button: 0, clientX: 5, clientY: 5 }))
    fireEvent(surface, pointerEvent('pointermove', { clientX: 50, clientY: 50 }))
    fireEvent(surface, pointerEvent('pointerup', { clientX: 50, clientY: 50 }))

    fireEvent.click(screen.getByText('UNDO'))
    fireEvent.click(screen.getByText('SAVE LAYER'))
    expect(onSave.mock.calls[0][0].shapes).toHaveLength(0)

    fireEvent(surface, pointerEvent('pointerdown', { pointerType: 'mouse', button: 0, clientX: 5, clientY: 5 }))
    fireEvent(surface, pointerEvent('pointermove', { clientX: 50, clientY: 50 }))
    fireEvent(surface, pointerEvent('pointerup', { clientX: 50, clientY: 50 }))
    fireEvent.click(screen.getByText('CLEAR'))
    fireEvent.click(screen.getByText('SAVE LAYER'))
    expect(onSave.mock.calls[1][0].shapes).toHaveLength(0)
  })

  it('places text with the TEXT tool', () => {
    const { surface, onSave } = mount()
    fireEvent.click(screen.getByText('TEXT'))
    fireEvent(surface, pointerEvent('pointerdown', { pointerType: 'mouse', button: 0, clientX: 25, clientY: 40 }))
    const input = screen.getByPlaceholderText('TYPE...')
    fireEvent.change(input, { target: { value: 'CHECK THE SEAL' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    fireEvent.click(screen.getByText('SAVE LAYER'))
    const data = onSave.mock.calls[0][0]
    expect(data.texts).toHaveLength(1)
    expect(data.texts[0]).toMatchObject({ text: 'CHECK THE SEAL', x: 0.25, y: 0.4 })
  })

  it('draws an arrow as a two-point shape', () => {
    const { surface, onSave } = mount()
    fireEvent.click(screen.getByText('ARROW'))
    fireEvent(surface, pointerEvent('pointerdown', { pointerType: 'mouse', button: 0, clientX: 10, clientY: 10 }))
    fireEvent(surface, pointerEvent('pointermove', { clientX: 80, clientY: 20 }))
    fireEvent(surface, pointerEvent('pointerup', { clientX: 80, clientY: 20 }))
    fireEvent.click(screen.getByText('SAVE LAYER'))
    const data = onSave.mock.calls[0][0]
    expect(data.shapes[0].tool).toBe('arrow')
    expect(data.shapes[0].points).toHaveLength(2)
  })
})
