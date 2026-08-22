'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { GuideStepLinks } from '@/components/GuideStepLinks'
import { WorkerPathwayTree, type TreeNode, type TreeEdge } from '@/components/worker/WorkerPathwayTree'
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
  requiresSignOff: boolean
  isOnboarding: boolean
  isTracked: boolean
  source: string
  completed: boolean
  department: { id: string; name: string } | null
  steps: Step[]
}

function GuidesInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [items, setItems] = useState<GuideItem[]>([])
  const [reference, setReference] = useState<GuideItem[]>([])
  const [firstName, setFirstName] = useState('')
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState<GuideItem | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'tree' | 'bible'>('tree')
  const [pathway, setPathway] = useState<PathwayView | null>(null)
  const [lockNote, setLockNote] = useState('')

  async function load(openId?: string | null) {
    const [gR, pR] = await Promise.all([
      fetch('/api/worker/guides'),
      fetch('/api/worker/pathway'),
    ])
    if (gR.status === 401) { router.push('/w/login'); return }
    const data = await gR.json()
    setItems(data.items ?? [])
    setReference(data.reference ?? [])
    setFirstName(data.firstName ?? '')

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

  useEffect(() => { load(searchParams.get('guide')) }, [])

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

  const done = items.filter((i) => i.completed).length

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="font-mono text-sm text-grey-light loading-cursor">LOADING</p>
      </div>
    )
  }

  if (active) {
    return (
      <div className="min-h-screen bg-black flex flex-col">
        <div className="flex items-center justify-between px-4 py-4 border-b border-grey-mid">
          <button onClick={() => { setActive(null); setLockNote('') }} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">← BACK</button>
          <span className="font-mono text-xs text-grey-light">{active.requiresSignOff ? 'MANAGER SIGN-OFF' : 'SELF-COMPLETE'}</span>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
          <div>
            <h1 className="font-mono text-xl font-bold uppercase text-white">{active.title}</h1>
            {active.description && <p className="font-sans text-sm text-grey-light mt-2">{active.description}</p>}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {active.category && <span className="inline-block font-mono text-xs border border-grey-mid px-2 py-0.5 text-grey-light">{active.category}</span>}
              {!active.isTracked && (
                <span className="inline-block font-mono text-xs border border-grey-mid px-2 py-0.5 text-grey-light">REFERENCE — NOT TRACKED</span>
              )}
            </div>
          </div>

          {active.steps.map((s, i) => (
            <div key={s.id} className="border-l-4 border-l-grey-mid pl-4 space-y-2">
              <div className="font-mono text-xs text-grey-light uppercase">
                STEP {i + 1}{s.heading ? ` — ${s.heading}` : ''}
              </div>
              <p className="font-sans text-sm text-white whitespace-pre-wrap">{s.content}</p>
              {s.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.imageUrl} alt={`step ${i + 1}`} className="w-full border border-grey-mid" />
              )}
              {s.videoUrl && (
                <a href={s.videoUrl} target="_blank" rel="noopener noreferrer" className="inline-block font-mono text-xs uppercase border border-grey-mid px-3 py-2 text-white hover:border-white transition-colors">
                  ▶ WATCH VIDEO
                </a>
              )}
              {s.links && s.links.length > 0 && <GuideStepLinks links={s.links} />}
            </div>
          ))}

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
              <div className="font-mono text-[10px] uppercase text-grey-light">
                {Math.max(0, pathway.progress.nextLevelAt - pathway.progress.earnedPoints)} PTS TO LEVEL {pathway.progress.level + 1}
              </div>
            )}
          </div>
          <WorkerPathwayTree nodes={pathway.nodes} edges={pathway.edges} onOpen={openTreeNode} />
        </div>
      )}

      <div className={`px-4 py-4 space-y-2 ${tab === 'tree' ? 'hidden' : ''}`}>
        {items.length === 0 && reference.length === 0 && (
          <p className="font-mono text-xs text-grey-light">NO GUIDES ASSIGNED YET.</p>
        )}
        {items.map((it) => (
          <button key={it.id} onClick={() => setActive(it)} className="w-full text-left bg-grey-dark border border-grey-mid p-4 hover:border-white transition-colors active:bg-black">
            <div className="flex items-start gap-3">
              <div className={`w-5 h-5 border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${it.completed ? 'border-success bg-success' : 'border-grey-mid'}`}>
                {it.completed && (
                  <svg className="w-3 h-3 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                )}
              </div>
              <div className="min-w-0">
                <div className="font-mono font-semibold text-sm uppercase text-white">{it.title}</div>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  {it.isOnboarding && <span className="font-mono text-xs text-warning">ONBOARDING</span>}
                  {it.department && <span className="font-mono text-xs text-grey-light">{it.department.name}</span>}
                  <span className="font-mono text-xs text-grey-light">{it.steps.length} STEP{it.steps.length !== 1 ? 'S' : ''}</span>
                  {it.requiresSignOff && !it.completed && <span className="font-mono text-xs text-grey-light">· SIGN-OFF</span>}
                </div>
              </div>
            </div>
          </button>
        ))}
        {reference.length > 0 && (
          <div className="pt-2">
            <div className="font-mono text-[10px] uppercase text-grey-light tracking-widest pb-1.5">REFERENCE — READ ANY TIME</div>
            {reference.map((it) => (
              <button key={it.id} onClick={() => setActive(it)} className="w-full text-left bg-grey-dark border border-grey-mid/60 p-4 hover:border-white transition-colors active:bg-black">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 border-2 flex-shrink-0 mt-0.5 border-grey-light/40" />
                  <div className="min-w-0">
                    <div className="font-mono font-semibold text-sm uppercase text-grey-light">{it.title}</div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span className="font-mono text-xs text-grey-light/70">REFERENCE</span>
                      {it.department && <span className="font-mono text-xs text-grey-light/70">{it.department.name}</span>}
                      <span className="font-mono text-xs text-grey-light/70">{it.steps.length} STEP{it.steps.length !== 1 ? 'S' : ''}</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
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
