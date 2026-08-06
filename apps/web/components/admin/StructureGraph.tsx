'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  buildGraphLayout,
  type StructureGraphData,
  type StructureGNode,
  type StructureNodeType,
} from '@/lib/structure-graph'

type NodeType = StructureNodeType
type GNode = StructureGNode
type GraphData = StructureGraphData

const TYPE_META: Record<NodeType, { label: string; colour: string }> = {
  venue: { label: 'VENUE', colour: '#FFFFFF' },
  department: { label: 'DEPARTMENT', colour: '#FACC15' },
  section: { label: 'SECTION', colour: '#60A5FA' },
  position: { label: 'POSITION', colour: '#F472B6' },
  staff: { label: 'STAFF', colour: '#C084FC' },
  pathway: { label: 'PATHWAY', colour: '#22D3EE' },
  checklist: { label: 'LIST', colour: '#4ADE80' },
  task: { label: 'TASK', colour: '#E8E8E8' },
  guide: { label: 'GUIDE', colour: '#F97316' },
}

const EDGE_META: Record<string, { label: string; colour: string; dashed?: boolean }> = {
  contains: { label: 'CONTAINS', colour: '#3A3A3A' },
  member: { label: 'MEMBER OF', colour: '#3A3A3A' },
  works: { label: 'WORKS SECTION', colour: '#6B4A8A', dashed: true },
  holds: { label: 'HOLDS ROLE', colour: '#F472B6', dashed: true },
  step: { label: 'PATHWAY STEP', colour: '#22D3EE' },
  scope: { label: 'SCOPED TO', colour: '#2E2E2E', dashed: true },
  assigned: { label: 'ASSIGNED', colour: '#C084FC' },
  'list-task': { label: 'LIST → TASK', colour: '#4ADE80' },
  'how-to': { label: 'HOW-TO', colour: '#F97316' },
  requires: { label: 'REQUIRES TRAINING', colour: '#F87171' },
  embeds: { label: 'EMBEDS LIST', colour: '#4ADE80', dashed: true },
  related: { label: 'RELATED', colour: '#F97316', dashed: true },
}

function EntityNode({ data, selected }: NodeProps) {
  const d = data as unknown as { node: GNode; dimmed: boolean }
  const meta = TYPE_META[d.node.type]
  const accent = d.node.colour ?? meta.colour
  return (
    <div
      className="border bg-grey-dark px-2 py-1.5 transition-opacity"
      style={{
        borderColor: selected ? '#FFFFFF' : '#2E2E2E',
        borderLeftColor: accent,
        borderLeftWidth: 3,
        opacity: d.dimmed ? 0.18 : 1,
        width: 200,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: '#2E2E2E', width: 6, height: 6 }} />
      <div className="font-mono text-[9px] uppercase tracking-widest" style={{ color: meta.colour }}>
        {meta.label}
      </div>
      <div className="font-mono text-[11px] text-white leading-tight truncate">{d.node.label}</div>
      {d.node.sub && <div className="font-mono text-[9px] uppercase text-grey-light truncate">{d.node.sub}</div>}
      <Handle type="source" position={Position.Right} style={{ background: '#2E2E2E', width: 6, height: 6 }} />
    </div>
  )
}

const nodeTypes = { entity: EntityNode }

