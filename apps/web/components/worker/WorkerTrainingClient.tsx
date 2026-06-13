'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

interface Step {
  id: string
  order: number
  title: string | null
  content: string
  imageUrl: string | null
  videoUrl: string | null
}

interface TrainingItem {
  id: string
  title: string
  description: string | null
  category: string | null
  requiresSignOff: boolean
  isOnboarding: boolean
  source: 'ONBOARDING' | 'DEPARTMENT' | 'ASSIGNED'
  assignmentReason: string | null
  completed: boolean
  steps: Step[]
}

function TrainingInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [items, setItems] = useState<TrainingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState<TrainingItem | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load(openId?: string | null) {
    const r = await fetch('/api/worker/training')
    if (r.status === 401) { router.push('/w/login'); return }
    const data = await r.json()
    setItems(data.items ?? [])
    setLoading(false)
    if (openId) {
      const found = (data.items ?? []).find((i: TrainingItem) => i.id === openId)
      if (found) setActive(found)
    }
  }

  useEffect(() => { load(searchParams.get('module')) }, [])

  async function selfComplete() {
    if (!active) return
    setSaving(true); setError('')
    const r = await fetch(`/api/worker/training/${active.id}/complete`, { method: 'POST' })
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

  // Full-screen module reader
  if (active) {
    return (
      <div className="min-h-screen bg-black flex flex-col">
        <div className="flex items-center justify-between px-4 py-4 border-b border-grey-mid">
          <button onClick={() => setActive(null)} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">← BACK</button>
          <span className="font-mono text-xs text-grey-light">{active.requiresSignOff ? 'MANAGER SIGN-OFF' : 'SELF-COMPLETE'}</span>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
          <div>
            <h1 className="font-mono text-xl font-bold uppercase text-white">{active.title}</h1>
            {active.description && <p className="font-sans text-sm text-grey-light mt-2">{active.description}</p>}
          </div>

          {active.steps.map((s, i) => (
            <div key={s.id} className="border-l-4 border-l-grey-mid pl-4 space-y-2">
              <div className="font-mono text-xs text-grey-light uppercase">STEP {i + 1}{s.title ? ` — ${s.title}` : ''}</div>
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
            </div>
          ))}

          {error && <p className="font-mono text-xs text-danger">{error}</p>}
        </div>

        <div className="px-4 pb-8 pt-4 border-t border-grey-mid">
          {active.completed ? (
            <div className="status-bar-success pl-3">
              <p className="font-mono text-sm text-success uppercase">COMPLETED</p>
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
            <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">MY TRAINING</h1>
            <p className="font-mono text-xs text-grey-light mt-0.5 uppercase">{done} OF {items.length} COMPLETE</p>
          </div>
          <button onClick={() => router.push('/w/tasks')} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors mt-1">TASKS →</button>
        </div>
        <div className="mt-3 bg-grey-mid h-1.5">
          <div className="h-full bg-success transition-all duration-500" style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} />
        </div>
      </div>

      <div className="px-4 py-4 space-y-2">
        {items.length === 0 && (
          <p className="font-mono text-xs text-grey-light">NO TRAINING ASSIGNED YET.</p>
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
                  {it.assignmentReason && <span className="font-mono text-xs text-grey-light">[{it.assignmentReason}]</span>}
                  <span className="font-mono text-xs text-grey-light">{it.steps.length} STEP{it.steps.length !== 1 ? 'S' : ''}</span>
                  {it.requiresSignOff && !it.completed && <span className="font-mono text-xs text-grey-light">· SIGN-OFF</span>}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

export function WorkerTrainingClient() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black flex items-center justify-center"><p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p></div>}>
      <TrainingInner />
    </Suspense>
  )
}
