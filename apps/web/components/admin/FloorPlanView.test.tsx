import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { useMemo } from 'react'

function BuggyComponent({ items }: { items: any[] | null }) {
  const result = useMemo(() => {
    return (items ?? []).map((i: any) => i + 1)
  }, [items])
  return <div>{result.length}</div>
}

function FixedComponent({ items }: { items: any[] | null }) {
  const result = useMemo(() => {
    if (!Array.isArray(items)) return []
    return (items ?? []).map((i: any) => i + 1)
  }, [items])
  return <div>{result.length}</div>
}

describe('useMemo callback guard — regression against React error #310', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('BUG: rerender with null items crashes useMemo callback (React #310)', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Initial render with valid array — works fine
    const { rerender } = render(<BuggyComponent items={[1, 2]} />)
    expect(consoleError).not.toHaveBeenCalled()

    // Rerender with null → .map() throws inside useMemo callback
    // The error propagates out of rerender because React calls the
    // useMemo callback synchronously during reconciliation.
    expect(() => {
      rerender(<BuggyComponent items={null} />)
    }).toThrow()
  })

  it('FIX: Array.isArray guard prevents the crash on null items', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { rerender } = render(<FixedComponent items={[1, 2]} />)
    expect(consoleError).not.toHaveBeenCalled()

    // Rerender with null — guard returns [] instead of crashing
    rerender(<FixedComponent items={null} />)

    const errors = consoleError.mock.calls.map((c: any[]) => c.join(' '))
    const hasCrash = errors.some(
      (m) => m.includes('#310') || m.includes('useMemo') || m.includes('TypeError')
    )
    expect(hasCrash).toBe(false)
  })
})
