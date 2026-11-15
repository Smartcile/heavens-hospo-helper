// ── Task live revision + in-memory hub ────────────────────────────────
// Prisma-free and client-safe. The server half (task-live.server.ts) binds
// `compute` to the database; this file only knows how to turn cheap counts /
// stamps into a stable revision string and how to fan that string out to the
// subscribers of one venue.
//
// `ChecklistTask` has no timestamp, so its rows are hashed into the revision.
// The hash is order-independent so a query that returns rows in a different
// order cannot fake a change.
// ──────────────────────────────────────────────────────────────────────

/** One `aggregate()` result: how many rows, and the newest timestamp. */
export interface RevisionPart {
  count: number
  /** ISO timestamp of the newest row, or null when there are none. */
  maxStamp: string | null
}

/** Canonical single-part string, e.g. `12:2026-11-15T03:04:05.000Z`. */
export function formatRevisionPart(part: RevisionPart): string {
  return `${part.count}:${part.maxStamp ?? '-'}`
}

/** Minimal row shape needed to fingerprint a venue's `ChecklistTask` rows. */
export interface ChecklistTaskRow {
  checklistId: string
  taskId: string
  sortOrder: number
  groupLabel: string | null
}

const HASH_SEED = 0x811c9dc5

/**
 * Stable 32-bit FNV-1a hash of the canonical, sorted row set. Sorting makes it
 * order-independent; the same rows always produce the same hash.
 */
export function hashChecklistTasks(rows: readonly ChecklistTaskRow[]): string {
  const keys = rows
    .map((r) => `${r.checklistId}\u0000${r.taskId}\u0000${r.sortOrder}\u0000${r.groupLabel ?? ''}`)
    .sort()

  let hash = HASH_SEED
  for (const key of keys) {
    for (let i = 0; i < key.length; i++) {
      hash ^= key.charCodeAt(i)
      hash = Math.imul(hash, 0x01000193)
    }
    // Row separator, so ["ab","c"] and ["a","bc"] cannot collide.
    hash ^= 0x1f
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export interface TaskLiveRevisionParts {
  task: RevisionPart
  completion: RevisionPart
  progress: RevisionPart
  checklist: RevisionPart
  department: RevisionPart
  section: RevisionPart
  checklistTaskHash: string
  checklistAudience: RevisionPart
  departmentLink: RevisionPart
}

/** Canonical venue revision string built from every contributing part. */
export function formatTaskRevision(parts: TaskLiveRevisionParts): string {
  return [
    `task=${formatRevisionPart(parts.task)}`,
    `completion=${formatRevisionPart(parts.completion)}`,
    `progress=${formatRevisionPart(parts.progress)}`,
    `checklist=${formatRevisionPart(parts.checklist)}`,
    `department=${formatRevisionPart(parts.department)}`,
    `section=${formatRevisionPart(parts.section)}`,
    `checklistTask=${parts.checklistTaskHash}`,
    `audience=${formatRevisionPart(parts.checklistAudience)}`,
    `deptLink=${formatRevisionPart(parts.departmentLink)}`,
  ].join('|')
}

// ── Hub ───────────────────────────────────────────────────────────────

export type TaskLiveSubscriber = (revision: string) => void

type TimerHandle = unknown
type SetIntervalFn = (fn: () => void, ms: number) => TimerHandle
type ClearIntervalFn = (handle: TimerHandle) => void

export interface TaskLiveHubOptions {
  /** Computes the current revision for one venue. */
  compute: (venueId: string) => Promise<string>
  /** Poll cadence while at least one subscriber is attached. Default 3 s. */
  intervalMs?: number
  /** Injectable for tests. */
  setInterval?: SetIntervalFn
  clearInterval?: ClearIntervalFn
  /** Optional error sink (defaults to a console warning, never throws). */
  onError?: (error: unknown, venueId: string) => void
}

export interface TaskLiveHub {
  /** Returns an unsubscribe function. */
  subscribe: (venueId: string, subscriber: TaskLiveSubscriber) => () => void
  /** Number of live subscribers for a venue (0 once the last one leaves). */
  subscriberCount: (venueId: string) => number
  /** True while this venue has a poller. */
  hasTimer: (venueId: string) => boolean
  /** Run one poll now. Exposed so tests (and manual triggers) can be deterministic. */
  tick: (venueId: string) => Promise<void>
  /** Stop every poller. */
  dispose: () => void
}

interface VenueEntry {
  revision: string | null
  subscribers: Set<TaskLiveSubscriber>
  timer: TimerHandle | null
  ticking: boolean
}

const defaultSetInterval: SetIntervalFn = (fn, ms) => {
  const handle = setInterval(fn, ms)
  // Never keep a Node process alive just for the SSE poller.
  ;(handle as { unref?: () => void }).unref?.()
  return handle
}

const defaultClearInterval: ClearIntervalFn = (handle) => {
  clearInterval(handle as ReturnType<typeof setInterval>)
}

export function createTaskLiveHub(options: TaskLiveHubOptions): TaskLiveHub {
  const {
    compute,
    intervalMs = 3_000,
    setInterval: setIntervalFn = defaultSetInterval,
    clearInterval: clearIntervalFn = defaultClearInterval,
    onError = (error, venueId) =>
      console.error(`[task-live] poll failed for venue ${venueId}:`, error),
  } = options

  const venues = new Map<string, VenueEntry>()

  const tick = async (venueId: string): Promise<void> => {
    const entry = venues.get(venueId)
    if (!entry || entry.subscribers.size === 0 || entry.ticking) return

    entry.ticking = true
    try {
      const next = await compute(venueId)
      // The last subscriber may have left while we were querying.
      if (venues.get(venueId) !== entry) return

      const previous = entry.revision
      entry.revision = next

      // First poll only records the baseline; a subscriber is never spammed
      // with the state it already loaded.
      if (previous === null || previous === next) return

      for (const subscriber of [...entry.subscribers]) {
        try {
          subscriber(next)
        } catch (error) {
          onError(error, venueId)
        }
      }
    } catch (error) {
      onError(error, venueId)
    } finally {
      entry.ticking = false
    }
  }

  const stopVenue = (venueId: string, entry: VenueEntry) => {
    if (entry.timer !== null) {
      clearIntervalFn(entry.timer)
      entry.timer = null
    }
    venues.delete(venueId)
  }

  const subscribe = (venueId: string, subscriber: TaskLiveSubscriber): (() => void) => {
    let entry = venues.get(venueId)
    if (!entry) {
      entry = { revision: null, subscribers: new Set(), timer: null, ticking: false }
      venues.set(venueId, entry)
      entry.timer = setIntervalFn(() => {
        void tick(venueId)
      }, intervalMs)
    }
    entry.subscribers.add(subscriber)

    const attached = entry
    return () => {
      // Ignore a stale unsubscribe if the venue was already stopped.
      if (venues.get(venueId) !== attached) return
      attached.subscribers.delete(subscriber)
      if (attached.subscribers.size === 0) stopVenue(venueId, attached)
    }
  }

  const subscriberCount = (venueId: string) => venues.get(venueId)?.subscribers.size ?? 0
  const hasTimer = (venueId: string) => venues.get(venueId)?.timer != null

  const dispose = () => {
    for (const [venueId, entry] of [...venues.entries()]) stopVenue(venueId, entry)
  }

  return { subscribe, subscriberCount, hasTimer, tick, dispose }
}
