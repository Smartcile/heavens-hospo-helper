'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { pushToast } from '@/components/ui/Toast'
import type { CustomerGroupRow } from '@/components/admin/member-types'

interface MappingDraft {
  typeActive: string
  statusActive: string
  typeRemoved: string
  statusRemoved: string
  exportEncoding: string
}

function draftFrom(group: CustomerGroupRow): MappingDraft {
  return {
    typeActive: String(group.mapping.typeActive),
    statusActive: String(group.mapping.statusActive),
    typeRemoved: String(group.mapping.typeRemoved),
    statusRemoved: String(group.mapping.statusRemoved),
    exportEncoding: group.mapping.exportEncoding,
  }
}

export function SwiftPosMembersPanel({ venueId }: { venueId: string }) {
  const [groups, setGroups] = useState<CustomerGroupRow[]>([])
  const [drafts, setDrafts] = useState<Record<string, MappingDraft>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (venueId) params.set('venueId', venueId)
      const res = await fetch(`/api/admin/swiftpos/members?${params.toString()}`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || 'COULD NOT LOAD MEMBER DATABASES')
        return
      }
      const rows = (body.groups ?? []) as CustomerGroupRow[]
      setGroups(rows)
      setDrafts(Object.fromEntries(rows.map((group) => [group.id, draftFrom(group)])))
      setError('')
    } catch {
      setError('COULD NOT LOAD MEMBER DATABASES')
    } finally {
      setLoading(false)
    }
  }, [venueId])

  useEffect(() => {
    void load()
  }, [load])

  async function save(group: CustomerGroupRow) {
    const draft = drafts[group.id]
    if (!draft) return
    setBusy(group.id)
    setError('')
    try {
      const res = await fetch('/api/admin/swiftpos/members', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venueId,
          groupId: group.id,
          swiftPosTypeActive: Number(draft.typeActive),
          swiftPosStatusActive: Number(draft.statusActive),
          swiftPosTypeRemoved: Number(draft.typeRemoved),
          swiftPosStatusRemoved: Number(draft.statusRemoved),
          exportEncoding: draft.exportEncoding,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || 'SAVE FAILED')
        return
      }
      pushToast(`${group.name} MAPPING SAVED`, 'success')
      await load()
    } catch {
      setError('SAVE FAILED')
    } finally {
      setBusy('')
    }
  }

  if (loading) return <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>

  return (
    <div className="space-y-3">
      <div className="border border-grey-mid p-3 space-y-1">
        <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">SWIFTPOS MEMBER EXPORT</h3>
        <p className="font-mono text-2xs uppercase text-grey-light">
          EACH DATABASE EXPORTS ACTIVE AND INACTIVE MEMBERS TO SWIFTPOS WITH THE TYPE / STATUS BELOW.
          GIFT CARDS CAN USE THEIR OWN CLASSIFICATION.
        </p>
      </div>

      {error && <p className="font-mono text-xs text-danger">{error}</p>}

      {groups.length === 0 ? (
        <p className="font-mono text-xs text-grey-light">
          NO CUSTOMER DATABASES YET. CREATE ONE IN OPS → CUSTOMERS → CUSTOMER DATABASES.
        </p>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const draft = drafts[group.id] ?? draftFrom(group)
            return (
              <div key={group.id} className="border border-grey-mid p-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-mono text-sm uppercase text-white">{group.name}</div>
                    <div className="font-mono text-2xs uppercase text-grey-light">
                      {group.kind === 'GIFT_CARD' ? 'GIFT CARDS' : 'MEMBERS'} · {group.memberCount} RECORDS
                    </div>
                  </div>
                  <Button size="sm" loading={busy === group.id} onClick={() => void save(group)}>
                    SAVE MAPPING
                  </Button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  <Input
                    label="ACTIVE TYPE"
                    type="number"
                    value={draft.typeActive}
                    onChange={(e) => setDrafts({ ...drafts, [group.id]: { ...draft, typeActive: e.target.value } })}
                  />
                  <Input
                    label="ACTIVE STATUS"
                    type="number"
                    value={draft.statusActive}
                    onChange={(e) => setDrafts({ ...drafts, [group.id]: { ...draft, statusActive: e.target.value } })}
                  />
                  <Input
                    label="REMOVED TYPE"
                    type="number"
                    value={draft.typeRemoved}
                    onChange={(e) => setDrafts({ ...drafts, [group.id]: { ...draft, typeRemoved: e.target.value } })}
                  />
                  <Input
                    label="REMOVED STATUS"
                    type="number"
                    value={draft.statusRemoved}
                    onChange={(e) => setDrafts({ ...drafts, [group.id]: { ...draft, statusRemoved: e.target.value } })}
                  />
                  <Select
                    label="ENCODING"
                    value={draft.exportEncoding}
                    onChange={(e) => setDrafts({ ...drafts, [group.id]: { ...draft, exportEncoding: e.target.value } })}
                    options={[
                      { value: 'UTF8_BOM', label: 'UTF-8 WITH BOM' },
                      { value: 'UTF8', label: 'UTF-8' },
                    ]}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
