// Pure layout + styling helpers for the Structure MAP (React Flow) view.
// Kept dependency-free so they can be unit-tested without mounting React Flow.

export type StructureNodeType =
  | 'venue' | 'department' | 'section' | 'position' | 'staff'
  | 'task' | 'checklist' | 'guide' | 'pathway'

export interface StructureGNode {
  id: string
  type: StructureNodeType
  label: string
  sub?: string
  colour?: string | null
  venueId: string
}
export interface StructureGEdge { id: string; source: string; target: string; kind: string }
export interface StructureGraphData {
  venues: { id: string; name: string }[]
  nodes: StructureGNode[]
  edges: StructureGEdge[]
}

export interface LaidOutNode extends StructureGNode {
  x: number
  y: number
  dimmed: boolean
  focused: boolean
}
export interface LaidOutEdge extends StructureGEdge {
  active: boolean
}

// Column order (left → right) so the workflow reads naturally.
export const STRUCTURE_COLUMN: Record<StructureNodeType, number> = {
  venue: 0, department: 1, section: 2, position: 3, staff: 4,
  pathway: 5, checklist: 6, task: 7, guide: 8,
}
export const STRUCTURE_COL_X = 340
export const STRUCTURE_ROW_Y = 92

// Neighbours (nodes + edges) touching the focused node — used for highlight/dim.
export function focusNeighbours(
  edges: StructureGEdge[],
  focusId: string | null,
): { nodeIds: Set<string> | null; edgeIds: Set<string> } {
  if (!focusId) return { nodeIds: null, edgeIds: new Set() }
  const nodeIds = new Set<string>([focusId])
  const edgeIds = new Set<string>()
  for (const e of edges) {
    if (e.source === focusId || e.target === focusId) {
      nodeIds.add(e.source)
      nodeIds.add(e.target)
      edgeIds.add(e.id)
    }
  }
  return { nodeIds, edgeIds }
}

// Lay visible nodes into type columns and mark visible/active edges.
export function buildGraphLayout(
  data: StructureGraphData,
  venueId: string,
  hidden: Set<StructureNodeType>,
  focusId: string | null,
): { nodes: LaidOutNode[]; edges: LaidOutEdge[] } {
  const visibleNodes = data.nodes.filter((n) => n.venueId === venueId && !hidden.has(n.type))
  const visibleIds = new Set(visibleNodes.map((n) => n.id))
  const { nodeIds: neighbourIds, edgeIds: activeEdgeIds } = focusNeighbours(data.edges, focusId)

  const rowByCol: Record<number, number> = {}
  const nodes: LaidOutNode[] = visibleNodes.map((n) => {
    const col = STRUCTURE_COLUMN[n.type]
    const row = rowByCol[col] ?? 0
    rowByCol[col] = row + 1
    return {
      ...n,
      x: col * STRUCTURE_COL_X,
      y: row * STRUCTURE_ROW_Y,
      dimmed: !!neighbourIds && !neighbourIds.has(n.id),
      focused: n.id === focusId,
    }
  })

  const edges: LaidOutEdge[] = data.edges
    .filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))
    .map((e) => ({ ...e, active: !focusId || activeEdgeIds.has(e.id) }))

  return { nodes, edges }
}
