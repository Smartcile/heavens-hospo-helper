'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { pushToast } from '@/components/ui/Toast'
import { ALL_CUSTOMER_GROUP_AREAS, CUSTOMER_GROUP_AREAS, groupAreaLabels, groupKindLabel } from '@/lib/customer-groups'
import type { CustomerGroupRow } from '@/components/admin/member-types'

interface Props {
  isOpen: boolean
  groups: CustomerGroupRow[]
  venueId: string
  onClose: () => void
  onChanged: () => void
}

interface FormState {
  name: string
  kind: 'MEMBER_DATABASE' | 'GIFT_CARD'
  description: string
  colour: string
  isActive: boolean
  sortOrder: string
  areas: string[]
  parkingTypeId: string
}

interface ParkingTypeOption {
  id: string
  name: string
  isActive: boolean
}

const EMPTY: FormState = {
  name: '',
  kind: 'MEMBER_DATABASE',
  description: '',
  colour: '',
  isActive: true,
  sortOrder: '0',
  areas: ['CUSTOMERS', 'BOOKINGS', 'ORDERS'],
  parkingTypeId: '',
}

export function CustomerGroupsPanel({ isOpen, groups, venueId, onClose, onChanged }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [parkingTypes, setParkingTypes] = useState<ParkingTypeOption[]>([])

  useEffect(() => {
    if (!isOpen || !venueId) return
    let cancelled = false
    const params = new URLSearchParams({ venueId })
    fetch(`/api/admin/parking/ftp/types?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : { types: [] }))
      .then((body) => {
        if (!cancelled) setParkingTypes(Array.isArray(body.types) ? body.types : [])
      })
      .catch(() => {
        if (!cancelled) setParkingTypes([])
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, venueId])

  useEffect(() => {
    if (!isOpen) return
    setError('')
    if (groups.length > 0) {
      selectGroup(groups[0])
    } else {
      setEditingId(null)
      setForm({ ...EMPTY, areas: [...EMPTY.areas] })
    }
  }, [isOpen, groups.length])

  function selectGroup(group: CustomerGroupRow) {
    setEditingId(group.id)
    setForm({
      name: group.name,
      kind: group.kind,
      description: group.description ?? '',
      colour: group.colour ?? '',
      isActive: group.isActive,
      sortOrder: String(group.sortOrder),
      areas: [...group.areas],
      parkingTypeId: group.parkingTypeId ?? '',
    })
    setError('')
  }

  function newGroup() {
    setEditingId(null)
    setForm({ ...EMPTY, areas: [...EMPTY.areas] })
    setError('')
  }

  function toggleArea(area: string) {
    setForm((current) => {
      const areas = current.areas.includes(area)
        ? current.areas.filter((a) => a !== area)
        : ALL_CUSTOMER_GROUP_AREAS.filter((a) => [...current.areas, area].includes(a))
      return {
        ...current,
        areas,
        parkingTypeId: areas.includes('PARKING') ? current.parkingTypeId : '',
      }
    })
  }

  async function save() {
    if (!form.name.trim()) {
      setError('NAME IS REQUIRED')
      return
    }
    setBusy('save')
    setError('')
    try {
      const res = await fetch(
        editingId ? `/api/admin/customer-groups/${editingId}` : '/api/admin/customer-groups',
        {
          method: editingId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            venueId,
            name: form.name,
            kind: form.kind,
            description: form.description,
            colour: form.colour,
            isActive: form.isActive,
            sortOrder: Number(form.sortOrder) || 0,
            areas: form.areas,
            parkingTypeId: form.areas.includes('PARKING') ? form.parkingTypeId || null : null,
          }),
        },
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || 'SAVE FAILED')
        return
      }
      if (body.parkingSync?.linked) {
        pushToast(`DATABASE SAVED — ${body.parkingSync.synced ?? 0} PARKING MEMBERS`, 'success')
      } else {
        pushToast(editingId ? 'DATABASE SAVED' : 'DATABASE CREATED', 'success')
      }
      onChanged()
      setEditingId(body.group?.id ?? null)
    } catch {
      setError('SAVE FAILED')
    } finally {
      setBusy('')
    }
  }

  async function remove() {
    if (!editingId) return
    const group = groups.find((g) => g.id === editingId)
    if (!window.confirm(`DELETE DATABASE "${group?.name ?? ''}"? MEMBERS ARE KEPT BUT THE DATABASE IS HIDDEN.`)) {
      return
    }
    setBusy('delete')
    setError('')
    try {
      const res = await fetch(`/api/admin/customer-groups/${editingId}?venueId=${encodeURIComponent(venueId)}`, {
        method: 'DELETE',
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || 'DELETE FAILED')
        return
      }
      pushToast('DATABASE DELETED', 'success')
      setEditingId(null)
      setForm({ ...EMPTY, areas: [...EMPTY.areas] })
      onChanged()
    } catch {
      setError('DELETE FAILED')
    } finally {
      setBusy('')
    }
  }

  async function syncParking() {
    if (!editingId) return
    setBusy('parking')
    setError('')
    try {
      const res = await fetch(`/api/admin/customer-groups/${editingId}/sync-parking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || 'PARKING SYNC FAILED')
        return
      }
      if (!body.linked) {
        pushToast('THIS DATABASE IS NOT LINKED TO A PARKING TYPE', 'error')
        return
      }
      pushToast(
        `PARKING SYNCED: ${body.synced ?? 0} MEMBERS${body.deactivated ? ` · ${body.deactivated} RETIRED` : ''}`,
        'success',
      )
      onChanged()
    } catch {
      setError('PARKING SYNC FAILED')
    } finally {
      setBusy('')
    }
  }

  async function syncGiftCards() {
    setBusy('gift-cards')
    setError('')
    try {
      const res = await fetch('/api/admin/customer-memberships/gift-cards/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || 'GIFT CARD SYNC FAILED')
        return
      }
      pushToast(`GIFT CARDS SYNCED: ${body.synced ?? 0}${body.failed ? ` (${body.failed} FAILED)` : ''}`, 'success')
      onChanged()
    } catch {
      setError('GIFT CARD SYNC FAILED')
    } finally {
      setBusy('')
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="CUSTOMER DATABASES" size="xl">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">DATABASES</h3>
            <Button size="sm" variant="ghost" onClick={newGroup}>+ NEW</Button>
          </div>
          <div className="border border-grey-mid divide-y divide-grey-mid max-h-[420px] overflow-y-auto">
            {groups.length === 0 ? (
              <p className="p-3 font-mono text-xs text-grey-light">NO DATABASES YET.</p>
            ) : (
              groups.map((group) => (
                <button
                  key={group.id}
                  onClick={() => selectGroup(group)}
                  className={`w-full text-left px-3 py-2 hover:bg-grey-mid/10 ${
                    editingId === group.id ? 'bg-grey-mid/20' : ''
                  }`}
                >
                  <div className="font-mono text-xs uppercase text-white">{group.name}</div>
                  <div className="font-mono text-2xs uppercase text-grey-light">
                    {groupKindLabel(group.kind)} · {group.memberCount} · {groupAreaLabels(group.areas)}
                  </div>
                  {!group.isActive && (
                    <span className="font-mono text-2xs uppercase text-danger">INACTIVE</span>
                  )}
                </button>
              ))
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="w-full"
            loading={busy === 'gift-cards'}
            onClick={syncGiftCards}
          >
            SYNC GIFT CARD MEMBERS
          </Button>
        </div>

        <div className="lg:col-span-2 space-y-3">
          <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">
            {editingId ? 'EDIT DATABASE' : 'NEW DATABASE'}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              label="NAME"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="RAYC MEMBERS"
            />
            <Select
              label="KIND"
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as FormState['kind'] })}
              options={[
                { value: 'MEMBER_DATABASE', label: 'MEMBER DATABASE' },
                { value: 'GIFT_CARD', label: 'GIFT CARDS' },
              ]}
            />
            <Input
              label="COLOUR"
              value={form.colour}
              onChange={(e) => setForm({ ...form, colour: e.target.value })}
              placeholder="#FACC15"
            />
            <Input
              label="SORT ORDER"
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
            />
          </div>

          <Input
            label="DESCRIPTION"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="WHAT THIS DATABASE IS FOR"
          />

          <div className="border border-grey-mid p-3 space-y-2">
            <div className="font-mono text-xs uppercase text-grey-light tracking-wider">AVAILABLE IN</div>
            <div className="flex flex-wrap gap-2">
              {CUSTOMER_GROUP_AREAS.map((area) => (
                <button
                  key={area.id}
                  onClick={() => toggleArea(area.id)}
                  className={`px-2.5 py-1.5 font-mono text-xs uppercase tracking-wider border ${
                    form.areas.includes(area.id)
                      ? 'border-white bg-white text-black'
                      : 'border-grey-mid text-grey-light hover:border-white hover:text-white'
                  }`}
                >
                  {area.label}
                </button>
              ))}
            </div>
            <p className="font-mono text-2xs uppercase text-grey-light">
              AREA ACCESS ONLY - SWIFTPOS EXPORT MAPPING IS IN SETTINGS - SWIFT POS - MEMBERS.
            </p>
          </div>

          {form.areas.includes('PARKING') && (
            <div className="border border-grey-mid p-3 space-y-2">
              <Select
                label="PARKING TYPE"
                value={form.parkingTypeId}
                onChange={(e) => setForm({ ...form, parkingTypeId: e.target.value })}
                options={[
                  { value: '', label: 'NOT LINKED' },
                  ...parkingTypes.map((type) => ({
                    value: type.id,
                    label: `${type.name}${type.isActive ? '' : ' (INACTIVE)'}`,
                  })),
                ]}
              />
              <p className="font-mono text-2xs uppercase text-grey-light">
                LINKING SYNCS ACTIVE MEMBERS INTO THAT PARKING TYPE&apos;S LIST. EVENT GUEST LINKS STILL USE THE TYPE.
              </p>
              {parkingTypes.length === 0 && (
                <p className="font-mono text-2xs uppercase text-grey-light">
                  NO PARKING TYPES YET — ADD ONE IN SETTINGS → FTP → 4 HOUR.
                </p>
              )}
              {editingId && form.parkingTypeId && (
                <Button
                  size="sm"
                  variant="ghost"
                  loading={busy === 'parking'}
                  onClick={syncParking}
                >
                  SYNC TO PARKING
                </Button>
              )}
            </div>
          )}

          <label className="flex items-center gap-2 font-mono text-xs uppercase text-grey-light">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            ACTIVE
          </label>

          {error && <p className="font-mono text-xs text-danger">{error}</p>}

          <div className="border-t border-grey-mid pt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" loading={busy === 'save'} onClick={save} disabled={!form.name.trim()}>
              SAVE DATABASE
            </Button>
            {editingId && (
              <Button size="sm" variant="danger" loading={busy === 'delete'} onClick={remove}>
                DELETE
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onClose}>CLOSE</Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
