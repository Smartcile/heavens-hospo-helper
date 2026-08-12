'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'

interface Department { id: string; name: string; venueId: string }
interface Section { id: string; name: string; venueId: string; departmentId: string }
interface Venue { id: string; name: string }

interface StaffData {
  id: string; firstName: string; lastName: string; email: string | null; role: string
  venueId: string; departmentId: string | null
  hourlyRate: number | null; employmentType: string | null
  taxCode: string | null; kiwiSaverRate: number | null; studentLoan: boolean
  swiftPosId: string | null; myHrId: string | null; loadedReportsId: string | null
  sections: { sectionId: string }[]
  positions?: { positionId: string }[]
  staffVenues: { venueId: string }[]
}

interface PositionOption { id: string; name: string; venueId: string }

const ROLE_OPTIONS = [
  { value: 'STAFF', label: 'STAFF' },
  { value: 'MANAGER', label: 'MANAGER' },
  { value: 'ADMIN', label: 'ADMIN' },
]

const TAX_CODE_OPTIONS = ['M', 'M SL', 'S', 'S SL', 'SB', 'SB SL', 'SH', 'SH SL', 'ST', 'ST SL', 'CAE', 'CAE SL'].map((c) => ({ value: c, label: c }))

const KIWISAVER_OPTIONS = [
  { value: '', label: 'NOT ENROLLED' },
  { value: '3', label: '3%' },
  { value: '4', label: '4%' },
  { value: '6', label: '6%' },
  { value: '8', label: '8%' },
  { value: '10', label: '10%' },
]

