'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { getActiveVenueId } from '@/lib/active-venue'

interface ParkingMember {
  id: string
  membershipNumber: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  parkingTypeId: string | null
  parkingTypeName: string | null
  isActive: boolean
  isTest: boolean
  notes: string | null
  createdAt: string
  plates: { id: string; plate: string; isDefault: boolean; createdAt: string }[]
}

interface TypeOption {
  id: string
  name: string
  isActive: boolean
}

const EMPTY = {
  membershipNumber: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  parkingTypeId: '',
  isActive: true,
  isTest: false,
  notes: '',
}

export function ParkingMembersPanel({
  role,
  sessionVenueId,
  defaultVenueId,
}: {
  role: string
  sessionVenueId: string
  defaultVenueId?: string | null
}) {
  const venueId = getActiveVenueId(role, sessionVenueId, defaultVenueId)
  const [members, setMembers] = useState<ParkingMember[]>([])
  const [types, setTypes] = useState<TypeOption[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/admin/parking/ftp/test-members?venueId=${encodeURIComponent(venueId)}`,
      )
      if (!res.ok) {
        setError('COULD NOT LOAD PARKING MEMBERS')
        return
      }
      const body = await res.json()
      setMembers(body.members ?? [])
      setTypes(body.types ?? [])
      setError('')
    } catch {
      setError('COULD NOT LOAD PARKING MEMBERS')
    } finally {
      setLoading(false)
    }
  }, [venueId])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const needle = search.trim().toUpperCase()
    if (!needle) return members
    return members.filter((member) =>
      [
        member.membershipNumber,
        member.firstName,
        member.lastName,
        member.email ?? '',
        member.phone ?? '',
        member.parkingTypeName ?? '',
      ]
        .join(' ')
        .toUpperCase()
        .includes(needle),
    )
  }, [members, search])

  function openNew() {
    setEditing(null)
    setForm({
      ...EMPTY,
      parkingTypeId: types.find((type) => type.isActive)?.id ?? types[0]?.id ?? '',
    })
    setOpen(true)
    setError('')
  }

  function openEdit(member: ParkingMember) {
    setEditing(member.id)
    setForm({
      membershipNumber: member.membershipNumber,
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email ?? '',
      phone: member.phone ?? '',
      parkingTypeId: member.parkingTypeId ?? '',
      isActive: member.isActive,
      isTest: member.isTest,
      notes: member.notes ?? '',
    })
    setOpen(true)
    setError('')
  }

  async function save() {
    setBusy('save')
    setError('')
    setMessage('')
    try {
      const res = await fetch(
        editing
          ? `/api/admin/parking/ftp/test-members/${editing}?venueId=${encodeURIComponent(venueId)}`
          : '/api/admin/parking/ftp/test-members',
        {
          method: editing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ venueId, ...form }),
        },
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || 'SAVE FAILED')
        return
      }
      setOpen(false)
      setMessage(editing ? 'MEMBER SAVED' : 'MEMBER CREATED')
      await load()
    } catch {
      setError('SAVE FAILED')
    } finally {
      setBusy('')
    }
  }

  async function remove(member: ParkingMember) {
    if (!window.confirm(`DELETE MEMBER ${member.membershipNumber}?`)) return
    setBusy(member.id)
    setError('')
    setMessage('')
    try {
      const res = await fetch(
        `/api/admin/parking/ftp/test-members/${member.id}?venueId=${encodeURIComponent(venueId)}`,
        { method: 'DELETE' },
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'DELETE FAILED')
        return
      }
      setMessage('MEMBER DELETED')
      await load()
    } catch {
      setError('DELETE FAILED')
    } finally {
      setBusy('')
    }
  }

  async function removePlate(member: ParkingMember, plateId: string, plate: string) {
    if (!window.confirm(`REMOVE PLATE ${plate} FROM ${member.membershipNumber}?`)) return
    setBusy(plateId)
    setError('')
    try {
      const res = await fetch(
        `/api/admin/parking/ftp/test-members/${member.id}/plates/${plateId}?venueId=${encodeURIComponent(venueId)}`,
        { method: 'DELETE' },
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'COULD NOT REMOVE THE PLATE')
        return
      }
      await load()
    } catch {
      setError('COULD NOT REMOVE THE PLATE')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-mono text-lg font-bold uppercase tracking-widest text-white">
            PARKING MEMBERS
          </h2>
          <p className="font-mono text-xs text-grey-light">
            THE REAL MEMBERSHIP-NUMBER DATABASE USED BY THE 4 HOUR KIOSK. PLATES ARE ADDED
            AUTOMATICALLY ON THE FIRST CONFIRMED CLAIM.
          </p>
        </div>
        <Button size="sm" onClick={openNew} disabled={types.length === 0}>
          + ADD MEMBER
        </Button>
      </div>

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="SEARCH BY NUMBER, NAME, EMAIL, PHONE OR TYPE..."
      />

      {message && <p className="font-mono text-xs text-success">{message}</p>}
      {error && <p className="font-mono text-xs text-danger">{error}</p>}

      {open && (
        <div className="border border-grey-mid p-4 space-y-3">
          <h3 className="font-mono text-xs uppercase tracking-wider text-grey-light">
            {editing ? 'EDIT MEMBER' : 'NEW MEMBER'}
          </h3>
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              label="Membership number (2–5 digits)"
              value={form.membershipNumber}
              onChange={(e) => setForm({ ...form, membershipNumber: e.target.value })}
            />
            <Select
              label="Parking type"
              value={form.parkingTypeId}
              onChange={(e) => setForm({ ...form, parkingTypeId: e.target.value })}
              options={types.map((type) => ({
                value: type.id,
                label: `${type.name}${type.isActive ? '' : ' (INACTIVE)'}`,
              }))}
            />
            <Input
              label="First name"
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
            />
            <Input
              label="Last name"
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
            />
            <Input
              label="Email (optional)"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <Input
              label="Phone (optional)"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <Input
            label="Notes (optional)"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="h-4 w-4 accent-white"
              />
              <span className="font-mono text-xs uppercase text-white">ACTIVE</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.isTest}
                onChange={(e) => setForm({ ...form, isTest: e.target.checked })}
                className="h-4 w-4 accent-white"
              />
              <span className="font-mono text-xs uppercase text-white">TEST MEMBER</span>
            </label>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-grey-mid pt-3">
            <Button size="sm" onClick={() => void save()} loading={busy === 'save'}>
              SAVE MEMBER
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              CANCEL
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : filtered.length === 0 ? (
        <p className="font-mono text-xs text-grey-light">
          {members.length === 0
            ? 'NO PARKING MEMBERS YET.'
            : 'NO PARKING MEMBERS MATCH.'}
        </p>
      ) : (
        <div className="border border-grey-mid divide-y divide-grey-mid">
          {filtered.map((member) => (
            <div key={member.id} className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm text-white">
                    {member.membershipNumber} · {member.firstName} {member.lastName}
                  </p>
                  <p className="font-mono text-2xs uppercase text-grey-light">
                    {member.parkingTypeName ?? 'NO TYPE'} · {member.email ?? 'NO EMAIL'} ·{' '}
                    {member.phone ?? 'NO PHONE'}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  <span
                    className={`border px-2 py-0.5 font-mono text-2xs uppercase ${
                      member.isActive
                        ? 'border-success/40 text-success'
                        : 'border-grey-mid text-grey-light'
                    }`}
                  >
                    {member.isActive ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                  {member.isTest && (
                    <span className="border border-warning/40 px-2 py-0.5 font-mono text-2xs uppercase text-warning">
                      TEST
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {member.plates.length === 0 ? (
                  <span className="font-mono text-2xs uppercase text-grey-light">
                    NO PLATES YET — THE KIOSK ADDS ONE ON THE FIRST CLAIM
                  </span>
                ) : (
                  member.plates.map((plate) => (
                    <span
                      key={plate.id}
                      className="inline-flex items-center gap-2 border border-grey-mid px-2 py-1 font-mono text-2xs uppercase text-white"
                    >
                      {plate.plate}
                      {plate.isDefault ? ' · DEFAULT' : ''}
                      <button
                        type="button"
                        onClick={() => void removePlate(member, plate.id, plate.plate)}
                        disabled={busy === plate.id}
                        className="text-danger"
                        aria-label={`Remove plate ${plate.plate}`}
                      >
                        ×
                      </button>
                    </span>
                  ))
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={() => openEdit(member)}>
                  EDIT
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => void remove(member)}
                  loading={busy === member.id}
                >
                  DELETE
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
