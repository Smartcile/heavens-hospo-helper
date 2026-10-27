// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { captureScroll, restoreScroll } from '@/lib/use-scroll-restore'

function scroller(key: string, scrollTop: number): HTMLElement {
  const el = document.createElement('div')
  el.dataset.scrollKey = key
  el.scrollTop = scrollTop
  document.body.appendChild(el)
  return el
}

function setWindowY(value: number) {
  Object.defineProperty(window, 'scrollY', { configurable: true, value })
}

describe('scroll restoration', () => {
  let scrollTo: ReturnType<typeof vi.fn>

  beforeEach(() => {
    document.body.innerHTML = ''
    scrollTo = vi.fn()
    Object.defineProperty(window, 'scrollTo', { configurable: true, value: scrollTo })
    setWindowY(0)
  })

  it('captures and restores the window and keyed containers', () => {
    setWindowY(120)
    const grid = scroller('availability-grid', 340)
    const snapshot = captureScroll()

    setWindowY(120)
    grid.scrollTop = 0
    restoreScroll(snapshot)

    expect(scrollTo).toHaveBeenCalledWith(0, 120)
    expect(grid.scrollTop).toBe(340)
  })

  it('does not fight an intentional window scroll during the refresh', () => {
    setWindowY(120)
    const grid = scroller('roster-grid', 200)
    const snapshot = captureScroll()

    // The user scrolled deliberately while the refresh was in flight.
    setWindowY(600)
    grid.scrollTop = 0
    restoreScroll(snapshot)

    expect(scrollTo).not.toHaveBeenCalled()
    // Inner containers are still restored.
    expect(grid.scrollTop).toBe(200)
  })

  it('does not restore a key that no longer exists', () => {
    setWindowY(0)
    const snapshot = { windowY: 0, elements: { gone: 99 } }
    expect(() => restoreScroll(snapshot)).not.toThrow()
  })
})
