import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { useWorkerImmersive } from '@/components/worker/useWorkerImmersive'

const postMessage = vi.fn()

function Harness({ active }: { active: boolean }) {
  useWorkerImmersive(active)
  return null
}

const originalParent = window.parent

beforeEach(() => {
  postMessage.mockReset()
  Object.defineProperty(window, 'parent', { value: { postMessage }, configurable: true })
})

afterEach(() => {
  Object.defineProperty(window, 'parent', { value: originalParent, configurable: true })
})

describe('useWorkerImmersive', () => {
  it('posts true on mount and false when the last view unmounts', () => {
    const { unmount } = render(<Harness active />)
    expect(postMessage).toHaveBeenCalledWith({ type: 'worker-immersive', immersive: true }, '*')
    unmount()
    expect(postMessage).toHaveBeenLastCalledWith({ type: 'worker-immersive', immersive: false }, '*')
  })

  it('does not post when inactive', () => {
    render(<Harness active={false} />)
    expect(postMessage).not.toHaveBeenCalled()
  })

  it('reference-counts overlapping full-screen views', () => {
    const first = render(<Harness active />)
    const second = render(<Harness active />)
    expect(postMessage).toHaveBeenCalledTimes(2)

    first.unmount()
    // Still one full-screen view open — the dashboard bar must stay hidden.
    expect(postMessage).toHaveBeenCalledTimes(2)

    second.unmount()
    expect(postMessage).toHaveBeenLastCalledWith({ type: 'worker-immersive', immersive: false }, '*')
  })
})
