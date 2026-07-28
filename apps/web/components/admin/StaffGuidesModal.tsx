'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils'

interface GuideItem {
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

interface AllGuide { id: string; title: string }

export function StaffGuidesModal({
  staffId,
  staffName,
  onClose,
}: {
  staffId: string
  staffName: string
  onClose: () => void
}) {
  const [items, setItems] = useState<GuideItem[]>([])
  const [allGuides, setAllGuides] = useState<AllGuide[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [assignGuideId, setAssignGuideId] = useState('')
  const [assignReason, setAssignReason] = useState('')

  async function load() {
    const [gR, aR] = await Promise.all([
      fetch(`/api/admin/staff/${staffId}/guides`),
      fetch('/api/admin/guides'),
    ])
    const gData = await gR.json()
    const aData = await aR.json()
    setItems(gData.items ?? [])
    setAllGuides((aData ?? []).map((g: AllGuide) => ({ id: g.id, title: g.title })))
    setLoading(false)
  }

  useEffect(() => { load() }, [staffId])

  async function markTrained(guideId: string) {
    setBusy(guideId)
    await fetch('/api/admin/guides/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guideId, staffId }),
    })
    await load()
    setBusy(null)
  }

  async function revoke(guideId: string) {
    if (!confirm('REVOKE THIS COMPLETION? THE PERSON WILL NEED RE-TRAINING.')) return
    setBusy(guideId)
    await fetch(`/api/admin/guides/complete?guideId=${guideId}&staffId=${staffId}`, { method: 'DELETE' })
    await load()
    setBusy(null)
  }

  async function assign() {
    if (!assignGuideId) return
    setBusy('assign')
    await fetch('/api/admin/guides/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guideId: assignGuideId, staffId, reason: assignReason || null }),
    })
    setAssignGuideId(''); setAssignReason('')
    await load()
    setBusy(null)
  }

  async function unassign(guideId: string) {
    setBusy(guideId)
    await fetch(`/api/admin/guides/assign?guideId=${guideId}&staffId=${staffId}`, { method: 'DELETE' })
    await load()
    setBusy(null)
  }

  const done = items.filter((i) => i.completed).length
  const applicableIds = new Set(items.map((i) => i.id))
  const assignableOptions = [
    { value: '', label: 'SELECT A GUIDE TO ASSIGN' },
    ...allGuides.filter((g) => !applicableIds.has(g.id)).map((g) => ({ value: g.id, label: g.title })),
  ]

  return (
    <Modal isOpen onClose={onClose} title={`GUIDES — ${staffName}`} size="lg">
      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : (
        <div className="space-y-4">
          <div className="font-mono text-xs text-grey-light">
            {done} OF {items.length} COMPLETE
          </div>

          {items.length === 0 ? (
            <p className="font-mono text-xs text-grey-light">NO GUIDES APPLY TO THIS PERSON YET. ASSIGN ONE BELOW.</p>
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

          <div className="border-t border-grey-mid pt-3 space-y-2">
            <label className="font-mono text-xs uppercase text-grey-light tracking-wider">ASSIGN A GUIDE</label>
            <Select value={assignGuideId} onChange={(e) => setAssignGuideId(e.target.value)} options={assignableOptions} />
            <Input value={assignReason} onChange={(e) => setAssignReason(e.target.value)} placeholder="REASON (e.g. UPSKILL, AREA TO WORK ON)" />
            <Button size="sm" onClick={assign} loading={busy === 'assign'} disabled={!assignGuideId}>ASSIGN</Button>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="ghost" onClick={onClose}>CLOSE</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
