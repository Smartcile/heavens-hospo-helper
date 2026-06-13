'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils'

interface TrainingItem {
  id: string
  title: string
  category: string | null
  requiresSignOff: boolean
  isOnboarding: boolean
  source: 'ONBOARDING' | 'DEPARTMENT' | 'ASSIGNED'
  assignmentReason: string | null
  completed: boolean
  completion: {
    completedAt: string
    selfCompleted: boolean
    signedOffByName: string | null
    note: string | null
  } | null
}

interface AllModule { id: string; title: string }

export function StaffTrainingModal({
  staffId,
  staffName,
  onClose,
}: {
  staffId: string
  staffName: string
  onClose: () => void
}) {
  const [items, setItems] = useState<TrainingItem[]>([])
  const [allModules, setAllModules] = useState<AllModule[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [assignModule, setAssignModule] = useState('')
  const [assignReason, setAssignReason] = useState('')

  async function load() {
    const [tR, mR] = await Promise.all([
      fetch(`/api/admin/staff/${staffId}/training`),
      fetch('/api/admin/training'),
    ])
    const tData = await tR.json()
    const mData = await mR.json()
    setItems(tData.items ?? [])
    setAllModules((mData ?? []).map((m: AllModule) => ({ id: m.id, title: m.title })))
    setLoading(false)
  }

  useEffect(() => { load() }, [staffId])

  async function markTrained(moduleId: string) {
    setBusy(moduleId)
    await fetch('/api/admin/training/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moduleId, staffId }),
    })
    await load()
    setBusy(null)
  }

  async function revoke(moduleId: string) {
    if (!confirm('REVOKE THIS COMPLETION? THE PERSON WILL NEED RE-TRAINING.')) return
    setBusy(moduleId)
    await fetch(`/api/admin/training/complete?moduleId=${moduleId}&staffId=${staffId}`, { method: 'DELETE' })
    await load()
    setBusy(null)
  }

  async function unassign(moduleId: string) {
    setBusy(moduleId)
    await fetch(`/api/admin/training/assign?moduleId=${moduleId}&staffId=${staffId}`, { method: 'DELETE' })
    await load()
    setBusy(null)
  }

  async function assign() {
    if (!assignModule) return
    setBusy('assign')
    await fetch('/api/admin/training/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moduleId: assignModule, staffId, reason: assignReason || null }),
    })
    setAssignModule(''); setAssignReason('')
    await load()
    setBusy(null)
  }

  const done = items.filter((i) => i.completed).length
  const applicableIds = new Set(items.map((i) => i.id))
  const assignableOptions = [
    { value: '', label: 'SELECT A MODULE TO ASSIGN' },
    ...allModules.filter((m) => !applicableIds.has(m.id)).map((m) => ({ value: m.id, label: m.title })),
  ]

  return (
    <Modal isOpen onClose={onClose} title={`TRAINING — ${staffName}`} size="lg">
      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : (
        <div className="space-y-4">
          <div className="font-mono text-xs text-grey-light">
            {done} OF {items.length} COMPLETE
          </div>

          {items.length === 0 ? (
            <p className="font-mono text-xs text-grey-light">NO TRAINING APPLIES TO THIS PERSON YET. ASSIGN ONE BELOW.</p>
          ) : (
            <div className="space-y-1">
              {items.map((it) => (
                <div key={it.id} className={`border border-grey-mid p-3 ${it.completed ? 'status-bar-success' : 'status-bar-warning'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-mono text-sm font-semibold uppercase text-white">{it.title}</div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <Badge>{it.source}</Badge>
                        <Badge variant={it.requiresSignOff ? 'warning' : 'success'}>
                          {it.requiresSignOff ? 'SIGN-OFF' : 'SELF'}
                        </Badge>
                        {it.assignmentReason && <Badge>{it.assignmentReason}</Badge>}
                      </div>
                      {it.completed && it.completion && (
                        <div className="font-mono text-xs text-success mt-1">
                          COMPLETED {formatDate(it.completion.completedAt)}{' '}
                          {it.completion.selfCompleted
                            ? '(SELF)'
                            : it.completion.signedOffByName
                              ? `(BY ${it.completion.signedOffByName})`
                              : '(SIGNED OFF)'}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      {it.completed ? (
                        <button onClick={() => revoke(it.id)} disabled={busy === it.id} className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors">REVOKE</button>
                      ) : (
                        <button onClick={() => markTrained(it.id)} disabled={busy === it.id} className="font-mono text-xs uppercase text-success hover:opacity-80 transition-opacity">
                          {busy === it.id ? '...' : 'MARK TRAINED'}
                        </button>
                      )}
                      {it.source === 'ASSIGNED' && (
                        <button onClick={() => unassign(it.id)} disabled={busy === it.id} className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors">UNASSIGN</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Assign a module (upskill / area to work on) */}
          <div className="border-t border-grey-mid pt-3 space-y-2">
            <label className="font-mono text-xs uppercase text-grey-light tracking-wider">ASSIGN A MODULE</label>
            <Select value={assignModule} onChange={(e) => setAssignModule(e.target.value)} options={assignableOptions} />
            <Input value={assignReason} onChange={(e) => setAssignReason(e.target.value)} placeholder="REASON (e.g. UPSKILL, AREA TO WORK ON)" />
            <Button size="sm" onClick={assign} loading={busy === 'assign'} disabled={!assignModule}>ASSIGN</Button>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="ghost" onClick={onClose}>CLOSE</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
