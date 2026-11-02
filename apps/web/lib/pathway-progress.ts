// Pathway progress — the single brain behind the admin board, the admin tree
// list, the worker tech tree and the staff detail modal.
//
// Deliberately pure and Prisma-free: progress is never stored. The caller works
// out which nodes are done (from GuideCompletion / TaskCompletion rows that
// already exist) and hands in the id set; everything else is graph logic.

export type NodeStatus = 'LOCKED' | 'AVAILABLE' | 'DONE'

export type PathwayNodeKind = 'GUIDE' | 'TASK' | 'CHECKLIST' | 'MILESTONE'

export interface ProgressNode {
  id: string
  kind: PathwayNodeKind
  points: number
}

export interface ProgressEdge {
  fromNodeId: string
  toNodeId: string
}

export interface NodeProgress {
  id: string
  status: NodeStatus
  /** Prerequisite node ids that are not yet DONE — what to show on a locked node. */
  blockedBy: string[]
}

export interface PathwayProgress {
  nodes: NodeProgress[]
  earnedPoints: number
  totalPoints: number
  level: number
  /** Points needed to reach the next level, or null at the top of the table. */
  nextLevelAt: number | null
}

// Rising gaps so early wins come fast and later ones feel earned. Beyond the
// table, each level costs LEVEL_STEP.
const LEVEL_THRESHOLDS = [0, 50, 150, 300, 500, 750, 1050, 1400]
const LEVEL_STEP = 400

/** 1-based level for a points total. */
export function levelForPoints(points: number): number {
  const p = Math.max(0, points)
  const last = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1]
  if (p >= last) return LEVEL_THRESHOLDS.length + Math.floor((p - last) / LEVEL_STEP)

  let level = 1
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
    if (p >= LEVEL_THRESHOLDS[i]) level = i + 1
  }
  return level
}

/** Points at which the next level is reached. */
export function nextLevelThreshold(points: number): number {
  const level = levelForPoints(points)
  if (level < LEVEL_THRESHOLDS.length) return LEVEL_THRESHOLDS[level]
  const last = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1]
  return last + (level - LEVEL_THRESHOLDS.length + 1) * LEVEL_STEP
}

/**
 * Resolve every node to LOCKED / AVAILABLE / DONE.
 *
 * Rules:
 * - A node the person has completed is DONE, even if its prerequisites aren't.
 *   Work is never blocked on the floor, so someone can legitimately finish a
 *   guide out of order (via the bible, or a manager sign-off) and that must
 *   stick rather than being recomputed away.
 * - A MILESTONE has no completion of its own — it is awarded automatically once
 *   every prerequisite is DONE. A milestone with no prerequisites is AVAILABLE,
 *   not DONE, since there is nothing to earn it from yet.
 * - Anything else is AVAILABLE when all prerequisites are DONE, else LOCKED.
 * - Cycles resolve to LOCKED rather than hanging: the fixpoint loop simply stops
 *   making progress and whatever is left over is locked.
 */
export function resolvePathwayProgress(
  nodes: readonly ProgressNode[],
  edges: readonly ProgressEdge[],
  completedNodeIds: ReadonlySet<string>,
): PathwayProgress {
  const byId = new Map(nodes.map((n) => [n.id, n]))

  // Prerequisites per node, ignoring edges that point at nodes we don't have.
  const incoming = new Map<string, string[]>()
  for (const n of nodes) incoming.set(n.id, [])
  for (const e of edges) {
    if (!byId.has(e.fromNodeId) || !byId.has(e.toNodeId)) continue
    incoming.get(e.toNodeId)!.push(e.fromNodeId)
  }

  const status = new Map<string, NodeStatus>()
  for (const n of nodes) {
    if (n.kind !== 'MILESTONE' && completedNodeIds.has(n.id)) status.set(n.id, 'DONE')
  }

  // Fixpoint: milestones can complete other milestones, so keep going until a
  // full pass changes nothing.
  let changed = true
  while (changed) {
    changed = false
    for (const n of nodes) {
      if (status.has(n.id)) continue
      const prereqs = incoming.get(n.id)!
      const allDone = prereqs.every((p) => status.get(p) === 'DONE')
      if (!allDone) continue

      if (n.kind === 'MILESTONE' && prereqs.length > 0) status.set(n.id, 'DONE')
      else status.set(n.id, 'AVAILABLE')
      changed = true
    }
  }

  const result: NodeProgress[] = nodes.map((n) => {
    const s = status.get(n.id) ?? 'LOCKED'
    return {
      id: n.id,
      status: s,
      blockedBy:
        s === 'LOCKED'
          ? incoming.get(n.id)!.filter((p) => status.get(p) !== 'DONE')
          : [],
    }
  })

  const totalPoints = nodes.reduce((sum, n) => sum + n.points, 0)
  const earnedPoints = result.reduce(
    (sum, r) => (r.status === 'DONE' ? sum + (byId.get(r.id)?.points ?? 0) : sum),
    0,
  )

  return {
    nodes: result,
    earnedPoints,
    totalPoints,
    level: levelForPoints(earnedPoints),
    nextLevelAt: nextLevelThreshold(earnedPoints),
  }
}

/**
 * Reject a pathway whose edges form a cycle — a cycle makes part of the tree
 * permanently unreachable, so it should fail on save rather than silently
 * stranding nodes.
 */
export function findPathwayCycle(
  nodes: readonly { id: string }[],
  edges: readonly ProgressEdge[],
): string[] | null {
  const ids = new Set(nodes.map((n) => n.id))
  const out = new Map<string, string[]>()
  for (const id of ids) out.set(id, [])
  for (const e of edges) {
    if (ids.has(e.fromNodeId) && ids.has(e.toNodeId)) out.get(e.fromNodeId)!.push(e.toNodeId)
  }

  const UNVISITED = 0, ACTIVE = 1, DONE = 2
  const state = new Map<string, number>([...ids].map((id) => [id, UNVISITED]))
  const stack: string[] = []

  function walk(id: string): string[] | null {
    state.set(id, ACTIVE)
    stack.push(id)
    for (const next of out.get(id)!) {
      const s = state.get(next)
      if (s === ACTIVE) return [...stack.slice(stack.indexOf(next)), next]
      if (s === UNVISITED) {
        const found = walk(next)
        if (found) return found
      }
    }
    stack.pop()
    state.set(id, DONE)
    return null
  }

  for (const id of ids) {
    if (state.get(id) === UNVISITED) {
      const found = walk(id)
      if (found) return found
    }
  }
  return null
}
