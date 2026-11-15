'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { claimStatusTone, DEFAULT_FTP_DURATION_MINUTES } from '@/lib/ftp-parking'
import { describeClaimStatus } from '@/lib/vpermit'

interface FtpType {
  id: string
  name: string
  windowLabel: string | null
  durationMinutes: number
  claimUrl: string | null
  claimCode: string | null
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  logPlates: boolean
  adminPinEnabled: boolean
  adminPinSet: boolean
  adminPinHint: string | null
  healthCheckMode: string
  healthPlate: string
  lastCheckAt: string | null
  lastCheckOk: boolean | null
  lastCheckMessage: string | null
  sortOrder: number
  isActive: boolean
  notes: string | null
  memberCount: number
  claimCount: number
}

interface FtpMember {
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

interface FtpClaim {
  id: string
  typeId: string | null
  typeName: string
  memberId: string | null
  membershipNumber: string | null
  credentialKind: string
  licensePlate: string | null
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  claimCode: string | null
  status: string
  message: string | null
  httpStatus: number | null
  validFrom: string | null
  validUntil: string | null
  locations: string[]
  evidencePdfPath: string | null
  evidenceImagePath: string | null
  evidenceHtmlPath: string | null
  durationMs: number | null
  note: string | null
  createdAt: string
}

interface MemberTypeOption {
  id: string
  name: string
  isActive: boolean
}

type PanelTab = 'types' | 'members' | 'log' | 'health'

interface TypeForm {
  name: string
  windowLabel: string
  durationMinutes: string
  claimUrl: string
  contactName: string
  contactEmail: string
  contactPhone: string
  logPlates: boolean
  adminPinEnabled: boolean
  adminPin: string
  healthCheckMode: string
  healthPlate: string
  sortOrder: string
  isActive: boolean
  notes: string
}

interface MemberForm {
  membershipNumber: string
  firstName: string
  lastName: string
  email: string
  phone: string
  parkingTypeId: string
  isActive: boolean
  notes: string
}

const EMPTY_TYPE: TypeForm = {
  name: '',
  windowLabel: '',
  durationMinutes: String(DEFAULT_FTP_DURATION_MINUTES),
  claimUrl: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  logPlates: true,
  adminPinEnabled: false,
  adminPin: '',
  healthCheckMode: 'BROWSER',
  healthPlate: 'STELLA',
  sortOrder: '0',
  isActive: true,
  notes: '',
}

const EMPTY_MEMBER: MemberForm = {
  membershipNumber: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  parkingTypeId: '',
  isActive: true,
  notes: '',
}

function formatDateTime(value: string | null, timezone: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-NZ', {
    timeZone: timezone,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function typeFormFrom(type: FtpType): TypeForm {
  return {
    name: type.name,
    windowLabel: type.windowLabel ?? '',
    durationMinutes: String(type.durationMinutes),
    claimUrl: type.claimUrl ?? '',
    contactName: type.contactName ?? '',
    contactEmail: type.contactEmail ?? '',
    contactPhone: type.contactPhone ?? '',
    logPlates: type.logPlates,
    adminPinEnabled: type.adminPinEnabled,
    adminPin: '',
    healthCheckMode: type.healthCheckMode,
    healthPlate: type.healthPlate,
    sortOrder: String(type.sortOrder),
    isActive: type.isActive,
    notes: type.notes ?? '',
  }
}

function memberFormFrom(member: FtpMember): MemberForm {
  return {
    membershipNumber: member.membershipNumber,
    firstName: member.firstName,
    lastName: member.lastName,
    email: member.email ?? '',
    phone: member.phone ?? '',
    parkingTypeId: member.parkingTypeId ?? '',
    isActive: member.isActive,
    notes: member.notes ?? '',
  }
}

function toneClass(status: string): string {
  const tone = claimStatusTone(status)
  if (tone === 'success') return 'text-success border-success/40'
  if (tone === 'warning') return 'text-warning border-warning/40'
  if (tone === 'muted') return 'text-grey-light border-grey-mid'
  return 'text-danger border-danger/40'
}

export function FtpFourHourPanel({ venueId, role }: { venueId: string; role: string }) {
  const [tab, setTab] = useState<PanelTab>('types')
  const [types, setTypes] = useState<FtpType[]>([])
  const [members, setMembers] = useState<FtpMember[]>([])
  const [memberTypes, setMemberTypes] = useState<MemberTypeOption[]>([])
  const [claims, setClaims] = useState<FtpClaim[]>([])
  const [timezone, setTimezone] = useState('Pacific/Auckland')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const [typeForm, setTypeForm] = useState<TypeForm>(EMPTY_TYPE)
  const [editingType, setEditingType] = useState<string | null>(null)
  const [typeOpen, setTypeOpen] = useState(false)
  const [newPin, setNewPin] = useState<{ typeId: string; pin: string } | null>(null)

  const [memberForm, setMemberForm] = useState<MemberForm>(EMPTY_MEMBER)
  const [editingMember, setEditingMember] = useState<string | null>(null)
  const [memberOpen, setMemberOpen] = useState(false)

  const [filters, setFilters] = useState({
    typeId: '',
    status: '',
    from: '',
    to: '',
    plate: '',
  })
  const [applied, setApplied] = useState(filters)
  const [filterNonce, setFilterNonce] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({})
  const [claimTotal, setClaimTotal] = useState(0)

  const loadTypes = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/parking/ftp/types?venueId=${encodeURIComponent(venueId)}`,
      )
      if (!res.ok) {
        setError('COULD NOT LOAD PARKING TYPES')
        return
      }
      const body = await res.json()
      setTypes(body.types ?? [])
      setTimezone(body.timezone || 'Pacific/Auckland')
      setError('')
    } catch {
      setError('COULD NOT LOAD PARKING TYPES')
    }
  }, [venueId])

  const loadMembers = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/parking/ftp/test-members?venueId=${encodeURIComponent(venueId)}`,
      )
      if (!res.ok) {
        setError('COULD NOT LOAD TEST MEMBERS')
        return
      }
      const body = await res.json()
      setMembers(body.members ?? [])
      setMemberTypes(body.types ?? [])
      setTimezone(body.timezone || 'Pacific/Auckland')
      setError('')
    } catch {
      setError('COULD NOT LOAD TEST MEMBERS')
    }
  }, [venueId])

  const claimQuery = useMemo(() => {
    const params = new URLSearchParams({ venueId, limit: '200' })
    if (applied.typeId) params.set('typeId', applied.typeId)
    if (applied.status) params.set('status', applied.status)
    if (applied.plate) params.set('plate', applied.plate)
    if (applied.from) params.set('from', new Date(`${applied.from}T00:00:00`).toISOString())
    if (applied.to) params.set('to', new Date(`${applied.to}T23:59:59`).toISOString())
    return params.toString()
  }, [venueId, applied])

  const loadClaims = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/parking/ftp/claims?${claimQuery}`)
      if (!res.ok) {
        setError('COULD NOT LOAD THE PLATE LOG')
        return
      }
      const body = await res.json()
      setClaims(body.claims ?? [])
      setClaimTotal(body.total ?? 0)
      setTimezone(body.timezone || 'Pacific/Auckland')
      setSelected(new Set())
      setNoteDraft(
        Object.fromEntries((body.claims ?? []).map((c: FtpClaim) => [c.id, c.note ?? ''])),
      )
      setError('')
    } catch {
      setError('COULD NOT LOAD THE PLATE LOG')
    }
  }, [claimQuery])

  useEffect(() => {
    void (async () => {
      setLoading(true)
      await loadTypes()
      setLoading(false)
    })()
  }, [loadTypes])

  useEffect(() => {
    if (tab === 'members') void loadMembers()
  }, [tab, loadMembers])

  useEffect(() => {
    if (tab !== 'log') return
    void loadClaims()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, filterNonce])

  function flash(text: string) {
    setMessage(text)
    setError('')
  }

  // ----- types -----

  function openNewType() {
    setEditingType(null)
    setTypeForm(EMPTY_TYPE)
    setTypeOpen(true)
    setNewPin(null)
    setError('')
  }

  function openEditType(type: FtpType) {
    setEditingType(type.id)
    setTypeForm(typeFormFrom(type))
    setTypeOpen(true)
    setNewPin(null)
    setError('')
  }

  async function saveType() {
    setBusy('type-save')
    setMessage('')
    setError('')
    try {
      const body: Record<string, unknown> = {
        venueId,
        name: typeForm.name,
        windowLabel: typeForm.windowLabel || null,
        durationMinutes: Number(typeForm.durationMinutes) || DEFAULT_FTP_DURATION_MINUTES,
        claimUrl: typeForm.claimUrl,
        contactName: typeForm.contactName || null,
        contactEmail: typeForm.contactEmail || null,
        contactPhone: typeForm.contactPhone || null,
        logPlates: typeForm.logPlates,
        adminPinEnabled: typeForm.adminPinEnabled,
        healthCheckMode: typeForm.healthCheckMode,
        healthPlate: typeForm.healthPlate,
        sortOrder: Number(typeForm.sortOrder) || 0,
        isActive: typeForm.isActive,
        notes: typeForm.notes || null,
      }
      if (typeForm.adminPin.trim()) body.adminPin = typeForm.adminPin.trim()
      const res = await fetch(
        editingType
          ? `/api/admin/parking/ftp/types/${editingType}?venueId=${encodeURIComponent(venueId)}`
          : '/api/admin/parking/ftp/types',
        {
          method: editingType ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      )
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(payload.error || 'SAVE FAILED')
        return
      }
      flash(editingType ? 'PARKING TYPE SAVED' : 'PARKING TYPE CREATED')
      setTypeOpen(false)
      await loadTypes()
    } catch {
      setError('SAVE FAILED')
    } finally {
      setBusy('')
    }
  }

  async function deleteType(type: FtpType) {
    if (!window.confirm(`DELETE ${type.name}? CLAIMS AND MEMBERS ARE KEPT.`)) return
    setBusy(type.id)
    setError('')
    try {
      const res = await fetch(
        `/api/admin/parking/ftp/types/${type.id}?venueId=${encodeURIComponent(venueId)}`,
        { method: 'DELETE' },
      )
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        setError(payload.error || 'DELETE FAILED')
        return
      }
      flash('PARKING TYPE DELETED')
      await loadTypes()
    } catch {
      setError('DELETE FAILED')
    } finally {
      setBusy('')
    }
  }

  async function rotatePin(type: FtpType) {
    setBusy(`${type.id}-pin`)
    setError('')
    setNewPin(null)
    try {
      const res = await fetch(`/api/admin/parking/ftp/types/${type.id}/admin-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueId }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(payload.error || 'COULD NOT SET THE ADMIN PIN')
        return
      }
      setNewPin({ typeId: type.id, pin: payload.pin })
      await loadTypes()
    } catch {
      setError('COULD NOT SET THE ADMIN PIN')
    } finally {
      setBusy('')
    }
  }

  // ----- members -----

  function openNewMember() {
    setEditingMember(null)
    setMemberForm({
      ...EMPTY_MEMBER,
      parkingTypeId: memberTypes.find((type) => type.isActive)?.id ?? memberTypes[0]?.id ?? '',
    })
    setMemberOpen(true)
    setError('')
  }

  function openEditMember(member: FtpMember) {
    setEditingMember(member.id)
    setMemberForm(memberFormFrom(member))
    setMemberOpen(true)
    setError('')
  }

  async function saveMember() {
    setBusy('member-save')
    setMessage('')
    setError('')
    try {
      const res = await fetch(
        editingMember
          ? `/api/admin/parking/ftp/test-members/${editingMember}?venueId=${encodeURIComponent(venueId)}`
          : '/api/admin/parking/ftp/test-members',
        {
          method: editingMember ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ venueId, ...memberForm }),
        },
      )
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(payload.error || 'SAVE FAILED')
        return
      }
      flash(editingMember ? 'TEST MEMBER SAVED' : 'TEST MEMBER CREATED')
      setMemberOpen(false)
      await loadMembers()
    } catch {
      setError('SAVE FAILED')
    } finally {
      setBusy('')
    }
  }

  async function deleteMember(member: FtpMember) {
    if (!window.confirm(`DELETE TEST MEMBER ${member.membershipNumber}?`)) return
    setBusy(member.id)
    try {
      const res = await fetch(
        `/api/admin/parking/ftp/test-members/${member.id}?venueId=${encodeURIComponent(venueId)}`,
        { method: 'DELETE' },
      )
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        setError(payload.error || 'DELETE FAILED')
        return
      }
      flash('TEST MEMBER DELETED')
      await loadMembers()
    } catch {
      setError('DELETE FAILED')
    } finally {
      setBusy('')
    }
  }

  async function removePlate(member: FtpMember, plateId: string, plate: string) {
    if (!window.confirm(`REMOVE PLATE ${plate} FROM ${member.membershipNumber}?`)) return
    setBusy(plateId)
    try {
      const res = await fetch(
        `/api/admin/parking/ftp/test-members/${member.id}/plates/${plateId}?venueId=${encodeURIComponent(venueId)}`,
        { method: 'DELETE' },
      )
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        setError(payload.error || 'COULD NOT REMOVE THE PLATE')
        return
      }
      flash('PLATE REMOVED')
      await loadMembers()
    } catch {
      setError('COULD NOT REMOVE THE PLATE')
    } finally {
      setBusy('')
    }
  }

  // ----- plate log -----

  async function saveNote(claim: FtpClaim) {
    const note = noteDraft[claim.id] ?? ''
    setBusy(`${claim.id}-note`)
    try {
      const res = await fetch(
        `/api/admin/parking/ftp/claims/${claim.id}?venueId=${encodeURIComponent(venueId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note }),
        },
      )
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        setError(payload.error || 'COULD NOT SAVE THE NOTE')
        return
      }
      flash('NOTE SAVED')
    } catch {
      setError('COULD NOT SAVE THE NOTE')
    } finally {
      setBusy('')
    }
  }

  function applyFilters() {
    setApplied(filters)
    setFilterNonce((value) => value + 1)
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((current) => {
      if (current.size === claims.length) return new Set()
      return new Set(claims.map((claim) => claim.id))
    })
  }

  function downloadEvidence() {
    const ids =
      selected.size > 0
        ? [...selected]
        : claims.filter((claim) => claim.evidencePdfPath).map((claim) => claim.id)
    if (ids.length === 0) {
      setError('NO EVIDENCE PDFS IN THIS SELECTION')
      return
    }
    window.open(
      `/api/admin/parking/ftp/claims/evidence-pack?ids=${encodeURIComponent(
        ids.slice(0, 100).join(','),
      )}&venueId=${encodeURIComponent(venueId)}`,
      '_blank',
    )
  }

  // ----- health -----

  async function runHealth(typeId: string | null, mode: 'BROWSER' | 'FULL') {
    if (mode === 'FULL' && !window.confirm('FULL CHECK USES ONE REAL PARKING SLOT. CONTINUE?')) {
      return
    }
    setBusy(`health-${typeId ?? 'all'}-${mode}`)
    setMessage('')
    setError('')
    try {
      const res = await fetch('/api/admin/parking/ftp/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venueId,
          ...(typeId ? { typeId } : {}),
          mode,
          confirm: mode === 'FULL' ? true : undefined,
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(payload.error || 'CHECK FAILED')
        return
      }
      const results = (payload.results ?? []) as { typeName: string; ok: boolean; message: string }[]
      flash(
        results.length
          ? results.map((result) => `${result.typeName}: ${result.ok ? 'OK' : result.message}`).join(' · ')
          : 'CHECK COMPLETE',
      )
      await loadTypes()
    } catch {
      setError('CHECK FAILED')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="space-y-3" id="ftp-four-hour-panel">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['types', `PARKING TYPES (${types.length})`],
            ['members', `TEST MEMBERS (${members.length})`],
            ['log', `PLATE LOG (${claimTotal})`],
            ['health', 'HEALTH'],
          ] as [PanelTab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`border px-3 py-1.5 font-mono text-2xs uppercase tracking-wider ${
              tab === id
                ? 'border-white bg-white text-black'
                : 'border-grey-mid text-grey-light'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : tab === 'types' ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="font-mono text-xs text-grey-light">
              THE MEMBERSHIP NUMBER (OR OPTIONAL ADMIN PIN) SELECTS THE TYPE. EACH TYPE HAS ITS OWN
              VPERMIT CLAIM URL AND PLATE LOG.
            </p>
            <Button size="sm" onClick={openNewType}>
              + ADD PARKING TYPE
            </Button>
          </div>

          {typeOpen && (
            <div className="border border-grey-mid p-4 space-y-3">
              <h3 className="font-mono text-xs uppercase tracking-wider text-grey-light">
                {editingType ? 'EDIT PARKING TYPE' : 'NEW PARKING TYPE'}
              </h3>
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  label="Name"
                  value={typeForm.name}
                  onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
                  placeholder="RAYC"
                />
                <Input
                  label="Window label (optional)"
                  value={typeForm.windowLabel}
                  onChange={(e) => setTypeForm({ ...typeForm, windowLabel: e.target.value })}
                  placeholder="4 HOURS"
                />
                <Input
                  label="Duration (minutes)"
                  type="number"
                  min="15"
                  max="1440"
                  value={typeForm.durationMinutes}
                  onChange={(e) => setTypeForm({ ...typeForm, durationMinutes: e.target.value })}
                />
                <Input
                  label="vPermit claim URL"
                  value={typeForm.claimUrl}
                  onChange={(e) => setTypeForm({ ...typeForm, claimUrl: e.target.value })}
                  placeholder="https://vpermit.com.au/tld/ClaimableEvents/Claim?code=…"
                />
                <Input
                  label="Contact name"
                  value={typeForm.contactName}
                  onChange={(e) => setTypeForm({ ...typeForm, contactName: e.target.value })}
                />
                <Input
                  label="Contact email"
                  type="email"
                  value={typeForm.contactEmail}
                  onChange={(e) => setTypeForm({ ...typeForm, contactEmail: e.target.value })}
                />
                <Input
                  label="Contact phone"
                  value={typeForm.contactPhone}
                  onChange={(e) => setTypeForm({ ...typeForm, contactPhone: e.target.value })}
                />
                <Input
                  label="Health check plate"
                  value={typeForm.healthPlate}
                  onChange={(e) => setTypeForm({ ...typeForm, healthPlate: e.target.value })}
                />
                <Select
                  label="Health check"
                  value={typeForm.healthCheckMode}
                  onChange={(e) => setTypeForm({ ...typeForm, healthCheckMode: e.target.value })}
                  options={[
                    { value: 'BROWSER', label: 'BROWSER (NO SLOT)' },
                    { value: 'FULL', label: 'FULL (USES A SLOT)' },
                    { value: 'OFF', label: 'OFF' },
                  ]}
                />
                <Input
                  label="Sort order"
                  type="number"
                  value={typeForm.sortOrder}
                  onChange={(e) => setTypeForm({ ...typeForm, sortOrder: e.target.value })}
                />
                <Input
                  label={
                    editingType
                      ? 'Admin PIN (leave blank to keep the current PIN)'
                      : 'Admin PIN (optional, 4–8 digits)'
                  }
                  value={typeForm.adminPin}
                  onChange={(e) => setTypeForm({ ...typeForm, adminPin: e.target.value })}
                  placeholder="4–8 DIGITS"
                />
              </div>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={typeForm.logPlates}
                    onChange={(e) => setTypeForm({ ...typeForm, logPlates: e.target.checked })}
                    className="h-4 w-4 accent-white"
                  />
                  <span className="font-mono text-xs uppercase text-white">LOG PLATES</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={typeForm.adminPinEnabled}
                    onChange={(e) =>
                      setTypeForm({ ...typeForm, adminPinEnabled: e.target.checked })
                    }
                    className="h-4 w-4 accent-white"
                  />
                  <span className="font-mono text-xs uppercase text-white">
                    ALLOW ADMIN PIN
                  </span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={typeForm.isActive}
                    onChange={(e) => setTypeForm({ ...typeForm, isActive: e.target.checked })}
                    className="h-4 w-4 accent-white"
                  />
                  <span className="font-mono text-xs uppercase text-white">ACTIVE</span>
                </label>
              </div>
              {typeForm.adminPinEnabled && !typeForm.adminPin && !editingType && (
                <p className="font-mono text-2xs uppercase text-warning">
                  TYPE AN ADMIN PIN TO ENABLE IT.
                </p>
              )}
              {typeForm.adminPinEnabled && !typeForm.adminPin && editingType && (
                <p className="font-mono text-2xs uppercase text-grey-light">
                  LEAVE BLANK TO KEEP THE CURRENT PIN.
                </p>
              )}
              <div className="flex flex-wrap gap-2 border-t border-grey-mid pt-3">
                <Button size="sm" onClick={() => void saveType()} loading={busy === 'type-save'}>
                  SAVE TYPE
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setTypeOpen(false)
                    setError('')
                  }}
                >
                  CANCEL
                </Button>
              </div>
            </div>
          )}

          {newPin && (
            <div className="border border-success/50 bg-success/5 p-3 space-y-1">
              <p className="font-mono text-xs font-bold uppercase text-success">
                NEW ADMIN PIN — SHOWN ONCE
              </p>
              <p className="font-mono text-2xl tracking-[0.3em] text-white">{newPin.pin}</p>
              <p className="font-mono text-2xs uppercase text-grey-light">WRITE IT DOWN.</p>
            </div>
          )}

          <div className="space-y-2">
            {types.length === 0 ? (
              <p className="font-mono text-xs text-grey-light">
                NO PARKING TYPES YET. ADD ONE TO SHOW THE 4 HOUR TAB.
              </p>
            ) : (
              types.map((type) => (
                <div key={type.id} className="border border-grey-mid p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-sm text-white">
                        {type.name}
                        {type.windowLabel ? ` · ${type.windowLabel}` : ''}
                      </p>
                      <p className="font-mono text-2xs uppercase text-grey-light">
                        {type.memberCount} MEMBERS · {type.claimCount} CLAIMS ·{' '}
                        {type.logPlates ? 'PLATES LOGGED' : 'PLATES NOT LOGGED'}
                      </p>
                      <p className="font-mono text-2xs uppercase text-grey-light">
                        {type.claimUrl ?? 'NO CLAIM URL'}
                      </p>
                    </div>
                    <div className="shrink-0 text-right space-y-1">
                      <span
                        className={`inline-block border px-2 py-0.5 font-mono text-2xs uppercase ${
                          !type.isActive
                            ? 'border-grey-mid text-grey-light'
                            : type.lastCheckOk === false
                              ? 'border-danger/40 text-danger'
                              : 'border-success/40 text-success'
                        }`}
                      >
                        {!type.isActive
                          ? 'INACTIVE'
                          : type.lastCheckAt
                            ? type.lastCheckOk
                              ? 'HEALTH OK'
                              : 'HEALTH FAILED'
                            : 'NOT CHECKED'}
                      </span>
                      <p className="font-mono text-2xs uppercase text-grey-light">
                        {type.adminPinSet
                          ? `ADMIN PIN ${type.adminPinHint ? `••${type.adminPinHint}` : 'SET'}`
                          : 'NO ADMIN PIN'}
                      </p>
                    </div>
                  </div>
                  {type.lastCheckMessage && (
                    <p className="font-mono text-2xs uppercase text-grey-light">
                      LAST CHECK: {type.lastCheckMessage}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="ghost" onClick={() => openEditType(type)}>
                      EDIT
                    </Button>
                    {role === 'ADMIN' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void rotatePin(type)}
                        loading={busy === `${type.id}-pin`}
                      >
                        {type.adminPinSet ? 'ROTATE ADMIN PIN' : 'SET ADMIN PIN'}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void runHealth(type.id, 'BROWSER')}
                      loading={busy === `health-${type.id}-BROWSER`}
                    >
                      CHECK NOW
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => void deleteType(type)}>
                      DELETE
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : tab === 'members' ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="font-mono text-xs text-grey-light">
              TEST DATA — THE FULL MEMBERS AREA WILL USE THESE SAME RECORDS. PLATES ARE ADDED BY THE
              KIOSK ON THE FIRST CONFIRMED CLAIM.
            </p>
            <Button size="sm" onClick={openNewMember} disabled={memberTypes.length === 0}>
              + ADD TEST MEMBER
            </Button>
          </div>

          {memberOpen && (
            <div className="border border-grey-mid p-4 space-y-3">
              <h3 className="font-mono text-xs uppercase tracking-wider text-grey-light">
                {editingMember ? 'EDIT TEST MEMBER' : 'NEW TEST MEMBER'}
              </h3>
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  label="Membership number (4–12 digits)"
                  value={memberForm.membershipNumber}
                  onChange={(e) => setMemberForm({ ...memberForm, membershipNumber: e.target.value })}
                />
                <Select
                  label="Parking type"
                  value={memberForm.parkingTypeId}
                  onChange={(e) => setMemberForm({ ...memberForm, parkingTypeId: e.target.value })}
                  options={memberTypes.map((type) => ({
                    value: type.id,
                    label: `${type.name}${type.isActive ? '' : ' (INACTIVE)'}`,
                  }))}
                />
                <Input
                  label="First name"
                  value={memberForm.firstName}
                  onChange={(e) => setMemberForm({ ...memberForm, firstName: e.target.value })}
                />
                <Input
                  label="Last name"
                  value={memberForm.lastName}
                  onChange={(e) => setMemberForm({ ...memberForm, lastName: e.target.value })}
                />
                <Input
                  label="Email"
                  type="email"
                  value={memberForm.email}
                  onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })}
                />
                <Input
                  label="Phone"
                  value={memberForm.phone}
                  onChange={(e) => setMemberForm({ ...memberForm, phone: e.target.value })}
                />
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={memberForm.isActive}
                  onChange={(e) => setMemberForm({ ...memberForm, isActive: e.target.checked })}
                  className="h-4 w-4 accent-white"
                />
                <span className="font-mono text-xs uppercase text-white">ACTIVE</span>
              </label>
              <div className="flex flex-wrap gap-2 border-t border-grey-mid pt-3">
                <Button size="sm" onClick={() => void saveMember()} loading={busy === 'member-save'}>
                  SAVE MEMBER
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setMemberOpen(false)}>
                  CANCEL
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {members.length === 0 ? (
              <p className="font-mono text-xs text-grey-light">
                NO TEST MEMBERS. ADD ONE TO TEST THE MEMBERSHIP-NUMBER KIOSK FLOW.
              </p>
            ) : (
              members.map((member) => (
                <div key={member.id} className="border border-grey-mid p-3 space-y-2">
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
                    <span
                      className={`shrink-0 border px-2 py-0.5 font-mono text-2xs uppercase ${
                        member.isActive
                          ? 'border-success/40 text-success'
                          : 'border-grey-mid text-grey-light'
                      }`}
                    >
                      {member.isActive ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {member.plates.length === 0 ? (
                      <span className="font-mono text-2xs uppercase text-grey-light">
                        NO PLATES YET — THE KIOSK WILL ADD ONE
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
                    <Button size="sm" variant="ghost" onClick={() => openEditMember(member)}>
                      EDIT
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => void deleteMember(member)}>
                      DELETE
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : tab === 'log' ? (
        <div className="space-y-3">
          <div className="grid gap-2 md:grid-cols-6">
            <Select
              label="Type"
              value={filters.typeId}
              onChange={(e) => setFilters({ ...filters, typeId: e.target.value })}
              options={[{ value: '', label: 'ALL TYPES' }, ...types.map((type) => ({ value: type.id, label: type.name }))]}
            />
            <Select
              label="Status"
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              options={[
                { value: '', label: 'ALL STATUSES' },
                { value: 'CONFIRMED', label: 'CONFIRMED' },
                { value: 'ALREADY_CLAIMED', label: 'ALREADY CLAIMED' },
                { value: 'FAILED', label: 'FAILED' },
                { value: 'CAPTCHA_BLOCKED', label: 'BLOCKED' },
                { value: 'EXHAUSTED', label: 'NO SLOTS' },
                { value: 'MANUAL_CONFIRMED', label: 'MANUAL CONFIRMED' },
                { value: 'MANUAL_UNCONFIRMED', label: 'MANUAL NOT CONFIRMED' },
              ]}
            />
            <Input
              label="From"
              type="date"
              value={filters.from}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            />
            <Input
              label="To"
              type="date"
              value={filters.to}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            />
            <Input
              label="Plate"
              value={filters.plate}
              onChange={(e) => setFilters({ ...filters, plate: e.target.value })}
            />
            <div className="flex items-end">
              <Button size="sm" onClick={applyFilters} className="w-full">
                APPLY
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-grey-mid pt-3">
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                window.open(`/api/admin/parking/ftp/claims/export?${claimQuery}`, '_blank')
              }
            >
              ⬇ CSV
            </Button>
            <Button size="sm" variant="ghost" onClick={downloadEvidence}>
              ⬇ EVIDENCE PACK (PDF)
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void loadClaims()}>
              ↻ RELOAD
            </Button>
            <span className="font-mono text-2xs uppercase text-grey-light self-center">
              {claimTotal} ROWS · SELECTED {selected.size}
            </span>
          </div>

          {claims.length === 0 ? (
            <p className="font-mono text-xs text-grey-light">
              NO CLAIMS MATCH THESE FILTERS.
            </p>
          ) : (
            <div className="overflow-x-auto border border-grey-mid">
              <table className="w-full text-left">
                <thead className="bg-grey-dark/40">
                  <tr className="font-mono text-2xs uppercase tracking-wider text-grey-light">
                    <th className="p-2">
                      <input
                        type="checkbox"
                        checked={selected.size === claims.length && claims.length > 0}
                        onChange={toggleAll}
                        className="h-4 w-4 accent-white"
                        aria-label="Select all claims"
                      />
                    </th>
                    <th className="p-2">CLAIMED</th>
                    <th className="p-2">PLATE</th>
                    <th className="p-2">TYPE</th>
                    <th className="p-2">MEMBER / PIN</th>
                    <th className="p-2">STATUS</th>
                    <th className="p-2">VALIDITY</th>
                    <th className="p-2">EVIDENCE</th>
                    <th className="p-2">NOTE</th>
                  </tr>
                </thead>
                <tbody>
                  {claims.map((claim) => (
                    <tr key={claim.id} className="border-t border-grey-mid align-top">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={selected.has(claim.id)}
                          onChange={() => toggleSelected(claim.id)}
                          className="h-4 w-4 accent-white"
                          aria-label={`Select claim ${claim.id}`}
                        />
                      </td>
                      <td className="p-2 font-mono text-2xs uppercase text-grey-light">
                        {formatDateTime(claim.createdAt, timezone)}
                      </td>
                      <td className="p-2 font-mono text-xs text-white">{claim.licensePlate ?? '—'}</td>
                      <td className="p-2 font-mono text-2xs uppercase text-grey-light">
                        {claim.typeName}
                      </td>
                      <td className="p-2 font-mono text-2xs uppercase text-grey-light">
                        {claim.credentialKind === 'ADMIN_PIN'
                          ? 'ADMIN PIN'
                          : claim.membershipNumber ?? 'MEMBER'}
                        {claim.contactName ? ` · ${claim.contactName}` : ''}
                      </td>
                      <td className="p-2">
                        <span
                          className={`inline-block border px-2 py-0.5 font-mono text-2xs uppercase ${toneClass(
                            claim.status,
                          )}`}
                        >
                          {describeClaimStatus(claim.status)}
                        </span>
                      </td>
                      <td className="p-2 font-mono text-2xs uppercase text-grey-light">
                        {claim.validFrom || claim.validUntil
                          ? `${claim.validFrom ?? '—'} → ${claim.validUntil ?? '—'}`
                          : '—'}
                      </td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-2">
                          {claim.evidencePdfPath && (
                            <a
                              href={`/api/admin/parking/ftp/claims/${claim.id}/evidence?format=pdf&venueId=${encodeURIComponent(venueId)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-2xs uppercase text-white underline"
                            >
                              PDF
                            </a>
                          )}
                          {claim.evidenceImagePath && (
                            <a
                              href={`/api/admin/parking/ftp/claims/${claim.id}/evidence?format=png&venueId=${encodeURIComponent(venueId)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-2xs uppercase text-white underline"
                            >
                              IMG
                            </a>
                          )}
                          {!claim.evidencePdfPath && !claim.evidenceImagePath && (
                            <span className="font-mono text-2xs uppercase text-grey-light">—</span>
                          )}
                        </div>
                      </td>
                      <td className="p-2">
                        <div className="flex gap-1">
                          <input
                            value={noteDraft[claim.id] ?? ''}
                            onChange={(e) =>
                              setNoteDraft((current) => ({
                                ...current,
                                [claim.id]: e.target.value,
                              }))
                            }
                            className="w-40 border border-grey-mid bg-black px-2 py-1 font-mono text-2xs text-white outline-none focus:border-white"
                            placeholder="NOTE"
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void saveNote(claim)}
                            loading={busy === `${claim.id}-note`}
                          >
                            SAVE
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="font-mono text-xs text-grey-light">
            BROWSER CHECKS LOAD THE CLAIM PAGE (NO SLOT). FULL CHECKS SUBMIT A REAL TEST CLAIM AND
            USE ONE SLOT.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void runHealth(null, 'BROWSER')}
              loading={busy === 'health-all-BROWSER'}
            >
              CHECK ALL (BROWSER)
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => void runHealth(null, 'FULL')}
              loading={busy === 'health-all-FULL'}
            >
              CHECK ALL (FULL — USES SLOTS)
            </Button>
          </div>
          <div className="space-y-2">
            {types.map((type) => (
              <div key={type.id} className="border border-grey-mid p-3 space-y-1">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm text-white">{type.name}</p>
                    <p className="font-mono text-2xs uppercase text-grey-light">
                      {type.lastCheckAt
                        ? `LAST CHECK ${formatDateTime(type.lastCheckAt, timezone)}`
                        : 'NEVER CHECKED'}
                      {type.lastCheckMessage ? ` · ${type.lastCheckMessage}` : ''}
                    </p>
                  </div>
                  <span
                    className={`border px-2 py-0.5 font-mono text-2xs uppercase ${
                      type.lastCheckOk === true
                        ? 'border-success/40 text-success'
                        : type.lastCheckOk === false
                          ? 'border-danger/40 text-danger'
                          : 'border-grey-mid text-grey-light'
                    }`}
                  >
                    {type.lastCheckOk === true ? 'OK' : type.lastCheckOk === false ? 'FAILED' : 'UNKNOWN'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void runHealth(type.id, 'BROWSER')}
                    loading={busy === `health-${type.id}-BROWSER`}
                  >
                    BROWSER CHECK
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => void runHealth(type.id, 'FULL')}
                    loading={busy === `health-${type.id}-FULL`}
                  >
                    FULL CHECK (USES A SLOT)
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(message || error) && (
        <div className="border-t border-grey-mid pt-2">
          {message && <p className="font-mono text-xs text-success">{message}</p>}
          {error && <p className="font-mono text-xs text-danger">{error}</p>}
        </div>
      )}
    </div>
  )
}