export function StaffEditModal({ staffId, role, onClose, onSaved }: { staffId: string; role: string; onClose: () => void; onSaved: () => void }) {
  const isAdmin = role === 'ADMIN'
  const [staff, setStaff] = useState<StaffData | null>(null)
  const [venues, setVenues] = useState<Venue[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [sectionIds, setSectionIds] = useState<string[]>([])
  const [allPositions, setAllPositions] = useState<PositionOption[]>([])
  const [positionIds, setPositionIds] = useState<string[]>([])
  const [venueIds, setVenueIds] = useState<string[]>([])
  const [pin, setPin] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([
      fetch(`/api/admin/staff/${staffId}`).then((r) => r.json()),
      fetch('/api/admin/venues').then((r) => r.json()),
      fetch('/api/admin/departments').then((r) => r.json()),
      fetch('/api/admin/sections').then((r) => r.json()),
      fetch('/api/admin/positions').then((r) => (r.ok ? r.json() : [])),
    ]).then(([s, v, d, sec, pos]) => {
      if (!active) return
      setStaff(s)
      setSectionIds((s.sections ?? []).map((x: { sectionId: string }) => x.sectionId))
      setPositionIds((s.positions ?? []).map((x: { positionId: string }) => x.positionId))
      setAllPositions(Array.isArray(pos) ? pos : [])
      setVenueIds((s.staffVenues ?? []).map((x: { venueId: string }) => x.venueId))
      setVenues(Array.isArray(v) ? v : [])
      setDepartments(Array.isArray(d) ? d : [])
      setSections(Array.isArray(sec) ? sec : [])
      setLoading(false)
    })
    return () => { active = false }
  }, [staffId])

  function patch(p: Partial<StaffData>) {
    setStaff((prev) => (prev ? { ...prev, ...p } : prev))
  }
  function toggleSection(id: string) {
    setSectionIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }
  function togglePosition(id: string) {
    setPositionIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }
  function toggleVenue(id: string) {
    setVenueIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const isWebUser = staff ? (staff.role === 'ADMIN' || staff.role === 'MANAGER') : false

  async function handleSave() {
    if (!staff) return
    if (!staff.firstName.trim() || !staff.lastName.trim()) { setError('FIRST AND LAST NAME ARE REQUIRED'); return }
    if (isWebUser && !(staff.email ?? '').trim()) { setError('EMAIL IS REQUIRED FOR ADMIN / MANAGER'); return }
    if (password && password.length < 8) { setError('PASSWORD MUST BE AT LEAST 8 CHARACTERS'); return }
    if (pin && !/^\d{2,4}$/.test(pin)) { setError('PIN MUST BE 2-4 DIGITS'); return }
    setSaving(true); setError('')
    const body: Record<string, unknown> = {
      firstName: staff.firstName, lastName: staff.lastName,
      email: staff.email || null, departmentId: staff.departmentId || null,
      hourlyRate: staff.hourlyRate, employmentType: staff.employmentType || null,
      taxCode: staff.taxCode || null, kiwiSaverRate: staff.kiwiSaverRate, studentLoan: staff.studentLoan,
      swiftPosId: staff.swiftPosId || null, myHrId: staff.myHrId || null, loadedReportsId: staff.loadedReportsId || null,
      sectionIds,
      positionIds,
      venueIds,
    }
    if (pin) body.pin = pin
    if (password) body.password = password
    if (isAdmin) { body.role = staff.role; body.venueId = staff.venueId }
    const r = await fetch(`/api/admin/staff/${staff.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setSaving(false)
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'SAVE FAILED'); return }
    onSaved()
  }

  const deptOptions = staff
    ? [{ value: '', label: 'NO DEPARTMENT' }, ...departments.filter((d) => d.venueId === staff.venueId).map((d) => ({ value: d.id, label: d.name }))]
    : []
  const formSections = staff ? sections.filter((s) => s.venueId === staff.venueId) : []
  const formPositions = staff ? allPositions.filter((p) => p.venueId === staff.venueId) : []

  return (
    <Modal isOpen onClose={onClose} title="EDIT STAFF" size="md">
      {loading || !staff ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="First Name" value={staff.firstName} onChange={(e) => patch({ firstName: e.target.value })} placeholder="JANE" />
            <Input label="Last Name" value={staff.lastName} onChange={(e) => patch({ lastName: e.target.value })} placeholder="SMITH" />
          </div>
          {isAdmin && (
            <Select label="Role" value={staff.role} onChange={(e) => patch({ role: e.target.value })} options={ROLE_OPTIONS} />
          )}
          {isAdmin && (
            <Select label="Venue" value={staff.venueId} onChange={(e) => patch({ venueId: e.target.value, departmentId: '' })} options={venues.map((v) => ({ value: v.id, label: v.name }))} placeholder="SELECT VENUE" />
          )}
          <Select label="Department" value={staff.departmentId ?? ''} onChange={(e) => patch({ departmentId: e.target.value })} options={deptOptions} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Hourly Rate ($)" type="number" min="0" step="0.01" value={staff.hourlyRate != null ? String(staff.hourlyRate) : ''} onChange={(e) => patch({ hourlyRate: e.target.value ? Number(e.target.value) : null })} placeholder="23.50" />
            <Select label="Employment Type" value={staff.employmentType ?? ''} onChange={(e) => patch({ employmentType: e.target.value })} options={[
              { value: '', label: 'NOT SET' },
              { value: 'FULL_TIME', label: 'FULL TIME' },
              { value: 'PART_TIME', label: 'PART TIME' },
              { value: 'CASUAL', label: 'CASUAL' },
            ]} />
          </div>

          <div className="border-l-4 border-l-grey-mid pl-3 space-y-3">
            <p className="font-mono text-xs uppercase tracking-wider text-grey-light">NZ PAYROLL</p>
            <div className="grid grid-cols-2 gap-3">
              <Select label="Tax Code" value={staff.taxCode ?? ''} onChange={(e) => patch({ taxCode: e.target.value || null })} options={[{ value: '', label: 'VENUE DEFAULT' }, ...TAX_CODE_OPTIONS]} />
              <Select label="KiwiSaver" value={staff.kiwiSaverRate != null ? String(staff.kiwiSaverRate) : ''} onChange={(e) => patch({ kiwiSaverRate: e.target.value ? Number(e.target.value) : null })} options={KIWISAVER_OPTIONS} />
            </div>
            <label className="flex items-center gap-2 font-mono text-xs uppercase text-grey-light cursor-pointer">
              <input type="checkbox" checked={staff.studentLoan} onChange={(e) => patch({ studentLoan: e.target.checked })} className="accent-white" />
              STUDENT LOAN (12% WITHHELD)
            </label>
          </div>

          {formSections.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="font-mono text-xs uppercase text-grey-light tracking-wider">Sections worked (optional)</label>
              <div className="flex flex-wrap gap-1">
                {formSections.map((s) => (
                  <button key={s.id} type="button" onClick={() => toggleSection(s.id)} className={`font-mono text-xs px-2 py-1.5 border transition-colors ${sectionIds.includes(s.id) ? 'bg-white text-black border-white' : 'bg-transparent text-grey-light border-grey-mid hover:border-white hover:text-white'}`}>{s.name}</button>
                ))}
              </div>
            </div>
          )}

          {formPositions.length > 0 && (
            <div className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <label className="font-mono text-xs uppercase text-grey-light tracking-wider">Positions held (optional)</label>
                <button
                  type="button"
                  onClick={() => setPositionIds(
                    positionIds.length === formPositions.length ? [] : formPositions.map((p) => p.id)
                  )}
                  className="font-mono text-[10px] uppercase text-grey-light hover:text-white transition-colors"
                >
                  {positionIds.length === formPositions.length ? 'CLEAR ALL' : 'SELECT ALL'}
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {formPositions.map((p) => (
                  <button key={p.id} type="button" onClick={() => togglePosition(p.id)} className={`font-mono text-xs px-2 py-1.5 border transition-colors ${positionIds.includes(p.id) ? 'bg-white text-black border-white' : 'bg-transparent text-grey-light border-grey-mid hover:border-white hover:text-white'}`}>{p.name}</button>
                ))}
              </div>
            </div>
          )}

          {/* Shared/extra venues — available venues other than home venue */}
          {venues.length > 1 && (
            <div className="flex flex-col gap-1">
              <label className="font-mono text-xs uppercase text-grey-light tracking-wider">SHARED VENUES (OPTIONAL)</label>
              <div className="flex flex-wrap gap-1">
                {venues.filter((v) => v.id !== staff.venueId).map((v) => (
                  <button key={v.id} type="button" onClick={() => toggleVenue(v.id)} className={`font-mono text-xs px-2 py-1.5 border transition-colors ${venueIds.includes(v.id) ? 'bg-white text-black border-white' : 'bg-transparent text-grey-light border-grey-mid hover:border-white hover:text-white'}`}>{v.name}</button>
                ))}
              </div>
            </div>
          )}

          {isWebUser && (
            <div className="border-l-4 border-l-grey-mid pl-3 space-y-3">
              <p className="font-mono text-xs uppercase tracking-wider text-grey-light">WEB LOGIN</p>
              <Input label="Email" type="email" value={staff.email ?? ''} onChange={(e) => patch({ email: e.target.value })} placeholder="name@venue.com" autoComplete="off" />
              <Input label="New Password (leave blank to keep)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
            </div>
          )}

          <Input label={isWebUser ? 'Floor PIN — optional (leave blank to keep)' : 'New PIN (leave blank to keep)'} type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••" maxLength={4} pattern="\d{2,4}" />

          <div className="border-l-4 border-l-grey-mid pl-3 space-y-3">
            <p className="font-mono text-xs uppercase tracking-wider text-grey-light">STAFF SYNC IDS</p>
            <Input label="SwiftPOS ID" value={staff.swiftPosId ?? ''} onChange={(e) => patch({ swiftPosId: e.target.value })} placeholder="SWIFTPOS STAFF ID" />
            <Input label="MyHR ID" value={staff.myHrId ?? ''} onChange={(e) => patch({ myHrId: e.target.value })} placeholder="MYHR ID" />
            <Input label="LoadedReports ID" value={staff.loadedReportsId ?? ''} onChange={(e) => patch({ loadedReportsId: e.target.value })} placeholder="LOADEDREPORTS ID" />
          </div>

          {error && <p className="font-mono text-xs text-danger">{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} loading={saving}>SAVE</Button>
            <Button variant="ghost" onClick={onClose}>CANCEL</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
