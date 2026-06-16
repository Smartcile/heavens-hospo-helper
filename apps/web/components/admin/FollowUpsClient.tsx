'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/Badge'

interface FollowUp {
  id: string
  kind: 'MISSED' | 'UNTRAINED' | 'INCORRECT'
  detail: string | null
  dueDate: string | null
  staffName: string
  taskTitle: string | null
  moduleId: string | null
  moduleTitle: string | null
  venueName: string
  createdAt: string
}

const KIND_LABEL: Record<FollowUp['kind'], string> = {
  MISSED: 'MISSED TASK',
  UNTRAINED: 'DONE — NOT TRAINED',
  INCORRECT: 'NOT DONE CORRECTLY',
}
const KIND_VARIANT: Record<FollowUp['kind'], 'danger' | 'warning' | 'default'> = {
  MISSED: 'danger',
  UNTRAINED: 'warning',
  INCORRECT: 'warning',
}

export function FollowUpsClient({ role }: { role: string }) {
  const [items, setItems] = useState<FollowUp[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  async function load(generate = false) {
    setLoading(true)
    const r = await fetch(`/api/admin/followups${generate ? '?generate=1' : ''}`)
    const data = await r.json()
    setItems(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  // Generate (scan for missed tasks) + load on first open.
  useEffect(() => { load(true) }, [])

  async function act(id: string, action: 'resolve' | 'signoff') {
    setBusy(id)
    await fetch(`/api/admin/followups/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    setBusy(null)
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="font-mono text-xl font-bold uppercase tracking-widest">FOLLOW-UPS</h1>
          <p className="font-mono text-xs text-grey-light mt-1">
            AUTO-RAISED WHEN A TASK IS MISSED OR DONE BY SOMEONE WITHOUT THE REQUIRED TRAINING. RESOLVE OR SIGN OFF TO CLEAR.
          </p>
        </div>
        <button onClick={() => load(true)} className="font-mono text-xs uppercase border border-grey-mid px-3 py-1.5 text-white hover:border-white transition-colors">RE-SCAN</button>
      </div>

      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">SCANNING</p>
      ) : items.length === 0 ? (
        <p className="font-mono text-xs text-success">ALL CLEAR — NO OPEN FOLLOW-UPS.</p>
      ) : (
        <div className="space-y-2">
          {items.map((f) => (
            <div key={f.id} className="bg-grey-dark border border-grey-mid p-3 flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={KIND_VARIANT[f.kind]}>{KIND_LABEL[f.kind]}</Badge>
                  <span className="font-mono text-sm font-semibold uppercase text-white">{f.staffName}</span>
                  {role === 'ADMIN' && <span className="font-mono text-xs text-grey-light">· {f.venueName}</span>}
                </div>
                {f.detail && <p className="font-mono text-xs text-grey-light">{f.detail}</p>}
                <div className="font-mono text-[10px] uppercase text-grey-light flex flex-wrap gap-2">
                  {f.taskTitle && <span>TASK: {f.taskTitle}</span>}
                  {f.moduleTitle && <span className="text-accent">TRAINING: {f.moduleTitle}</span>}
                </div>
              </div>
              <div className="flex gap-3 flex-shrink-0">
                {f.kind === 'UNTRAINED' && f.moduleId && (
                  <button disabled={busy === f.id} onClick={() => act(f.id, 'signoff')} className="font-mono text-xs uppercase text-success hover:opacity-80 transition-opacity disabled:opacity-40">
                    SIGN OFF
                  </button>
                )}
                <button disabled={busy === f.id} onClick={() => act(f.id, 'resolve')} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors disabled:opacity-40">
                  RESOLVE
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
