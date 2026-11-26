/**
 * A tiny undo/redo stack for the floor-plan editor.
 *
 * The editor keeps one snapshot of `{ elements, setupItems, zones }` per
 * geometry mutation. Pulling the stack mechanics out of the component makes the
 * "every change can be undone" rule testable without rendering Pixi: the
 * component only has to call `pushHistory` **before** it mutates.
 *
 * Prisma-free and client-safe.
 */

export interface HistoryStack<T> {
  past: T[]
  future: T[]
}

/** Keep history bounded so a long editing session cannot grow without limit. */
export const HISTORY_LIMIT = 100

export function emptyHistory<T>(): HistoryStack<T> {
  return { past: [], future: [] }
}

/**
 * Record the state *before* a mutation and drop any redo branch. New work after
 * an undo forks history, which is the expected behaviour.
 */
export function pushHistory<T>(stack: HistoryStack<T>, snapshot: T): void {
  stack.past.push(snapshot)
  while (stack.past.length > HISTORY_LIMIT) stack.past.shift()
  stack.future = []
}

/** Pop the previous snapshot and stash `current` for redo. Null when empty. */
export function undoHistory<T>(stack: HistoryStack<T>, current: T): T | null {
  if (stack.past.length === 0) return null
  const previous = stack.past.pop() as T
  stack.future.push(current)
  return previous
}

/** Re-apply the next snapshot and stash `current` for undo. Null when empty. */
export function redoHistory<T>(stack: HistoryStack<T>, current: T): T | null {
  if (stack.future.length === 0) return null
  const next = stack.future.pop() as T
  stack.past.push(current)
  return next
}
