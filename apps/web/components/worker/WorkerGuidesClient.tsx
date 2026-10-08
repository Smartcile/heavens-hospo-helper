'use client'

import { useEffect, useMemo, useRef, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { WorkerPathwayTree, type TreeNode, type TreeEdge } from '@/components/worker/WorkerPathwayTree'
import { WorkerGuideEditor } from '@/components/worker/WorkerGuideEditor'
import { GuideReaderContent } from '@/components/GuideReaderContent'
import { groupGuidesByFolder } from '@/lib/guide-folders'
import { moveItem } from '@/lib/array'
import { nearestIndex } from '@/lib/reorder'
import type { ResolvedStepLink } from '@/lib/guide-links'

interface Step {
  id: string
  order: number
  heading: string | null
  content: string
  imageUrl: string | null
  videoUrl: string | null
  links?: ResolvedStepLink[]
}

interface PathwayView {
  id: string
  name: string
  description: string | null
  nodes: (TreeNode & { targetId: string | null })[]
  edges: TreeEdge[]
  progress: { earnedPoints: number; totalPoints: number; level: number; nextLevelAt: number | null }
}

interface GuideItem {
  id: string
  title: string
  description: string | null
  category: string | null
  guideType: string | null
  bodyHtml: string | null
  requiresSignOff: boolean
  isOnboarding: boolean
  isTracked: boolean
  source: string
  folderId: string | null
  completed: boolean
  department: { id: string; name: string } | null
  steps: Step[]
}

interface Folder {
  id: string
  name: string
  sortOrder: number
}

const UNFILED_KEY = '__unfiled__'

/** Nearest registered element key to a pointer position (rect-based, so it
 *  works while the pointer is captured and is unit-testable with mocked rects). */
function nearestKey(refs: Record<string, HTMLElement | null>, x: number, y: number): string | null {
  const keys = Object.keys(refs).filter((k) => refs[k])
  if (keys.length === 0) return null
  const rects = keys.map((k) => {
    const r = refs[k]!.getBoundingClientRect()
    return { left: r.left, top: r.top, width: r.width, height: r.height }
  })
  const idx = nearestIndex(rects, x, y)
  return idx === null ? null : keys[idx]
}

function GuidesInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [items, setItems] = useState<GuideItem[]>([])
  const [reference, setReference] = useState<GuideItem[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [firstName, setFirstName] = useState('')
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState<GuideItem | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [bibleError, setBibleError] = useState('')
  const [tab, setTab] = useState<'tree' | 'bible'>('tree')
  const [pathway, setPathway] = useState<PathwayView | null>(null)
  const [lockNote, setLockNote] = useState('')
  const [canEdit, setCanEdit] = useState(false)
  const [canPublish, setCanPublish] = useState(false)
  const [editor, setEditor] = useState<{ id: string | null } | null>(null)

  // Folder view + pointer drag-and-drop (works with mouse AND touch — the ⠿
  // grips carry `touch-action: none`, so a swipe on a grip drags instead of
  // scrolling the page).
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())
  const [draggingGuideId, setDraggingGuideId] = useState<string | null>(null)
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null)
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null)
  const [folderOverId, setFolderOverId] = useState<string | null>(null)
  const guideDragRef = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null)
  const overFolderRef = useRef<string | null>(null)
  const folderGroupRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const folderHeaderRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const folderDragRef = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null)
  const overFolderHeaderRef = useRef<string | null>(null)

  async function load(openId?: string | null) {
    const [gR, pR] = await Promise.all([
      fetch('/api/worker/guides'),
      fetch('/api/worker/pathway'),
    ])
    if (gR.status === 401) { router.push('/w/login'); return }
    const data = await gR.json()
    setItems(data.items ?? [])
    setReference(data.reference ?? [])
    setFolders(data.folders ?? [])
    setFirstName(data.firstName ?? '')
    setCanEdit(!!data.canEdit)
    setCanPublish(!!data.canPublish)

    if (pR.ok) {
      const p = await pR.json()
      setPathway(p.pathway ?? null)
      // Nothing to progress through — the bible is the more useful landing tab.
      if (!p.pathway) setTab('bible')
    } else {
      setTab('bible')
    }

    setLoading(false)
    if (openId) {
      const found = (data.items ?? []).find((i: GuideItem) => i.id === openId)
      if (found) { setActive(found); setTab('bible') }
    }
  }

  useEffect(() => { load(searchParams.get('guide')) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Opening a tree node: a locked node is still readable — it just can't be
  // banked yet. Everything is available in the bible regardless.
  function openTreeNode(node: TreeNode & { targetId?: string | null }) {
    setLockNote('')
    if (node.kind !== 'GUIDE' || !node.targetId) return
    const guide = items.find((i) => i.id === node.targetId) ?? reference.find((i) => i.id === node.targetId)
    if (!guide) return
    if (node.status === 'LOCKED' && guide.isTracked) {
      const names = node.blockedBy
        .map((b) => pathway?.nodes.find((n) => n.id === b)?.title)
        .filter(Boolean)
        .join(', ')
      setLockNote(names ? `COMPLETE ${names} FIRST` : 'LOCKED')
    }
    setActive(guide)
  }

  async function selfComplete() {
    if (!active) return
    setSaving(true); setError('')
    const r = await fetch(`/api/worker/guides/${active.id}/complete`, { method: 'POST' })
    setSaving(false)
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'COULD NOT COMPLETE'); return }
    setActive(null)
    load()
  }

  const allGuides = useMemo(() => [...items, ...reference], [items, reference])

  const folderGroups = useMemo(() => {
    const groups: { folder: Folder | null; guides: GuideItem[] }[] = groupGuidesByFolder(allGuides, folders)
    // An editor always gets an UNFILED drop target, even with every guide filed.
    if (canEdit && folders.length > 0 && !groups.some((g) => g.folder === null)) {
      groups.push({ folder: null, guides: [] })
    }
    return groups
  }, [allGuides, folders, canEdit])

  function toggleFolder(key: string) {
    setCollapsedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function moveGuideToFolder(guideId: string, folderId: string | null) {
    const prevItems = items
    const prevReference = reference
    const patch = (list: GuideItem[]) => list.map((g) => (g.id === guideId ? { ...g, folderId } : g))
    setItems(patch)
    setReference(patch)
    setBibleError('')
    const r = await fetch(`/api/worker/guides/${guideId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId }),
    })
    if (!r.ok) {
      setItems(prevItems)
      setReference(prevReference)
      const d = await r.json().catch(() => ({}))
      setBibleError((d.error ?? 'COULD NOT MOVE THAT GUIDE').toUpperCase())
    }
  }

  async function reorderFolders(fromId: string, toId: string) {
    const from = folders.findIndex((f) => f.id === fromId)
    const to = folders.findIndex((f) => f.id === toId)
    if (from < 0 || to < 0 || from === to) return
    const prev = folders
    const next = moveItem(folders, from, to).map((f, i) => ({ ...f, sortOrder: i }))
    setFolders(next)
    setBibleError('')
    const r = await fetch('/api/worker/guide-folders', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds: next.map((f) => f.id) }),
    })
    if (!r.ok) {
      setFolders(prev)
      const d = await r.json().catch(() => ({}))
      setBibleError((d.error ?? 'COULD NOT REORDER THE FOLDERS').toUpperCase())
    }
  }

  // ── Guide drag (onto a folder) ──────────────────────────────────────────

  function onGuidePointerDown(e: React.PointerEvent, id: string) {
    if (!canEdit) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    guideDragRef.current = { id, x: e.clientX, y: e.clientY, moved: false }
    setDraggingGuideId(id)
    setBibleError('')
  }

  function onGuidePointerMove(e: React.PointerEvent) {
    const drag = guideDragRef.current
    if (!drag) return
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) drag.moved = true
    if (!drag.moved) return
    const key = nearestKey(folderGroupRefs.current, e.clientX, e.clientY)
    overFolderRef.current = key
    setDragOverFolder(key)
  }

  function onGuidePointerUp(e: React.PointerEvent) {
    const drag = guideDragRef.current
    guideDragRef.current = null
    setDraggingGuideId(null)
    setDragOverFolder(null)
    if (!drag || !drag.moved) return
    const key = overFolderRef.current
      ?? (typeof e.clientX === 'number' ? nearestKey(folderGroupRefs.current, e.clientX, e.clientY) : null)
    overFolderRef.current = null
    if (!key) return
    const target = key === UNFILED_KEY ? null : key
    const guide = allGuides.find((g) => g.id === drag.id)
    if (!guide || (guide.folderId ?? null) === target) return
    moveGuideToFolder(drag.id, target)
  }

  function onGuidePointerCancel() {
    guideDragRef.current = null
    overFolderRef.current = null
    setDraggingGuideId(null)
    setDragOverFolder(null)
  }

  // ── Folder drag (reorder the folders themselves) ────────────────────────

  function onFolderPointerDown(e: React.PointerEvent, id: string) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    folderDragRef.current = { id, x: e.clientX, y: e.clientY, moved: false }
    setDraggingFolderId(id)
    setBibleError('')
  }

  function onFolderPointerMove(e: React.PointerEvent) {
    const drag = folderDragRef.current
    if (!drag) return
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) drag.moved = true
    if (!drag.moved) return
    const key = nearestKey(folderHeaderRefs.current, e.clientX, e.clientY)
    overFolderHeaderRef.current = key
    setFolderOverId(key)
  }

  function onFolderPointerUp(e: React.PointerEvent) {
    const drag = folderDragRef.current
    folderDragRef.current = null
    setDraggingFolderId(null)
    setFolderOverId(null)
    if (!drag || !drag.moved) return
    const key = overFolderHeaderRef.current
      ?? (typeof e.clientX === 'number' ? nearestKey(folderHeaderRefs.current, e.clientX, e.clientY) : null)
    overFolderHeaderRef.current = null
    if (!key || key === drag.id) return
    reorderFolders(drag.id, key)
  }

  function onFolderPointerCancel() {
    folderDragRef.current = null
    overFolderHeaderRef.current = null
    setDraggingFolderId(null)
    setFolderOverId(null)
  }

  const done = items.filter((i) => i.completed).length

  function renderGuideCard(it: GuideItem) {
    const isReference = !it.isTracked
    return (
      <button
        key={it.id}
        type="button"
        onClick={() => setActive(it)}
        className={`relative w-full text-left bg-grey-dark border p-4 transition-colors active:bg-black ${
          isReference ? 'border-grey-mid/60' : 'border-grey-mid'
        } ${draggingGuideId === it.id ? 'opacity-40 border-white' : 'hover:border-white'}`}
      >
        {canEdit && (
          <span
            data-guide-grip="1"
            aria-label={`DRAG ${it.title}`}
            onPointerDown={(e) => onGuidePointerDown(e, it.id)}
            onPointerMove={onGuidePointerMove}
            onPointerUp={onGuidePointerUp}
            onPointerCancel={onGuidePointerCancel}
            onClick={(e) => e.stopPropagation()}
            className="absolute top-1 right-1 z-10 touch-none select-none cursor-grab px-1.5 py-0.5 font-mono text-sm leading-none text-grey-light/60 hover:text-white"
          >
            ⠿
          </span>
        )}
        <div className="flex items-start gap-3">
          {!isReference && (
            <div className={`w-5 h-5 border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${it.completed ? 'border-success bg-success' : 'border-grey-mid'}`}>
              {it.completed && (
                <svg className="w-3 h-3 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
              )}
            </div>
          )}
          {isReference && <div className="w-5 h-5 border-2 flex-shrink-0 mt-0.5 border-grey-light/40" />}
          <div className="min-w-0">
            <div className={`font-mono font-semibold text-sm uppercase ${isReference ? 'text-grey-light' : 'text-white'}`}>{it.title}</div>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {isReference && <span className="font-mono text-xs text-grey-light/70">REFERENCE</span>}
              {!isReference && it.isOnboarding && <span className="font-mono text-xs text-warning">ONBOARDING</span>}
              {it.department && <span className={`font-mono text-xs ${isReference ? 'text-grey-light/70' : 'text-grey-light'}`}>{it.department.name}</span>}
              <span className={`font-mono text-xs ${isReference ? 'text-grey-light/70' : 'text-grey-light'}`}>{it.steps.length} STEP{it.steps.length !== 1 ? 'S' : ''}</span>
              {!isReference && it.requiresSignOff && !it.completed && <span className="font-mono text-xs text-grey-light">· SIGN-OFF</span>}
            </div>
          </div>
        </div>
      </button>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="font-mono text-sm text-grey-light loading-cursor">LOADING</p>
      </div>
    )
  }

  if (editor) {
    return (
      <WorkerGuideEditor
        guideId={editor.id}
        canPublish={canPublish}
        onClose={() => setEditor(null)}
        onSaved={() => { setEditor(null); load() }}
      />
    )
  }

  if (active) {
    return (
      <div className="min-h-screen bg-black flex flex-col">
        <div className="flex items-center justify-between px-4 py-4 border-b border-grey-mid">
          <button onClick={() => { setActive(null); setLockNote('') }} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">← BACK</button>
          <div className="flex items-center gap-3">
            {canEdit && (
              <button onClick={() => setEditor({ id: active.id })} className="font-mono text-xs uppercase border border-grey-mid px-3 py-1.5 text-white hover:border-white transition-colors">EDIT</button>
            )}
            <span className="font-mono text-xs text-grey-light">{active.requiresSignOff ? 'MANAGER SIGN-OFF' : 'SELF-COMPLETE'}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-6 space-y-6">
          <GuideReaderContent guide={active} variant="worker" />
          {error && <p className="font-mono text-xs text-danger">{error}</p>}
        </div>

        <div className="px-4 pb-8 pt-4 border-t border-grey-mid">
          {!active.isTracked ? (
            <div className="status-bar-success pl-3">
              <p className="font-mono text-sm text-grey-light uppercase">REFERENCE GUIDE — READ ONLY</p>
            </div>
          ) : active.completed ? (
            <div className="status-bar-success pl-3">
              <p className="font-mono text-sm text-success uppercase">COMPLETED</p>
            </div>
          ) : lockNote ? (
            <div className="status-bar-warning pl-3">
              <p className="font-mono text-xs text-warning uppercase">🔒 {lockNote}</p>
            </div>
          ) : active.requiresSignOff ? (
            <div className="status-bar-warning pl-3">
              <p className="font-mono text-xs text-warning uppercase">A MANAGER WILL SIGN THIS OFF WHEN YOU&apos;RE READY.</p>
            </div>
          ) : (
            <button onClick={selfComplete} disabled={saving} className="w-full h-14 bg-success text-black font-mono font-bold text-sm uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-40">
              {saving ? 'SAVING_' : 'MARK COMPLETE'}
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="px-4 pt-6 pb-4 border-b border-grey-mid">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">MY GUIDES</h1>
            <p className="font-mono text-xs text-grey-light mt-0.5 uppercase">
              {pathway && tab === 'tree'
                ? `LEVEL ${pathway.progress.level} · ${pathway.progress.earnedPoints} / ${pathway.progress.totalPoints} PTS`
                : `${done} OF ${items.length} COMPLETE`}
            </p>
          </div>
          {canEdit && (
            <button onClick={() => setEditor({ id: null })} className="font-mono text-xs uppercase border border-grey-mid px-3 py-1.5 text-white hover:border-white transition-colors">+ NEW</button>
          )}
        </div>

        {pathway && tab === 'tree' ? (
          <div className="mt-3 bg-grey-mid h-1.5">
            <div
              className="h-full bg-success transition-all duration-500"
              style={{
                width: `${pathway.progress.totalPoints ? (pathway.progress.earnedPoints / pathway.progress.totalPoints) * 100 : 0}%`,
              }}
            />
          </div>
        ) : (
          <div className="mt-3 bg-grey-mid h-1.5">
            <div className="h-full bg-success transition-all duration-500" style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} />
          </div>
        )}

        <div className="flex gap-2 mt-4">
          {(['tree', 'bible'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              disabled={t === 'tree' && !pathway}
              className={`font-mono text-xs uppercase tracking-wider border px-3 py-1.5 transition-colors disabled:opacity-30 ${
                tab === t ? 'border-white text-white' : 'border-grey-mid text-grey-light hover:text-white'
              }`}
            >
              {t === 'tree' ? 'MY TREE' : 'BIBLE'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'tree' && pathway && (
        <div className="py-2">
          <div className="px-4 pb-1">
            <div className="font-mono text-xs uppercase text-white">{pathway.name}</div>
            {pathway.progress.nextLevelAt !== null && (
              <div className="font-mono text-xs uppercase text-grey-light">
                {Math.max(0, pathway.progress.nextLevelAt - pathway.progress.earnedPoints)} PTS TO LEVEL {pathway.progress.level + 1}
              </div>
            )}
          </div>
          <WorkerPathwayTree nodes={pathway.nodes} edges={pathway.edges} onOpen={openTreeNode} />
        </div>
      )}

      <div className={`px-4 py-4 space-y-2 ${tab === 'tree' ? 'hidden' : ''}`}>
        {bibleError && <p className="font-mono text-xs text-danger border border-danger/50 bg-danger/10 px-3 py-2">{bibleError}</p>}
        {items.length === 0 && reference.length === 0 && (
          <p className="font-mono text-xs text-grey-light">NO GUIDES ASSIGNED YET.</p>
        )}

        {folders.length === 0 ? (
          <>
            {items.map((it) => renderGuideCard(it))}
            {reference.length > 0 && (
              <div className="pt-2">
                <div className="font-mono text-xs uppercase text-grey-light tracking-widest pb-1.5">REFERENCE — READ ANY TIME</div>
                {reference.map((it) => renderGuideCard(it))}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-5">
            {folderGroups.map(({ folder, guides: groupGuides }) => {
              const key = folder?.id ?? UNFILED_KEY
              const isUnfiled = !folder
              if (!canEdit && groupGuides.length === 0) return null
              const collapsed = collapsedFolders.has(key)
              return (
                <div
                  key={key}
                  data-folder-key={key}
                  ref={(el) => { folderGroupRefs.current[key] = el }}
                  className={`space-y-2 pb-1 transition-colors ${dragOverFolder === key && draggingGuideId ? 'ring-1 ring-white/40 bg-white/5' : ''}`}
                >
                  <div
                    ref={isUnfiled ? undefined : (el) => { folderHeaderRefs.current[key] = el }}
                    data-folder-header={isUnfiled ? undefined : key}
                    className={`flex items-center gap-2 border-b border-grey-mid pb-1.5 ${draggingFolderId === key ? 'opacity-40' : ''}`}
                  >
                    {canEdit && !isUnfiled && folders.length > 1 && (
                      <span
                        data-folder-grip="1"
                        aria-label={`DRAG FOLDER ${folder?.name ?? ''}`}
                        onPointerDown={(e) => onFolderPointerDown(e, key)}
                        onPointerMove={onFolderPointerMove}
                        onPointerUp={onFolderPointerUp}
                        onPointerCancel={onFolderPointerCancel}
                        onClick={(e) => e.stopPropagation()}
                        className="touch-none select-none cursor-grab px-0.5 font-mono text-sm leading-none text-grey-light/60 hover:text-white"
                      >
                        ⠿
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleFolder(key)}
                      className="font-mono text-base font-bold uppercase tracking-widest text-white hover:text-accent transition-colors text-left"
                    >
                      {collapsed ? '▸' : '▾'} {folder ? folder.name : 'UNFILED'}
                    </button>
                    <span className="font-mono text-xs text-grey-light">({groupGuides.length})</span>
                    {canEdit && folderOverId === key && draggingFolderId && draggingFolderId !== key && (
                      <span className="ml-auto font-mono text-2xs uppercase text-accent">DROP HERE</span>
                    )}
                    {canEdit && isUnfiled && !collapsed && (
                      <span className="ml-auto font-mono text-2xs uppercase text-grey-mid">DROP A GUIDE HERE TO UNFILE</span>
                    )}
                  </div>
                  {!collapsed && groupGuides.length > 0 && (
                    <div className="space-y-2">{groupGuides.map((it) => renderGuideCard(it))}</div>
                  )}
                  {!collapsed && groupGuides.length === 0 && canEdit && (
                    <p className="font-mono text-2xs uppercase text-grey-mid">EMPTY — DRAG A GUIDE HERE.</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export function WorkerGuidesClient() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black flex items-center justify-center"><p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p></div>}>
      <GuidesInner />
    </Suspense>
  )
}
