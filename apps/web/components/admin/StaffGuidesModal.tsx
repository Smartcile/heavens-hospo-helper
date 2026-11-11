'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { groupGuidesByFolder } from '@/lib/guide-folders'
import { formatDate } from '@/lib/utils'
import { RetrainRequestModal } from '@/components/admin/RetrainRequestModal'

interface GuideItem {
  id: string
  title: string
  category: string | null
  requiresSignOff: boolean
  isOnboarding: boolean
  folderId: string | null
  folderName: string | null
  updatedAt: string
  source: 'ONBOARDING' | 'DEPARTMENT' | 'ASSIGNED'
  assignmentReason: string | null
  completed: boolean
  stale: boolean
  needsAction: boolean
  severity: 'WARNING' | 'CRITICAL' | null
  reasonText: string | null
  retrainRequestId: string | null
  completion: {
    completedAt: string
    selfCompleted: boolean
    signedOffByName: string | null
    note: string | null
  } | null
}

interface AllGuide { id: string; title: string }
interface Folder { id: string; name: string; sortOrder: number }

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
  const [folders, setFolders] = useState<Folder[]>([])
  const [canSignOff, setCanSignOff] = useState(true)
  const [canAssign, setCanAssign] = useState(true)
  const [allGuides, setAllGuides] = useState<AllGuide[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [assignGuideId, setAssignGuideId] = useState('')
  const [assignReason, setAssignReason] = useState('')
  const [view, setView] = useState<'FOLDER' | 'ALL'>('FOLDER')
  const [retrain, setRetrain] = useState<{ guideIds: string[] } | null>(null)
  const [error, setError] = useState('')

  async function load() {
    const [gR, aR] = await Promise.all([
      fetch(`/api/admin/staff/${staffId}/guides`),
      fetch('/api/admin/guides'),
    ])
    const gData = await gR.json()
    const aData = await aR.json()
    setItems(gData.items ?? [])
    setFolders(gData.folders ?? [])
    setCanSignOff(gData.canSignOff !== false)
    setCanAssign(gData.canAssign !== false)
    setAllGuides((aData ?? []).map((g: AllGuide) => ({ id: g.id, title: g.title })))
    setLoading(false)
  }

  useEffect(() => { load() }, [staffId])

  async function markTrained(item: GuideItem) {
    setBusy(item.id)
    setError('')
    await fetch('/api/admin/guides/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guideId: item.id, staffId }),
    })
    if (item.retrainRequestId) {
      await fetch(`/api/admin/guide-retrain/${item.retrainRequestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'RESOLVE' }),
      })
    }
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

  async function dismissWarning(requestId: string) {
    setBusy(requestId)
    setError('')
    const r = await fetch(`/api/admin/guide-retrain/${requestId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'DISMISS' }),
    })
    if (!r.ok) {
      const d = (await r.json().catch(() => ({}))) as { error?: string }
      setError((d.error ?? 'COULD NOT DISMISS').toUpperCase())
    } else {
      await load()
    }
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

  const folderGroups = useMemo(
    () =>
      view === 'FOLDER' && folders.length
        ? groupGuidesByFolder(items, folders)
        : [{ folder: null, guides: items }],
    [items, folders, view],
  )

  function renderItem(it: GuideItem) {
    const flagged = it.stale || !!it.retrainRequestId
    return (
      <div
        key={it.id}
        className={`border p-3 ${
          flagged
            ? 'border-danger border-l-4 border-l-danger bg-danger/10'
            : it.completed
              ? 'border-grey-mid status-bar-success'
              : 'border-grey-mid status-bar-warning'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-mono text-sm font-semibold uppercase text-white">{it.title}</div>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <Badge>{it.source}</Badge>
              <Badge variant={it.requiresSignOff ? 'warning' : 'success'}>
                {it.requiresSignOff ? 'SIGN-OFF' : 'SELF'}
              </Badge>
              {it.assignmentReason && <Badge>{it.assignmentReason}</Badge>}
              {it.retrainRequestId && <Badge variant="danger">RETRAIN REQUESTED</Badge>}
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
            {it.needsAction && it.reasonText && (
              <div className={`font-mono text-xs mt-1 ${flagged ? 'text-danger' : 'text-warning'}`}>
                {it.reasonText.toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            {canSignOff && (!it.retrainRequestId || canAssign) && (!it.completed || it.stale) && (
              <button
                onClick={() => markTrained(it)}
                disabled={busy === it.id}
                className="font-mono text-xs uppercase text-success hover:opacity-80 transition-opacity"
              >
                {busy === it.id ? '...' : it.stale ? 'MARK RETRAINED' : 'MARK TRAINED'}
              </button>
            )}
            {canSignOff && it.completed && (
              <button onClick={() => revoke(it.id)} disabled={busy === it.id} className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors">REVOKE</button>
            )}
            {canAssign && it.needsAction && !it.retrainRequestId && (
              <button
                onClick={() => setRetrain({ guideIds: [it.id] })}
                className="font-mono text-xs uppercase text-warning hover:text-white transition-colors"
              >
                MARK FOR RETRAINING
              </button>
            )}
            {canAssign && it.retrainRequestId && (
              <button
                onClick={() => dismissWarning(it.retrainRequestId!)}
                disabled={busy === it.retrainRequestId}
                className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors"
              >
                DISMISS WARNING
              </button>
            )}
            {it.source === 'ASSIGNED' && (
              <button onClick={() => unassign(it.id)} disabled={busy === it.id} className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors">UNASSIGN</button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <Modal isOpen onClose={onClose} title={`GUIDES — ${staffName}`} size="lg">
      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="font-mono text-xs text-grey-light">
              {done} OF {items.length} COMPLETE
            </div>
            {items.length > 0 && (
              <div className="flex gap-1">
                {(['FOLDER', 'ALL'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    className={`font-mono text-xs uppercase border px-2 py-1 transition-colors ${
                      view === v ? 'border-white text-white' : 'border-grey-mid text-grey-light hover:text-white'
                    }`}
                  >
                    {v === 'FOLDER' ? 'BY FOLDER' : 'ALL GUIDES'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && <p className="font-mono text-xs text-danger">{error}</p>}

          {items.length === 0 ? (
            <p className="font-mono text-xs text-grey-light">NO GUIDES APPLY TO THIS PERSON YET. ASSIGN ONE BELOW.</p>
          ) : (
            <div className="space-y-3">
              {folderGroups.map(({ folder, guides }) => (
                <div key={folder?.id ?? '__unfiled__'} className="space-y-1">
                  {view === 'FOLDER' && folders.length > 0 && (
                    <div className="font-mono text-2xs uppercase tracking-widest text-grey-light border-b border-grey-mid pb-1">
                      {folder ? folder.name : 'UNFILED'} ({guides.length})
                    </div>
                  )}
                  {guides.map(renderItem)}
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

      {retrain && (
        <RetrainRequestModal
          endpoint="/api/admin/guide-retrain"
          staffOptions={[{ id: staffId, name: staffName }]}
          guideOptions={items.map((i) => ({ id: i.id, title: i.title, folderId: i.folderId }))}
          folders={folders}
          initialStaffId={staffId}
          initialGuideIds={retrain.guideIds}
          onClose={() => setRetrain(null)}
          onCreated={load}
        />
      )}
    </Modal>
  )
}
