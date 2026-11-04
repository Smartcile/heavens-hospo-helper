import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * JSON.stringify with object keys sorted, so two forms with the same values but
 * a different key-insertion order compare equal (no false "dirty").
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value))
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value instanceof Date) return value
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortValue((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

/**
 * Track whether a form value has changed since the last clean point.
 *
 * Pass `enabled: false` while the editor is still loading: the baseline is
 * captured the moment it becomes enabled (with the loaded values), so an async
 * load never looks dirty. Call `markClean()` after a successful save.
 */
export function useDirty<T>(
  value: T,
  options?: { enabled?: boolean },
): { dirty: boolean; markClean: () => void } {
  const enabled = options?.enabled ?? true
  const latest = useRef(value)
  latest.current = value
  const baseline = useRef<string | null>(null)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!enabled) return
    baseline.current = stableStringify(latest.current)
    setDirty(false)
  }, [enabled])

  useEffect(() => {
    if (!enabled || baseline.current === null) return
    setDirty(stableStringify(value) !== baseline.current)
  }, [value, enabled])

  const markClean = useCallback(() => {
    baseline.current = stableStringify(latest.current)
    setDirty(false)
  }, [])

  return { dirty, markClean }
}

/** Native browser prompt when the page is refreshed/closed with unsaved work. */
export function useBeforeUnload(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])
}
