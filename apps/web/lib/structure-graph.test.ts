import { describe, it, expect } from 'vitest'
import {
  focusNeighbours,
  buildGraphLayout,
  STRUCTURE_COL_X,
  STRUCTURE_ROW_Y,
  type StructureGraphData,
  type StructureNodeType,
} from './structure-graph'

const data: StructureGraphData = {
  venues: [
    { id: 'v1', name: 'ALPHA' },
    { id: 'v2', name: 'BETA' },
  ],
  nodes: [
    { id: 'venue:v1', type: 'venue', label: 'ALPHA', venueId: 'v1' },
    { id: 'dept:d1', type: 'department', label: 'BAR', venueId: 'v1' },
    { id: 'section:s1', type: 'section', label: 'COFFEE', venueId: 'v1' },
    { id: 'checklist:c1', type: 'checklist', label: 'OPEN LIST', venueId: 'v1' },
    { id: 'task:t1', type: 'task', label: 'CLEAN', venueId: 'v1' },
    { id: 'task:t2', type: 'task', label: 'STOCK', venueId: 'v1' },
    { id: 'training:m1', type: 'training', label: 'BARISTA SOP', venueId: 'v1' },
    { id: 'venue:v2', type: 'venue', label: 'BETA', venueId: 'v2' },
    { id: 'task:t9', type: 'task', label: 'OTHER VENUE', venueId: 'v2' },
  ],
  edges: [
    { id: 'e1', source: 'venue:v1', target: 'dept:d1', kind: 'contains' },
    { id: 'e2', source: 'dept:d1', target: 'section:s1', kind: 'contains' },
    { id: 'e3', source: 'checklist:c1', target: 'task:t1', kind: 'list-task' },
    { id: 'e4', source: 'checklist:c1', target: 'task:t2', kind: 'list-task' },
    { id: 'e5', source: 'task:t1', target: 'training:m1', kind: 'requires' },
    { id: 'e6', source: 'venue:v2', target: 'task:t9', kind: 'contains' },
  ],
}

const noHidden = new Set<StructureNodeType>()

describe('focusNeighbours', () => {
  it('returns null nodeIds when nothing is focused', () => {
    const { nodeIds, edgeIds } = focusNeighbours(data.edges, null)
    expect(nodeIds).toBeNull()
    expect(edgeIds.size).toBe(0)
  })

  it('collects the focused node, its neighbours and touching edges', () => {
    const { nodeIds, edgeIds } = focusNeighbours(data.edges, 'checklist:c1')
    expect(nodeIds).not.toBeNull()
    expect([...nodeIds!].sort()).toEqual(['checklist:c1', 'task:t1', 'task:t2'])
    expect([...edgeIds].sort()).toEqual(['e3', 'e4'])
  })
})

describe('buildGraphLayout', () => {
  it('only includes nodes for the selected venue', () => {
    const { nodes } = buildGraphLayout(data, 'v1', noHidden, null)
    expect(nodes.every((n) => n.venueId === 'v1')).toBe(true)
    expect(nodes.find((n) => n.id === 'task:t9')).toBeUndefined()
  })

  it('drops edges whose endpoints are not both visible', () => {
    const { edges } = buildGraphLayout(data, 'v1', noHidden, null)
    // e6 belongs to v2 → excluded; the 5 v1 edges remain.
    expect(edges.map((e) => e.id).sort()).toEqual(['e1', 'e2', 'e3', 'e4', 'e5'])
  })

  it('positions nodes into type columns with stacked rows', () => {
    const { nodes } = buildGraphLayout(data, 'v1', noHidden, null)
    const dept = nodes.find((n) => n.id === 'dept:d1')!
    expect(dept.x).toBe(1 * STRUCTURE_COL_X)
    expect(dept.y).toBe(0)
    // Two tasks share the task column → stacked on successive rows.
    const tasks = nodes.filter((n) => n.type === 'task').sort((a, b) => a.y - b.y)
    expect(tasks).toHaveLength(2)
    expect(tasks[0].y).toBe(0)
    expect(tasks[1].y).toBe(STRUCTURE_ROW_Y)
    expect(tasks[0].x).toBe(tasks[1].x)
  })

  it('hides filtered-out node types and their edges', () => {
    const hidden = new Set<StructureNodeType>(['training'])
    const { nodes, edges } = buildGraphLayout(data, 'v1', hidden, null)
    expect(nodes.find((n) => n.type === 'training')).toBeUndefined()
    expect(edges.find((e) => e.id === 'e5')).toBeUndefined()
  })

  it('dims non-neighbours and deactivates non-touching edges when focused', () => {
    const { nodes, edges } = buildGraphLayout(data, 'v1', noHidden, 'checklist:c1')
    const focused = nodes.find((n) => n.id === 'checklist:c1')!
    expect(focused.focused).toBe(true)
    expect(focused.dimmed).toBe(false)
    // A task linked to the list stays bright.
    expect(nodes.find((n) => n.id === 'task:t1')!.dimmed).toBe(false)
    // An unrelated node dims.
    expect(nodes.find((n) => n.id === 'dept:d1')!.dimmed).toBe(true)
    // Only the list→task edges are active.
    expect(edges.find((e) => e.id === 'e3')!.active).toBe(true)
    expect(edges.find((e) => e.id === 'e1')!.active).toBe(false)
  })

  it('marks all edges active when nothing is focused', () => {
    const { edges } = buildGraphLayout(data, 'v1', noHidden, null)
    expect(edges.every((e) => e.active)).toBe(true)
  })
})
