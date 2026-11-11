'use client'

// Shared "mark for retraining" flow: pick the person, tick the guide(s) (folder
// grouped so a manager works folder by folder), add an optional reason, confirm.
// Used by the admin warnings list and the worker guide list, against their
// respective venue-checked endpoints.

import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import { groupGuidesByFolder } from '@/lib/guide-folders'

export interface RetrainStaffOption {
  id: string
  name: string
}

export interface RetrainGuideOption {
  id: string
  title: string
  folderId: string | null
}

export interface RetrainFolderOption {
  id: string
  name: string
  sortOrder: number
}

export function RetrainRequestModal({
  endpoint,
  staffOptions,
  guideOptions,
  folders,
  initialStaffId,
  initialGuideIds,
  onClose,
  onCreated,
}: {
  endpoint: string
  staffOptions: RetrainStaffOption[]
  guideOptions: RetrainGuideOption[]
  folders: RetrainFolderOption[]
  initialStaffId?: string
  initialGuideIds?: string[]
  onClose: () => void
  onCreated: () => void
}) {
  const [staffId, setStaffId] = useState(initialStaffId ?? staffOptions[0]?.id ?? '')
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialGuideIds ?? []))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const groups = useMemo(
    () =>
      folders.length
        ? groupGuidesByFolder(guideOptions, folders)
        : [{ folder: null, guides: guideOptions }],
    [guideOptions, folders],
  )

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submit() {
    if (!staffId) { setError('PICK A PERSON FIRST'); return }
    if (selected.size === 0) { setError('PICK AT LEAST ONE GUIDE'); return }
    setBusy(true)
    setError('')
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId, guideIds: [...selected], reason: reason.trim() || null }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        created?: { id: string }[]
        skipped?: { guideId: string; reason: string }[]
        error?: string
      }
      if (!res.ok) {
        setError((data.error ?? 'COULD NOT MARK FOR RETRAINING').toUpperCase())
        return
      }
      if (!data.created?.length) {
        const why = data.skipped?.map((s) => s.reason).filter(Boolean).join(' · ')
        setError(why ? `NOTHING TO DO — ${why}` : 'NOTHING TO DO')
        return
      }
      onCreated()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="MARK FOR RETRAINING" size="lg">
      <div className="space-y-4">
        <Select
          label="PERSON"
          value={staffId}
          onChange={(e) => setStaffId(e.target.value)}
          options={staffOptions.map((s) => ({ value: s.id, label: s.name }))}
        />

        <div className="space-y-2">
          <div className="font-mono text-xs uppercase text-grey-light tracking-wider">GUIDES</div>
          {groups.map(({ folder, guides }) => (
            <div key={folder?.id ?? '__unfiled__'} className="border border-grey-mid p-2 space-y-1">
              <div className="font-mono text-2xs uppercase tracking-wider text-grey-light">
                {folder ? folder.name : 'UNFILED'}
              </div>
              {guides.length === 0 ? (
                <p className="font-mono text-2xs text-grey-mid">NO GUIDES</p>
              ) : (
                guides.map((g) => (
                  <label key={g.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.has(g.id)}
                      onChange={() => toggle(g.id)}
                      className="accent-white"
                    />
                    <span className="font-mono text-xs uppercase text-white">{g.title}</span>
                  </label>
                ))
              )}
            </div>
          ))}
        </div>

        <Input
          label="REASON (OPTIONAL)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="E.G. MENU CHANGED, SEEN DOING IT UNSAFELY"
        />

        {error && <p className="font-mono text-xs text-danger">{error}</p>}

        <div className="border-t border-grey-mid pt-3 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>CANCEL</Button>
          <Button size="sm" onClick={submit} loading={busy} disabled={busy}>
            MARK {selected.size > 0 ? `${selected.size} ` : ''}FOR RETRAINING
          </Button>
        </div>
      </div>
    </Modal>
  )
}
