// Pathway board mutations — pure and Prisma-free so the same operations drive
// the board cards and the tree rows (and are unit-testable without a canvas).
//
// Reordering rules:
// - "within stage" = the tree's list order = `sortOrder` = array index, and on
//   the board it is the y stack inside a stage column. A swap moves BOTH, so
//   the tree and the board never disagree.
// - "stage" = the tier. `addNode` places stage N at x = 60 + N * 260, so a
//   stage shift snaps x back to that column (y is untouched — the card stays
//   at the same vertical spot, just in a different tier).
//
// The helpers are generic over `T extends BoardOpsNode` so callers get their
// own node type back (e.g. `BoardNode[]`), not a reduced structural subset.

export interface BoardOpsNode {
  id: string
  stage: number
  x: number
  y: number
}

export const STAGE_X = 260 // px per stage column (matches addNode)

export function reorderWithinStage<T extends BoardOpsNode>(
  nodes: readonly T[],
  id: string,
  dir: -1 | 1,
): T[] {
  const idx = nodes.findIndex((n) => n.id === id)
  if (idx < 0) return nodes as T[]
  const stage = nodes[idx].stage

  const group = nodes
    .map((n, i) => ({ n, i }))
    .filter((x) => x.n.stage === stage)
  const pos = group.findIndex((x) => x.n.id === id)
  const other = group[pos + dir]
  if (!other) return nodes as T[]

  const next = [...nodes]
  next[idx] = { ...nodes[other.i], y: nodes[idx].y }
  next[other.i] = { ...nodes[idx], y: nodes[other.i].y }
  return next
}

export function shiftStage<T extends BoardOpsNode>(
  nodes: readonly T[],
  id: string,
  dir: -1 | 1,
): T[] {
  return nodes.map((n) => {
    if (n.id !== id) return n
    const stage = Math.max(0, n.stage + dir)
    return { ...n, stage, x: 60 + stage * STAGE_X }
  })
}

export function deleteNodeAndEdges<
  T extends BoardOpsNode,
  E extends { fromNodeId: string; toNodeId: string },
>(nodes: readonly T[], edges: readonly E[], id: string) {
  return {
    nodes: nodes.filter((n) => n.id !== id),
    edges: edges.filter((e) => e.fromNodeId !== id && e.toNodeId !== id),
  }
}
