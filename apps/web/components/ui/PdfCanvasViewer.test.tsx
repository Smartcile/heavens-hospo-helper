import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
}))

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: mocks.getDocument,
}))

import { PdfCanvasViewer } from './PdfCanvasViewer'

function readyDocument() {
  return { numPages: 0, destroy: vi.fn(), getPage: vi.fn() }
}

function scaleOf(viewer: HTMLElement): number {
  return Number(viewer.getAttribute('data-scale'))
}

function tap(viewer: HTMLElement, pointerId = 1) {
  fireEvent.pointerDown(viewer, {
    pointerId,
    pointerType: 'touch',
    button: 0,
    clientX: 100,
    clientY: 100,
  })
  fireEvent.pointerUp(viewer, {
    pointerId,
    pointerType: 'touch',
    button: 0,
    clientX: 100,
    clientY: 100,
  })
}

beforeEach(() => {
  // jsdom has no PointerEvent; testing-library falls back to a plain Event and
  // loses pointerId/pointerType/button. A minimal polyfill restores them.
  class FakePointerEvent extends MouseEvent {
    pointerId: number
    pointerType: string
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 0
      this.pointerType = init.pointerType ?? ''
    }
  }
  vi.stubGlobal('PointerEvent', FakePointerEvent)

  mocks.getDocument.mockReset()
  mocks.getDocument.mockReturnValue({ promise: Promise.resolve(readyDocument()) })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('PdfCanvasViewer', () => {
  it('exposes the source on the container and shows the error state when pdf.js cannot load', async () => {
    mocks.getDocument.mockReturnValue({ promise: Promise.reject(new Error('no pdf')) })
    render(<PdfCanvasViewer url="/api/admin/gift-cards/card-1/pdf?inline=1" title="GIFT CARD PREVIEW" />)
    const viewer = screen.getByTitle('GIFT CARD PREVIEW')
    expect(viewer.getAttribute('data-pdf-src')).toBe('/api/admin/gift-cards/card-1/pdf?inline=1')
    expect(await screen.findByText('PREVIEW UNAVAILABLE')).toBeTruthy()
  })

  it('applies a double-tap zoom in and back out to fit', async () => {
    let now = 1_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    render(<PdfCanvasViewer url="/api/admin/gift-cards/double-tap/pdf?inline=1" title="DOUBLE TAP" />)
    const viewer = screen.getByTitle('DOUBLE TAP')
    await waitFor(() => expect(scaleOf(viewer)).toBe(1.4))

    tap(viewer)
    now += 100
    tap(viewer)
    await waitFor(() => expect(scaleOf(viewer)).toBe(2))

    now += 500
    tap(viewer)
    now += 100
    tap(viewer)
    await waitFor(() => expect(scaleOf(viewer)).toBe(1))
  })

  it('pinches to scale around two fingers and restores touch-action afterwards', async () => {
    render(<PdfCanvasViewer url="/api/admin/gift-cards/pinch/pdf?inline=1" title="PINCH" />)
    const viewer = screen.getByTitle('PINCH')
    await waitFor(() => expect(scaleOf(viewer)).toBe(1.4))

    fireEvent.pointerDown(viewer, { pointerId: 1, pointerType: 'touch', button: 0, clientX: 100, clientY: 100 })
    fireEvent.pointerDown(viewer, { pointerId: 2, pointerType: 'touch', button: 0, clientX: 200, clientY: 100 })
    expect(viewer.style.touchAction).toBe('none')

    fireEvent.pointerMove(viewer, { pointerId: 2, pointerType: 'touch', clientX: 300, clientY: 100 })
    await waitFor(() => expect(scaleOf(viewer)).toBeCloseTo(2.8, 5))

    fireEvent.pointerUp(viewer, { pointerId: 2, pointerType: 'touch', clientX: 300, clientY: 100 })
    fireEvent.pointerUp(viewer, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 })
    await waitFor(() => expect(viewer.style.touchAction).toBe('pan-x pan-y'))
  })

  it('still pans with a single mouse pointer drag', async () => {
    render(<PdfCanvasViewer url="/api/admin/gift-cards/drag/pdf?inline=1" title="DRAG" />)
    const viewer = screen.getByTitle('DRAG')
    await waitFor(() => expect(scaleOf(viewer)).toBe(1.4))

    let scrollLeft = 100
    let scrollTop = 50
    Object.defineProperty(viewer, 'scrollLeft', {
      configurable: true,
      get: () => scrollLeft,
      set: (value: number) => { scrollLeft = value },
    })
    Object.defineProperty(viewer, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => { scrollTop = value },
    })

    fireEvent.pointerDown(viewer, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 200, clientY: 200 })
    fireEvent.pointerMove(viewer, { pointerId: 1, pointerType: 'mouse', clientX: 150, clientY: 180 })
    fireEvent.pointerUp(viewer, { pointerId: 1, pointerType: 'mouse', clientX: 150, clientY: 180 })

    expect(scrollLeft).toBe(150)
    expect(scrollTop).toBe(70)
  })

  it('remembers the zoom level when the same document is reopened', async () => {
    let now = 5_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const url = '/api/admin/gift-cards/remember/pdf?inline=1'
    const first = render(<PdfCanvasViewer url={url} title="REMEMBER ONE" />)
    const viewer = screen.getByTitle('REMEMBER ONE')
    await waitFor(() => expect(scaleOf(viewer)).toBe(1.4))
    tap(viewer)
    now += 100
    tap(viewer)
    await waitFor(() => expect(scaleOf(viewer)).toBe(2))
    first.unmount()

    render(<PdfCanvasViewer url={url} title="REMEMBER TWO" />)
    const reopened = screen.getByTitle('REMEMBER TWO')
    await waitFor(() => expect(scaleOf(reopened)).toBe(2))
  })
})
