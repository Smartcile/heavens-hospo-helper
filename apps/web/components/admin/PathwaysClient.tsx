'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { getActiveVenueId } from '@/lib/active-venue'
import { resolvePathwayProgress } from '@/lib/pathway-progress'
import { deleteNodeAndEdges, reorderWithinStage, shiftStage } from '@/lib/pathway-board-ops'
import type { BoardKind, BoardNode } from '@/components/admin/PathwayBoard'

// React Flow measures the DOM, so it can't render on the server.
const PathwayBoard = dynamic(
  () => import('@/components/admin/PathwayBoard').then((m) => m.PathwayBoard),
  { ssr: false, loading: () => <p className="font-mono text-xs text-grey-light loading-cursor">LOADING BOARD</p> },
)

interface PathwayListItem {
  id: string
  name: string
  description: string | null
  status: 'DRAFT' | 'PUBLISHED'
  departmentId: string | null
  sectionId: string | null
  positionId: string | null
  department: { name: string } | null
  section: { name: string } | null
  position: { name: string } | null
  _count: { nodes: number }
}

interface Option { value: string; label: string }
type LinkTargets = Record<'ITEM' | 'TASK' | 'CHECKLIST' | 'GUIDE' | 'SECTION' | 'RECIPE', Option[]>

const EMPTY_TARGETS: LinkTargets = {
  ITEM: [], TASK: [], CHECKLIST: [], GUIDE: [], SECTION: [], RECIPE: [],
}

const NODE_KINDS: { value: BoardKind; label: string }[] = [
  { value: 'GUIDE', label: 'GUIDE' },
  { value: 'TASK', label: 'TASK' },
  { value: 'CHECKLIST', label: 'CHECKLIST' },
  { value: 'MILESTONE', label: 'MILESTONE' },
]

let tempCounter = 0
const nextTempId = () => `new_${++tempCounter}`

