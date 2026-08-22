'use client'

// The authored board. Unlike the Structure MAP (which is derived and recomputes
// its layout), every position here is deliberate and saved — so node changes are
// applied to state rather than regenerated from scratch on each render.

import { useCallback, useMemo, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type NodeProps,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

export type BoardKind = 'GUIDE' | 'TASK' | 'CHECKLIST' | 'MILESTONE'
export type BoardStatus = 'LOCKED' | 'AVAILABLE' | 'DONE'

export interface BoardNode {
  id: string
  kind: BoardKind
  targetId: string | null
  title: string
  x: number
  y: number
  stage: number
  points: number
  status?: BoardStatus
}

const KIND_COLOUR: Record<BoardKind, string> = {
  GUIDE: '#F97316',
  TASK: '#E8E8E8',
  CHECKLIST: '#4ADE80',
  MILESTONE: '#FACC15',
}

const STATUS_BORDER: Record<BoardStatus, string> = {
  DONE: '#4ADE80',
  AVAILABLE: '#FFFFFF',
  LOCKED: '#2E2E2E',
}

const CARD_BUTTON =
  'nodrag nopan font-mono text-[9px] uppercase leading-none border border-grey-mid px-1 py-0.5 text-grey-light hover:text-white hover:border-white transition-colors'

function PathwayNodeCard({
  data,
  selected,
}: NodeProps & { data: { node: BoardNode; onMoveStage: (id: string, dir: -1 | 1) => void; onDelete: (id: string) => void } }) {
  const n = data.node
  const accent = KIND_COLOUR[n.kind]
  const border = n.status ? STATUS_BORDER[n.status] : '#2E2E2E'

  return (
    <div
      className="border bg-grey-dark px-2 py-1.5"
      style={{
        borderColor: selected ? '#FFFFFF' : border,
        borderLeftColor: accent,
        borderLeftWidth: 3,
        width: 190,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: '#2E2E2E', width: 7, height: 7 }} />
      <div className="flex items-center justify-between gap-1">
        <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: accent }}>
          {n.kind === 'CHECKLIST' ? 'LIST' : n.kind}
        </span>
        <span className="font-mono text-[9px] text-grey-light">
          S{n.stage + 1} · {n.points}P
        </span>
      </div>
      <div className="font-mono text-[11px] text-white leading-tight line-clamp-2">{n.title}</div>
      {n.status && (
        <div className="font-mono text-[9px] uppercase" style={{ color: STATUS_BORDER[n.status] }}>
          {n.status}
        </div>
      )}
      <div className="mt-1.5 pt-1.5 border-t border-grey-mid flex items-center justify-between">
        <div className="flex items-center gap-1">
          {/* onMouseDown, not onClick: a click also selects the node, and the
              select change would re-apply stale nodes over the action. State
              from the mousedown flushes first, so the action sticks. */}
          <button type="button" className={CARD_BUTTON} title="STAGE UP" onMouseDown={() => data.onMoveStage(n.id, -1)}>↑</button>
          <button type="button" className={CARD_BUTTON} title="STAGE DOWN" onMouseDown={() => data.onMoveStage(n.id, 1)}>↓</button>
        </div>
        <button type="button" className={CARD_BUTTON} title="DELETE NODE" onMouseDown={() => data.onDelete(n.id)}>✕</button>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: '#2E2E2E', width: 7, height: 7 }} />
    </div>
  )
}

const nodeTypes = { pathway: PathwayNodeCard }

export function PathwayBoard({
  nodes,
  edges,
  selectedId,
  onNodesChange,
  onEdgesChange,
  onSelect,
  onMoveStage,
  onDelete,
}: {
  nodes: BoardNode[]
  edges: { fromNodeId: string; toNodeId: string }[]
  selectedId: string | null
  onNodesChange: (next: BoardNode[]) => void
  onEdgesChange: (next: { fromNodeId: string; toNodeId: string }[]) => void
  onSelect: (id: string | null) => void
  onMoveStage: (id: string, dir: -1 | 1) => void
  onDelete: (id: string) => void
}) {
  // React Flow measures node sizes internally and reports them as
  // `dimensions` changes. Those must be echoed back onto the user nodes, or
  // every round trip wipes `measured` and every node renders
  // `visibility: hidden` forever (the classic empty-board bug). Capture the
  // measured sizes here and attach them to the nodes we hand back.
  const measuredRef = useRef<Map<string, { width: number; height: number }>>(new Map())

  const rfNodes: Node[] = useMemo(
    () =>
      nodes.map((n) => ({
        id: n.id,
        type: 'pathway',
        position: { x: n.x, y: n.y },
        data: { node: n, onMoveStage, onDelete },
        measured: measuredRef.current.get(n.id),
        // Selection is parent-owned: the inspector reads `selectedId`, so the
        // card's highlight is driven from there rather than React Flow's
        // internal select state.
        selected: n.id === selectedId,
      })),
    [nodes, selectedId, onMoveStage, onDelete],
  )

  const rfEdges: Edge[] = useMemo(
    () =>
      edges.map((e) => ({
        id: `${e.fromNodeId}->${e.toNodeId}`,
        source: e.fromNodeId,
        target: e.toNodeId,
        animated: false,
        style: { stroke: '#6B6B6B', strokeWidth: 1.5 },
      })),
    [edges],
  )

  // Positions are the point of this view, so drags are written straight back to
  // the caller's state instead of being recomputed away.
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const c of changes) {
        if (c.type === 'dimensions' && 'dimensions' in c && c.dimensions) {
          measuredRef.current.set(c.id, { width: c.dimensions.width, height: c.dimensions.height })
        }
      }
      const applied = applyNodeChanges(changes, rfNodes)
      const byId = new Map(applied.map((a) => [a.id, a.position]))
      onNodesChange(
        nodes.map((n) => {
          const p = byId.get(n.id)
          return p ? { ...n, x: p.x, y: p.y } : n
        }),
      )
      const sel = changes.find((c) => c.type === 'select' && c.selected)
      if (sel && 'id' in sel) onSelect(sel.id as string)
    },
    [rfNodes, nodes, onNodesChange, onSelect],
  )

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const next = applyEdgeChanges(changes, rfEdges)
      onEdgesChange(next.map((e) => ({ fromNodeId: e.source, toNodeId: e.target })))
    },
    [rfEdges, onEdgesChange],
  )

  const handleConnect = useCallback(
    (c: Connection) => {
      const next = addEdge({ ...c, id: `${c.source}->${c.target}` }, rfEdges)
      onEdgesChange(next.map((e) => ({ fromNodeId: e.source, toNodeId: e.target })))
    },
    [rfEdges, onEdgesChange],
  )

  return (
    <div className="border border-grey-mid" style={{ height: '68vh', background: '#000' }}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onPaneClick={() => onSelect(null)}
        fitView
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        colorMode="dark"
        deleteKeyCode={null}
      >
        <Background color="#1A1A1A" gap={24} />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          style={{ background: '#0A0A0A', border: '1px solid #2E2E2E' }}
          nodeColor={(n) => KIND_COLOUR[((n.data as { node?: BoardNode })?.node?.kind) ?? 'TASK']}
          maskColor="rgba(0,0,0,0.7)"
        />
      </ReactFlow>
    </div>
  )
}
