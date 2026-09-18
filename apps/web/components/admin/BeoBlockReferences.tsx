'use client'

// The playbook references attached to a BEO block area. Renders nothing when the
// area has no links; otherwise a REFERENCE button opens a read-only viewer with
// the linked guides (full steps), tasks and checklists. Shared by the admin
// builder, the enquiry intake and the worker phone editor.

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { blockDef, type BlockLibrary } from '@/lib/beo-blocks'
import { linkIdsFor } from '@/lib/beo-links'

interface GuideRef {
  id: string
  title: string
  description: string | null
  steps: { heading: string | null; content: string; imageUrl: string | null; videoUrl: string | null }[]
}
interface Target { id: string; name: string }
interface Resolved { guides: GuideRef[]; tasks: Target[]; checklists: Target[] }

export function BeoBlockReferences({
  blockType,
  library,
  mode,
  venueId,
}: {
  blockType: string
  library: BlockLibrary
  mode: 'admin' | 'worker'
  venueId?: string
}) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<Resolved | null>(null)
  const [loading, setLoading] = useState(false)

  const def = blockDef(blockType, library)
  const guideIds = linkIdsFor(def, 'GUIDE')
  const taskIds = linkIdsFor(def, 'TASK')
  const checklistIds = linkIdsFor(def, 'CHECKLIST')
  const count = guideIds.length + taskIds.length + checklistIds.length
  if (count === 0) return null

  async function load() {
    setOpen(true)
    if (data || loading) return
    setLoading(true)
    const q = new URLSearchParams()
    if (guideIds.length) q.set('guides', guideIds.join(','))
    if (taskIds.length) q.set('tasks', taskIds.join(','))
    if (checklistIds.length) q.set('checklists', checklistIds.join(','))
    const url =
      mode === 'admin'
        ? `/api/admin/beo-references?venueId=${venueId ?? ''}&${q.toString()}`
        : `/api/worker/events/references?${q.toString()}`
    try {
      const r = await fetch(url)
      setData(r.ok ? ((await r.json()) as Resolved) : { guides: [], tasks: [], checklists: [] })
    } catch {
      setData({ guides: [], tasks: [], checklists: [] })
    }
    setLoading(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={load}
        className="font-mono text-[9px] uppercase tracking-wider border border-accent text-accent px-1.5 py-0.5 hover:bg-accent hover:text-black transition-colors"
      >
        REFERENCE ({count})
      </button>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="REFERENCE" size="lg">
        {loading ? (
          <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
        ) : !data ? null : (
          <div className="space-y-4 max-h-[70vh] overflow-y-auto">
            {data.guides.length > 0 && (
              <section className="space-y-2">
                <h3 className="font-mono text-[10px] uppercase text-grey-light tracking-wider">GUIDES</h3>
                {data.guides.map((g) => (
                  <div key={g.id} className="border border-grey-mid p-3 space-y-2">
                    <div className="font-mono text-xs uppercase text-white">{g.title}</div>
                    {g.description && <p className="font-mono text-[10px] text-grey-light">{g.description}</p>}
                    {g.steps.map((s, i) => (
                      <div key={i} className="border-l border-grey-mid ml-1 pl-3 space-y-1">
                        {s.heading && <div className="font-mono text-[10px] uppercase text-white">{s.heading}</div>}
                        <p className="font-mono text-[10px] text-grey-light whitespace-pre-wrap">{s.content}</p>
                        {s.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={s.imageUrl} alt="" className="max-h-40 border border-grey-mid" />
                        )}
                        {s.videoUrl && (
                          <a href={s.videoUrl} target="_blank" rel="noreferrer" className="block font-mono text-[10px] uppercase text-accent underline">
                            WATCH VIDEO ↗
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </section>
            )}

            {data.tasks.length > 0 && (
              <section className="space-y-1">
                <h3 className="font-mono text-[10px] uppercase text-grey-light tracking-wider">TASKS</h3>
                {data.tasks.map((t) => (
                  <div key={t.id} className="font-mono text-[10px] uppercase text-white border border-grey-mid px-2 py-1">{t.name}</div>
                ))}
              </section>
            )}

            {data.checklists.length > 0 && (
              <section className="space-y-1">
                <h3 className="font-mono text-[10px] uppercase text-grey-light tracking-wider">CHECKLISTS</h3>
                {data.checklists.map((c) => (
                  <div key={c.id} className="font-mono text-[10px] uppercase text-white border border-grey-mid px-2 py-1">{c.name}</div>
                ))}
              </section>
            )}

            {data.guides.length === 0 && data.tasks.length === 0 && data.checklists.length === 0 && (
              <p className="font-mono text-[10px] uppercase text-grey-light">NO LIVE REFERENCES — THEY MAY HAVE BEEN REMOVED.</p>
            )}

            <div className="flex justify-end">
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>CLOSE</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
