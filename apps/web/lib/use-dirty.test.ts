// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { stableStringify, useDirty, useBeforeUnload } from '@/lib/use-dirty'

describe('stableStringify', () => {
  it('ignores object key insertion order', () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }))
  })

  it('keeps array order significant', () => {
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]))
  })

  it('sorts nested keys and serialises dates', () => {
    const dates = new Date('2026-10-08T00:00:00.000Z')
    expect(stableStringify({ outer: { z: 1, a: dates } })).toBe(
      stableStringify({ outer: { a: dates, z: 1 } }),
    )
  })
})

describe('useDirty', () => {
  it('is clean at baseline, dirty on change, and clean again after markClean', () => {
    const { result, rerender } = renderHook(({ value }) => useDirty(value), {
      initialProps: { value: { name: 'A', qty: 1 } },
    })

    expect(result.current.dirty).toBe(false)

    rerender({ value: { name: 'A', qty: 2 } })
    expect(result.current.dirty).toBe(true)

    act(() => result.current.markClean())
    expect(result.current.dirty).toBe(false)

    rerender({ value: { name: 'A', qty: 2 } })
    expect(result.current.dirty).toBe(false)
  })

  it('treats a re-created but equal object as clean', () => {
    const { result, rerender } = renderHook(({ value }) => useDirty(value), {
      initialProps: { value: { a: 1, b: { c: 2 } } },
    })

    rerender({ value: { b: { c: 2 }, a: 1 } })
    expect(result.current.dirty).toBe(false)
  })

  it('baselines the loaded value when enabled flips from false to true', () => {
    const { result, rerender } = renderHook(
      ({ value, enabled }) => useDirty(value, { enabled }),
      { initialProps: { value: { name: '' }, enabled: false } },
    )

    rerender({ value: { name: 'LOADED' }, enabled: false })
    expect(result.current.dirty).toBe(false)

    rerender({ value: { name: 'LOADED' }, enabled: true })
    expect(result.current.dirty).toBe(false)

    rerender({ value: { name: 'EDITED' }, enabled: true })
    expect(result.current.dirty).toBe(true)
  })
})

describe('useBeforeUnload', () => {
  it('adds the listener only while dirty and removes it on unmount', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')

    const { rerender, unmount } = renderHook(({ dirty }) => useBeforeUnload(dirty), {
      initialProps: { dirty: false },
    })

    expect(add.mock.calls.some((c) => c[0] === 'beforeunload')).toBe(false)

    rerender({ dirty: true })
    expect(add.mock.calls.some((c) => c[0] === 'beforeunload')).toBe(true)

    unmount()
    expect(remove.mock.calls.some((c) => c[0] === 'beforeunload')).toBe(true)
  })
})