export function PathwaysClient({
  role, sessionVenueId, defaultVenueId,
}: { role: string; sessionVenueId: string; defaultVenueId?: string }) {
  const [pathways, setPathways] = useState<PathwayListItem[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [nodes, setNodes] = useState<BoardNode[]>([])
  const [edges, setEdges] = useState<{ fromNodeId: string; toNodeId: string }[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [targets, setTargets] = useState<LinkTargets>(EMPTY_TARGETS)
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])
  const [positions, setPositions] = useState<{ id: string; name: string }[]>([])
  const [tab, setTab] = useState<'board' | 'tree'>('board')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')

  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDept, setNewDept] = useState('')
  const [newSection, setNewSection] = useState('')
  const [newPosition, setNewPosition] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const venueId = getActiveVenueId(role, sessionVenueId, defaultVenueId)

  const loadList = useCallback(async () => {
    const r = await fetch(`/api/admin/pathways?venueId=${encodeURIComponent(venueId)}`)
    const data: PathwayListItem[] = r.ok ? await r.json() : []
    setPathways(data)
    setLoading(false)
    return data
  }, [venueId])

  useEffect(() => {
    if (!venueId) { setLoading(false); return }
    loadList()
    fetch(`/api/admin/guides/link-targets?venueId=${encodeURIComponent(venueId)}`)
      .then((r) => (r.ok ? r.json() : null))
      // Merge over the empty shape so every kind key exists — a partial or
      // unexpected payload must not leave `targets.SECTION` undefined and blow
      // up the pickers that spread it.
      .then((d: Partial<LinkTargets> | null) => {
        if (d && !Array.isArray(d)) setTargets({ ...EMPTY_TARGETS, ...d })
      })
      .catch(() => {})
    fetch('/api/admin/departments')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setDepartments(d))
      .catch(() => {})
    fetch(`/api/admin/positions?venueId=${encodeURIComponent(venueId)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((p) => setPositions(p))
      .catch(() => {})
  }, [venueId, loadList])

  const openPathway = useCallback(async (id: string) => {
    setActiveId(id); setSelectedId(null); setError('')
    const r = await fetch(`/api/admin/pathways/${id}`)
    if (!r.ok) return
    const p = await r.json()
    setNodes(
      (p.nodes ?? []).map((n: BoardNode & { label: string | null }) => ({
        id: n.id,
        kind: n.kind,
        targetId: n.targetId,
        title: n.label ?? '',
        x: n.x,
        y: n.y,
        stage: n.stage,
        points: n.points,
      })),
    )
    setEdges((p.edges ?? []).map((e: { fromNodeId: string; toNodeId: string }) => ({
      fromNodeId: e.fromNodeId, toNodeId: e.toNodeId,
    })))
    setDirty(false)
  }, [])

  // Titles come from the picker lists so the board reads properly without a
  // second round trip per node.
  const titleFor = useCallback((n: BoardNode): string => {
    if (n.kind === 'MILESTONE') return n.title || 'MILESTONE'
    const list = n.kind === 'GUIDE' ? targets.GUIDE : n.kind === 'TASK' ? targets.TASK : targets.CHECKLIST
    return list.find((o) => o.value === n.targetId)?.label ?? (n.title || 'REMOVED')
  }, [targets])

  const displayNodes = useMemo(
    () => nodes.map((n) => ({ ...n, title: titleFor(n) })),
    [nodes, titleFor],
  )

  // Preview the shape a brand-new starter sees: nothing completed yet.
  const preview = useMemo(
    () => resolvePathwayProgress(
      nodes.map((n) => ({ id: n.id, kind: n.kind, points: n.points })),
      edges,
      new Set<string>(),
    ),
    [nodes, edges],
  )
  const statusById = useMemo(
    () => new Map(preview.nodes.map((n) => [n.id, n.status])),
    [preview],
  )
  const boardNodes = useMemo(
    () => displayNodes.map((n) => ({ ...n, status: statusById.get(n.id) })),
    [displayNodes, statusById],
  )

  function addNode(kind: BoardKind, targetId: string) {
    const stage = nodes.length ? Math.max(...nodes.map((n) => n.stage)) : 0
    setNodes((prev) => [...prev, {
      id: nextTempId(),
      kind,
      targetId: kind === 'MILESTONE' ? null : targetId,
      title: '',
      x: 60 + stage * 260,
      y: 60 + prev.filter((n) => n.stage === stage).length * 90,
      stage,
      points: kind === 'MILESTONE' ? 50 : 10,
    }])
    setDirty(true)
  }

  function patchSelected(patch: Partial<BoardNode>) {
    if (!selectedId) return
    patchNode(selectedId, patch)
  }

  function patchNode(id: string, patch: Partial<BoardNode>) {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)))
    setDirty(true)
  }

  // Shared by the board card buttons and the tree row controls — the board's
  // ↑/↓ and the tree's S−/S+ are the same stage shift.
  function moveStage(id: string, dir: -1 | 1) {
    setNodes((prev) => shiftStage(prev, id, dir))
    setDirty(true)
  }

  function moveWithinStage(id: string, dir: -1 | 1) {
    setNodes((prev) => reorderWithinStage(prev, id, dir))
    setDirty(true)
  }

  function deleteNode(id: string) {
    setNodes((prev) => deleteNodeAndEdges(prev, edges, id).nodes)
    setEdges((prev) => prev.filter((e) => e.fromNodeId !== id && e.toNodeId !== id))
    if (selectedId === id) setSelectedId(null)
    setDirty(true)
  }

  function deleteSelected() {
    if (!selectedId) return
    deleteNode(selectedId)
  }

  async function save() {
    if (!activeId) return
    setSaving(true); setError('')
    const r = await fetch(`/api/admin/pathways/${activeId}/graph`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodes: nodes.map((n, i) => ({
          id: n.id.startsWith('new_') ? null : n.id,
          _clientId: n.id,
          kind: n.kind,
          targetId: n.targetId,
          label: n.kind === 'MILESTONE' ? n.title || 'MILESTONE' : null,
          x: n.x, y: n.y, stage: n.stage, points: n.points, sortOrder: i,
        })),
        edges,
      }),
    })
    setSaving(false)
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setError(d.error ?? 'SAVE FAILED')
      return
    }
    const d = await r.json()
    // Re-key local state onto the real ids so a second save doesn't re-create.
    const map: Record<string, string> = d.idMap ?? {}
    setNodes((prev) => prev.map((n) => ({ ...n, id: map[n.id] ?? n.id })))
    setEdges((prev) => prev.map((e) => ({
      fromNodeId: map[e.fromNodeId] ?? e.fromNodeId,
      toNodeId: map[e.toNodeId] ?? e.toNodeId,
    })))
    setDirty(false)
    loadList()
  }

  async function createPathway() {
    if (!newName.trim()) return
    const r = await fetch('/api/admin/pathways', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newName,
        venueId,
        departmentId: newDept || null,
        sectionId: newSection || null,
        positionId: newPosition || null,
      }),
    })
    if (!r.ok) return
    const p = await r.json()
    setCreateOpen(false)
    setNewName(''); setNewDept(''); setNewSection(''); setNewPosition('')
    await loadList()
    openPathway(p.id)
  }

  async function togglePublish(p: PathwayListItem) {
    await fetch(`/api/admin/pathways/${p.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: p.status === 'DRAFT' ? 'PUBLISHED' : 'DRAFT' }),
    })
    loadList()
  }

  const active = pathways.find((p) => p.id === activeId) ?? null
  const selected = nodes.find((n) => n.id === selectedId) ?? null

  const stages = [...new Set(nodes.map((n) => n.stage))].sort((a, b) => a - b)

  if (loading) return <div className="p-6"><p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p></div>

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="font-mono text-xl font-bold uppercase tracking-widest">PATHWAYS</h1>
          <p className="font-mono text-xs text-grey-light mt-1 uppercase">
            MAP HOW SOMEONE COMES UP TO SPEED. DRAW AN ARROW TO SET A PREREQUISITE.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>+ NEW PATHWAY</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {pathways.length === 0 && <p className="font-mono text-xs text-grey-light">NO PATHWAYS YET.</p>}
        {pathways.map((p) => (
          <button
            key={p.id}
            onClick={() => openPathway(p.id)}
            className={`border px-3 py-2 text-left transition-colors ${
              p.id === activeId ? 'border-white' : 'border-grey-mid hover:border-white'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs uppercase text-white">{p.name}</span>
              <Badge variant={p.status === 'DRAFT' ? 'warning' : 'success'}>{p.status}</Badge>
            </div>
            <div className="font-mono text-[10px] uppercase text-grey-light">
              {p.position?.name ?? p.section?.name ?? p.department?.name ?? 'WHOLE VENUE'} · {p._count.nodes} NODES
            </div>
          </button>
        ))}
      </div>

      {active && (
        <div className="border border-grey-mid p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex gap-2">
              {(['board', 'tree'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`font-mono text-xs uppercase tracking-wider border px-3 py-1.5 transition-colors ${
                    tab === t ? 'border-white text-white' : 'border-grey-mid text-grey-light hover:text-white'
                  }`}
                >
                  {t === 'board' ? 'BOARD' : 'TREE'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {dirty && <span className="font-mono text-[10px] uppercase text-[#FACC15]">UNSAVED</span>}
              <Button size="sm" variant="ghost" onClick={() => togglePublish(active)}>
                {active.status === 'DRAFT' ? 'PUBLISH' : 'UNPUBLISH'}
              </Button>
              <Button size="sm" onClick={save} loading={saving} disabled={!dirty}>SAVE</Button>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-2 border-b border-grey-mid pb-3">
            <AddNodeRow targets={targets} onAdd={addNode} />
          </div>

          {error && <p className="font-mono text-xs text-danger">{error}</p>}

          {tab === 'board' ? (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_16rem] gap-4">
              <PathwayBoard
                nodes={boardNodes}
                edges={edges}
                selectedId={selectedId}
                onNodesChange={(next) => { setNodes(next); setDirty(true) }}
                onEdgesChange={(next) => { setEdges(next); setDirty(true) }}
                onSelect={setSelectedId}
                onMoveStage={moveStage}
                onDelete={deleteNode}
              />
              <div className="border border-grey-mid p-3 space-y-3 h-fit">
                <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">NODE</h3>
                {!selected ? (
                  <p className="font-mono text-xs text-grey-light">SELECT A NODE.</p>
                ) : (
                  <>
                    <div className="font-mono text-xs text-white">{titleFor(selected)}</div>
                    {selected.kind === 'MILESTONE' && (
                      <Input
                        label="Label"
                        value={selected.title}
                        onChange={(e) => patchSelected({ title: e.target.value })}
                      />
                    )}
                    <Input
                      label="Stage"
                      type="number"
                      value={String(selected.stage)}
                      onChange={(e) => patchSelected({ stage: Number(e.target.value) || 0 })}
                    />
                    <Input
                      label="Points"
                      type="number"
                      value={String(selected.points)}
                      onChange={(e) => patchSelected({ points: Number(e.target.value) || 0 })}
                    />
                    <Button size="sm" variant="danger" onClick={deleteSelected}>DELETE NODE</Button>
                  </>
                )}
                <div className="border-t border-grey-mid pt-3 font-mono text-[10px] uppercase text-grey-light space-y-0.5">
                  <div>{nodes.length} NODES · {edges.length} LINKS</div>
                  <div>{preview.totalPoints} POINTS TOTAL</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {stages.map((stage) => (
                <div key={stage}>
                  <div className="font-mono text-xs uppercase text-grey-light tracking-wider">
                    STAGE {stage + 1}
                  </div>
                  <div className="border-l border-grey-mid ml-2 pl-4 mt-1 divide-y divide-grey-mid/50">
                    {displayNodes.filter((n) => n.stage === stage).map((n, idx, arr) => {
                      const st = statusById.get(n.id)
                      const blocked = preview.nodes.find((p) => p.id === n.id)?.blockedBy ?? []
                      return (
                        <div key={n.id} className="py-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-[10px] uppercase text-grey-light w-16">
                              {n.kind === 'CHECKLIST' ? 'LIST' : n.kind}
                            </span>
                            <span className="font-mono text-xs text-white min-w-0 flex-1">{n.title}</span>
                            <span className="font-mono text-[10px] text-grey-light">{n.points}P</span>
                            {st === 'LOCKED' && blocked.length > 0 && (
                              <span className="font-mono text-[10px] uppercase text-grey-light">
                                NEEDS {blocked.map((b) => displayNodes.find((x) => x.id === b)?.title ?? '?').join(', ')}
                              </span>
                            )}
                            <div className="flex items-center gap-0.5">
                              <TreeButton label="↑" title="MOVE UP IN STAGE" disabled={idx === 0} onClick={() => moveWithinStage(n.id, -1)} />
                              <TreeButton label="↓" title="MOVE DOWN IN STAGE" disabled={idx === arr.length - 1} onClick={() => moveWithinStage(n.id, 1)} />
                              <TreeButton label="S−" title="STAGE UP" disabled={n.stage === 0} onClick={() => moveStage(n.id, -1)} />
                              <TreeButton label="S+" title="STAGE DOWN" onClick={() => moveStage(n.id, 1)} />
                              <TreeButton label="EDIT" title="EDIT NODE" onClick={() => { setEditingId(editingId === n.id ? null : n.id) }} />
                              <TreeButton label="✕" title="DELETE NODE" onClick={() => deleteNode(n.id)} />
                            </div>
                          </div>
                          {editingId === n.id && (
                            <InlineNodeEditor
                              node={nodes.find((x) => x.id === n.id) ?? n}
                              onSave={(patch) => { patchNode(n.id, patch); setEditingId(null) }}
                              onCancel={() => setEditingId(null)}
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
              {nodes.length === 0 && <p className="font-mono text-xs text-grey-light">NO NODES YET.</p>}
            </div>
          )}
        </div>
      )}

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="NEW PATHWAY">
        <div className="space-y-3">
          <Input label="Name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="NEW BARTENDER" />
          <Select
            label="Position (most specific)"
            value={newPosition}
            onChange={(e) => setNewPosition(e.target.value)}
            options={[{ value: '', label: 'ANY' }, ...positions.map((p) => ({ value: p.id, label: p.name }))]}
          />
          <Select
            label="Section"
            value={newSection}
            onChange={(e) => setNewSection(e.target.value)}
            options={[{ value: '', label: 'ANY' }, ...targets.SECTION]}
          />
          <Select
            label="Department"
            value={newDept}
            onChange={(e) => setNewDept(e.target.value)}
            options={[{ value: '', label: 'ANY' }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
          />
          <p className="font-mono text-[10px] uppercase text-grey-light">
            LEAVE ALL BLANK FOR A VENUE-WIDE PATHWAY. THE MOST SPECIFIC MATCH WINS.
          </p>
          <div className="flex gap-2 pt-1">
            <Button onClick={createPathway}>CREATE</Button>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>CANCEL</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// Module-level so typing in it doesn't lose focus when the parent re-renders.
function AddNodeRow({
  targets, onAdd,
}: { targets: LinkTargets; onAdd: (kind: BoardKind, targetId: string) => void }) {  const [kind, setKind] = useState<BoardKind>('GUIDE')
  const [targetId, setTargetId] = useState('')

  const opts =
    kind === 'GUIDE' ? targets.GUIDE
    : kind === 'TASK' ? targets.TASK
    : kind === 'CHECKLIST' ? targets.CHECKLIST
    : []

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={kind}
        onChange={(e) => { setKind(e.target.value as BoardKind); setTargetId('') }}
        className="bg-black border border-grey-mid text-white font-mono text-xs uppercase px-2 py-1.5 outline-none focus:border-white"
      >
        {NODE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
      </select>
      {kind !== 'MILESTONE' && (
        <select
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          className="min-w-[14rem] bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white"
        >
          <option value="">{opts.length ? 'SELECT…' : 'NONE AVAILABLE'}</option>
          {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
      <button
        type="button"
        disabled={kind !== 'MILESTONE' && !targetId}
        onClick={() => { onAdd(kind, targetId); setTargetId('') }}
        className="font-mono text-xs uppercase border border-grey-mid px-3 py-1.5 text-grey-light hover:border-white hover:text-white transition-colors disabled:opacity-40"
      >
        + ADD NODE
      </button>
    </div>
  )
}

function TreeButton({ label, title, onClick, disabled }: { label: string; title: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="font-mono text-[9px] uppercase border border-grey-mid px-1 py-0.5 text-grey-light hover:text-white hover:border-white transition-colors disabled:opacity-30 disabled:hover:text-grey-light disabled:hover:border-grey-mid"
    >
      {label}
    </button>
  )
}

// Inline editor for a tree row — the tree has no side panel, so points/stage
// (and the milestone label) are edited right on the row.
function InlineNodeEditor({
  node,
  onSave,
  onCancel,
}: {
  node: BoardNode
  onSave: (patch: Partial<BoardNode>) => void
  onCancel: () => void
}) {
  const [points, setPoints] = useState(String(node.points))
  const [stage, setStage] = useState(String(node.stage))
  const [label, setLabel] = useState(node.title)

  return (
    <div className="flex items-end gap-2 flex-wrap py-1 pl-0">
      <Input
        label="Points"
        type="number"
        value={points}
        onChange={(e) => setPoints(e.target.value)}
        className="w-20"
      />
      <Input
        label="Stage"
        type="number"
        value={stage}
        onChange={(e) => setStage(e.target.value)}
        className="w-20"
      />
      {node.kind === 'MILESTONE' && (
        <Input label="Label" value={label} onChange={(e) => setLabel(e.target.value)} className="w-48" />
      )}
      <div className="flex gap-1.5">
        <Button
          size="sm"
          onClick={() =>
            onSave({
              points: Number(points) || 0,
              stage: Math.max(0, Number(stage) || 0),
              ...(node.kind === 'MILESTONE' ? { title: label.trim() || 'MILESTONE' } : {}),
            })
          }
        >
          OK
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>CANCEL</Button>
      </div>
    </div>
  )
}
