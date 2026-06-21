'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Step {
  id: string
  order: number
  title: string | null
  content: string
  imageUrl: string | null
  videoUrl: string | null
  linkedChecklist: { id: string; name: string; tasks: { id: string; title: string }[] } | null
}

interface SopItem {
  id: string
  title: string
  description: string | null
  category: string | null
  department: { id: string; name: string } | null
  steps: Step[]
}

export function WorkerSopsClient() {
  const router = useRouter()
  const [items, setItems] = useState<SopItem[]>([])
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState<SopItem | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())

  useEffect(() => { setChecked(new Set()) }, [active?.id])

  function toggleCheck(id: string) {
    setChecked((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  async function load() {
    const r = await fetch('/api/worker/sops')
    if (r.status === 401) { router.push('/w/login'); return }
    const data = await r.json()
    setItems(data.items ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

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
          <button onClick={() => setActive(null)} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">← BACK</button>
          <span className="font-mono text-xs text-grey-light">REFERENCE</span>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
          <div>
            <h1 className="font-mono text-xl font-bold uppercase text-white">{active.title}</h1>
            {active.description && <p className="font-sans text-sm text-grey-light mt-2">{active.description}</p>}
            {active.department && (
              <p className="font-mono text-xs text-grey-light mt-1 uppercase">[{active.department.name}]</p>
            )}
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
              {s.linkedChecklist && (
                <div className="border border-grey-mid">
                  <div className="px-3 py-2 border-b border-grey-mid font-mono text-xs uppercase text-grey-light">
                    CHECKLIST: {s.linkedChecklist.name}
                  </div>
                  <div className="divide-y divide-grey-mid">
                    {s.linkedChecklist.tasks.length === 0 ? (
                      <p className="px-3 py-2 font-mono text-xs text-grey-light">NO TASKS IN THIS LIST.</p>
                    ) : (
                      s.linkedChecklist.tasks.map((t) => {
                        const on = checked.has(t.id)
                        return (
                          <button key={t.id} onClick={() => toggleCheck(t.id)} className="w-full flex items-center gap-3 px-3 py-2 text-left active:bg-black">
                            <span className={`w-5 h-5 border-2 flex-shrink-0 flex items-center justify-center ${on ? 'border-success bg-success' : 'border-grey-mid'}`}>
                              {on && <svg className="w-3 h-3 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                            </span>
                            <span className={`font-sans text-sm ${on ? 'text-grey-light line-through' : 'text-white'}`}>{t.title}</span>
                          </button>
                        )
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Group by category
  const byCategory = new Map<string, SopItem[]>()
  for (const it of items) {
    const cat = it.category ?? 'UNCATEGORISED'
    const arr = byCategory.get(cat) ?? []
    arr.push(it)
    byCategory.set(cat, arr)
  }
  const categories = [...byCategory.entries()].sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="min-h-screen bg-black">
      <div className="px-4 pt-6 pb-4 border-b border-grey-mid flex items-start justify-between">
        <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">SOPS & GUIDES</h1>
        <button onClick={() => router.push('/w/dashboard')} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors mt-1">DASHBOARD →</button>
      </div>

      <div className="px-4 py-4 space-y-6">
        {items.length === 0 && (
          <p className="font-mono text-xs text-grey-light">NO SOPS OR GUIDES AVAILABLE YET.</p>
        )}
        {categories.map(([cat, catItems]) => (
          <div key={cat} className="space-y-2">
            <div className="font-mono text-xs uppercase tracking-wider text-grey-light border-b border-grey-mid pb-1">{cat}</div>
            {catItems.map((it) => (
              <button
                key={it.id}
                onClick={() => setActive(it)}
                className="w-full text-left bg-grey-dark border border-grey-mid p-4 hover:border-white transition-colors active:bg-black"
              >
                <div className="font-mono font-semibold text-sm uppercase text-white">{it.title}</div>
                {it.description && <p className="font-sans text-xs text-grey-light mt-1">{it.description}</p>}
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-mono text-xs text-grey-light">{it.steps.length} STEP{it.steps.length !== 1 ? 'S' : ''}</span>
                  {it.department && <span className="font-mono text-xs text-grey-light">· {it.department.name}</span>}
                </div>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
