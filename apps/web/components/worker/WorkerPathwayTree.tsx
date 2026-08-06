'use client'

// The tech tree. Deliberately CSS grid + SVG rather than React Flow: this runs
// on a phone, needs no dragging, and a canvas library would be a heavy download
// for a read-only view. Columns come from `stage`, so the layout is derived and
// nothing positional needs loading.

import { useLayoutEffect, useRef, useState } from 'react'

export interface TreeNode {
  id: string
  kind: 'GUIDE' | 'TASK' | 'CHECKLIST' | 'MILESTONE'
  title: string
  stage: number
  points: number
  status: 'LOCKED' | 'AVAILABLE' | 'DONE'
  blockedBy: string[]
}

export interface TreeEdge {
  fromNodeId: string
  toNodeId: string
}

const KIND_TAG: Record<TreeNode['kind'], string> = {
  GUIDE: 'GUIDE',
  TASK: 'TASK',
  CHECKLIST: 'LIST',
  MILESTONE: '★ MILESTONE',
}

const STATUS_STYLE: Record<TreeNode['status'], string> = {
  DONE: 'border-success bg-success/10 text-white',
  AVAILABLE: 'border-white bg-grey-dark text-white',
  LOCKED: 'border-grey-mid bg-black text-grey-light',
}

export function WorkerPathwayTree({
  nodes,
  edges,
  onOpen,
}: {
  nodes: TreeNode[]
  edges: TreeEdge[]
  onOpen: (node: TreeNode) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const nodeRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [lines, setLines] = useState<{ id: string; d: string; done: boolean }[]>([])
  const [box, setBox] = useState({ w: 0, h: 0 })

  const stages = [...new Set(nodes.map((n) => n.stage))].sort((a, b) => a - b)
  const byId = new Map(nodes.map((n) => [n.id, n]))

  // Connectors are measured from the laid-out DOM so they always match what the
  // grid actually did, at any screen width.
  useLayoutEffect(() => {
    // Built inside the effect rather than closed over: the outer `byId` is a new
    // Map every render, so depending on it would re-run this on every paint.
    const statusOf = new Map(nodes.map((n) => [n.id, n.status]))

    function measure() {
      const wrap = wrapRef.current
      if (!wrap) return
      const base = wrap.getBoundingClientRect()
      setBox({ w: base.width, h: base.height })

      setLines(
        edges.flatMap((e) => {
          const a = nodeRefs.current[e.fromNodeId]
          const b = nodeRefs.current[e.toNodeId]
          if (!a || !b) return []
          const ra = a.getBoundingClientRect()
          const rb = b.getBoundingClientRect()
          const x1 = ra.right - base.left
          const y1 = ra.top - base.top + ra.height / 2
          const x2 = rb.left - base.left
          const y2 = rb.top - base.top + rb.height / 2
          const mid = x1 + (x2 - x1) / 2
          return [{
            id: `${e.fromNodeId}-${e.toNodeId}`,
            d: `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`,
            done: statusOf.get(e.fromNodeId) === 'DONE',
          }]
        }),
      )
    }

    measure()
    const ro = new ResizeObserver(measure)
    if (wrapRef.current) ro.observe(wrapRef.current)
    window.addEventListener('resize', measure)
    return () => { ro.disconnect(); window.removeEventListener('resize', measure) }
  }, [nodes, edges])

  if (nodes.length === 0) {
    return <p className="font-mono text-xs text-grey-light px-4 py-6">THIS PATHWAY HAS NO STEPS YET.</p>
  }

  return (
    <div className="overflow-x-auto">
      <div ref={wrapRef} className="relative inline-flex gap-8 p-4 min-w-full">
        <svg
          className="pointer-events-none absolute inset-0"
          width={box.w}
          height={box.h}
          style={{ overflow: 'visible' }}
        >
          {lines.map((l) => (
            <path
              key={l.id}
              d={l.d}
              fill="none"
              stroke={l.done ? '#4ADE80' : '#2E2E2E'}
              strokeWidth={l.done ? 2 : 1}
              strokeDasharray={l.done ? undefined : '4 3'}
            />
          ))}
        </svg>

        {stages.map((stage) => (
          <div key={stage} className="relative flex flex-col gap-3 min-w-[11rem]">
            <div className="font-mono text-[10px] uppercase tracking-widest text-grey-light">
              STAGE {stage + 1}
            </div>
            {nodes
              .filter((n) => n.stage === stage)
              .map((n) => (
                <button
                  key={n.id}
                  ref={(el) => { nodeRefs.current[n.id] = el }}
                  onClick={() => onOpen(n)}
                  className={`relative z-10 w-44 border p-2.5 text-left transition-colors ${STATUS_STYLE[n.status]} ${
                    n.status === 'LOCKED' ? '' : 'hover:border-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-grey-light">
                      {KIND_TAG[n.kind]}
                    </span>
                    <span className="font-mono text-[9px] text-grey-light">
                      {n.status === 'LOCKED' ? '🔒' : n.status === 'DONE' ? '✓' : ''} {n.points}P
                    </span>
                  </div>
                  <div className="font-mono text-[11px] leading-tight mt-1 line-clamp-3">
                    {n.title}
                  </div>
                  {n.status === 'LOCKED' && n.blockedBy.length > 0 && (
                    <div className="font-mono text-[9px] uppercase text-grey-light mt-1 leading-tight">
                      NEEDS: {n.blockedBy.map((b) => byId.get(b)?.title ?? '?').join(', ')}
                    </div>
                  )}
                </button>
              ))}
          </div>
        ))}
      </div>
    </div>
  )
}