export function StructureGraph() {
  const [data, setData] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [venueId, setVenueId] = useState<string>('')
  const [hidden, setHidden] = useState<Set<NodeType>>(new Set())
  const [focusId, setFocusId] = useState<string | null>(null)

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node>([])
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([])

  useEffect(() => {
    fetch('/api/admin/structure/graph')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: GraphData | null) => {
        setData(d)
        if (d?.venues.length) setVenueId(d.venues[0].id)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // Neighbours of the focused node (for highlight).
  // Build laid-out nodes + styled edges whenever data / filters / focus change.
  useEffect(() => {
    if (!data) return
    const { nodes: laid, edges: laidEdges } = buildGraphLayout(data, venueId, hidden, focusId)

    const rfLaidOut: Node[] = laid.map((n) => ({
      id: n.id,
      type: 'entity',
      position: { x: n.x, y: n.y },
      data: { node: n, dimmed: n.dimmed },
      selected: n.focused,
    }))

    const styledEdges: Edge[] = laidEdges.map((e) => {
      const meta = EDGE_META[e.kind] ?? { label: e.kind, colour: '#3A3A3A' }
      const highlighted = !!focusId && e.active
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        animated: highlighted,
        style: {
          stroke: meta.colour,
          strokeWidth: highlighted ? 2 : 1,
          strokeDasharray: meta.dashed ? '4 3' : undefined,
          opacity: e.active ? 0.9 : 0.08,
        },
      }
    })

    setRfNodes(rfLaidOut)
    setRfEdges(styledEdges)
  }, [data, venueId, hidden, focusId, setRfNodes, setRfEdges])

  const toggleType = (t: NodeType) =>
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })

  const onNodeClick = useCallback((_: unknown, node: Node) => {
    setFocusId((cur) => (cur === node.id ? null : node.id))
  }, [])

  if (loading) return <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
  if (!data || data.venues.length === 0) return <p className="font-mono text-xs text-grey-light">NO VENUES FOUND.</p>

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        {data.venues.length > 1 && (
          <select
            value={venueId}
            onChange={(e) => { setVenueId(e.target.value); setFocusId(null) }}
            className="bg-black border border-grey-mid text-white font-mono text-xs uppercase px-2 py-1.5 outline-none focus:border-white"
          >
            {data.venues.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        )}
        <div className="flex items-center gap-1.5 flex-wrap">
          {(Object.keys(TYPE_META) as NodeType[]).map((t) => {
            const on = !hidden.has(t)
            return (
              <button
                key={t}
                onClick={() => toggleType(t)}
                className="font-mono text-[10px] uppercase tracking-wider border px-1.5 py-0.5 transition-colors"
                style={{
                  borderColor: on ? TYPE_META[t].colour : '#2E2E2E',
                  color: on ? TYPE_META[t].colour : '#6B6B6B',
                  opacity: on ? 1 : 0.5,
                }}
              >
                {TYPE_META[t].label}
              </button>
            )
          })}
        </div>
        {focusId && (
          <button
            onClick={() => setFocusId(null)}
            className="font-mono text-[10px] uppercase tracking-wider border border-grey-mid px-2 py-0.5 text-grey-light hover:text-white hover:border-white transition-colors"
          >
            CLEAR FOCUS ✕
          </button>
        )}
      </div>

      <p className="font-mono text-[10px] text-grey-light uppercase">
        CLICK A NODE TO TRACE ITS LINKS · DRAG TO REARRANGE · SCROLL TO ZOOM
      </p>

      {/* Canvas */}
      <div className="border border-grey-mid" style={{ height: '72vh', background: '#000' }}>
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onPaneClick={() => setFocusId(null)}
          fitView
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          colorMode="dark"
        >
          <Background color="#1A1A1A" gap={24} />
          <Controls showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            style={{ background: '#0A0A0A', border: '1px solid #2E2E2E' }}
            nodeColor={(n) => {
              const gn = (n.data as { node?: GNode })?.node
              return gn ? (TYPE_META[gn.type].colour) : '#2E2E2E'
            }}
            maskColor="rgba(0,0,0,0.7)"
          />
        </ReactFlow>
      </div>

      {/* Link legend */}
      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap">
        {Object.entries(EDGE_META).map(([kind, meta]) => (
          <span key={kind} className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-grey-light">
            <span
              className="inline-block w-4"
              style={{ borderTop: `2px ${meta.dashed ? 'dashed' : 'solid'} ${meta.colour}` }}
            />
            {meta.label}
          </span>
        ))}
      </div>
    </div>
  )
}
