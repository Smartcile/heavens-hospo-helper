'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { StaffTrainingModal } from '@/components/admin/StaffTrainingModal'

interface StaffMember {
  id: string
  firstName: string
  lastName: string
  email: string | null
  role: string
  venueId: string
  departmentId: string | null
  isActive: boolean
  profilePhotoUrl: string | null
  swiftPosId: string | null
  myHrId: string | null
  loadedReportsId: string | null
  venue: { id: string; name: string }
  department: { id: string; name: string } | null
  sections: { sectionId: string }[]
}

interface Venue { id: string; name: string }
interface Department { id: string; name: string; venueId: string }
interface Section { id: string; name: string; venueId: string; departmentId: string }

interface FormState {
  firstName: string
  lastName: string
  pin: string
  email: string
  password: string
  role: string
  venueId: string
  departmentId: string
  swiftPosId: string
  myHrId: string
  loadedReportsId: string
  sectionIds: string[]
}

const EMPTY_FORM: FormState = {
  firstName: '',
  lastName: '',
  pin: '',
  email: '',
  password: '',
  role: 'STAFF',
  venueId: '',
  departmentId: '',
  swiftPosId: '',
  myHrId: '',
  loadedReportsId: '',
  sectionIds: [],
}

const ROLE_OPTIONS = [
  { value: 'STAFF', label: 'STAFF' },
  { value: 'MANAGER', label: 'MANAGER' },
  { value: 'ADMIN', label: 'ADMIN' },
]

export function StaffClient({ role, sessionVenueId }: { role: string; sessionVenueId: string }) {
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [trainingFor, setTrainingFor] = useState<StaffMember | null>(null)
  const [editing, setEditing] = useState<StaffMember | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isAdmin = role === 'ADMIN'

  async function load() {
    const [sR, vR, dR, secR] = await Promise.all([
      fetch('/api/admin/staff'),
      fetch('/api/admin/venues'),
      fetch('/api/admin/departments'),
      fetch('/api/admin/sections'),
    ])
    const [staffData, venueData, deptData, sectionData] = await Promise.all([sR.json(), vR.json(), dR.json(), secR.json()])
    setStaff(staffData)
    setVenues(venueData)
    setDepartments(deptData)
    setSections(sectionData)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY_FORM, venueId: isAdmin ? '' : sessionVenueId })
    setError('')
    setModalOpen(true)
  }

  function openEdit(s: StaffMember) {
    setEditing(s)
    setForm({
      firstName: s.firstName,
      lastName: s.lastName,
      pin: '',
      email: s.email ?? '',
      password: '',
      role: s.role,
      venueId: s.venueId,
      departmentId: s.departmentId ?? '',
      swiftPosId: s.swiftPosId ?? '',
      myHrId: s.myHrId ?? '',
      loadedReportsId: s.loadedReportsId ?? '',
      sectionIds: (s.sections ?? []).map((x) => x.sectionId),
    })
    setError('')
    setModalOpen(true)
  }

  async function handleSave() {
    const isWebUser = form.role === 'ADMIN' || form.role === 'MANAGER'

    if (!form.firstName.trim() || !form.lastName.trim() || !form.venueId) {
      setError('FIRST NAME, LAST NAME AND VENUE ARE REQUIRED')
      return
    }
    if (isWebUser) {
      if (!form.email.trim()) {
        setError('EMAIL IS REQUIRED FOR ADMIN / MANAGER')
        return
      }
      if (!editing && form.password.length < 8) {
        setError('PASSWORD (MIN 8 CHARS) IS REQUIRED FOR ADMIN / MANAGER')
        return
      }
      if (form.password && form.password.length < 8) {
        setError('PASSWORD MUST BE AT LEAST 8 CHARACTERS')
        return
      }
    } else if (!editing && !form.pin) {
      setError('PIN IS REQUIRED FOR FLOOR STAFF')
      return
    }
    if (form.pin && !/^\d{2,4}$/.test(form.pin)) {
      setError('PIN MUST BE 2-4 DIGITS')
      return
    }

    setSaving(true)
    setError('')

    const url = editing ? `/api/admin/staff/${editing.id}` : '/api/admin/staff'
    const method = editing ? 'PUT' : 'POST'
    const body: Record<string, unknown> = {
      firstName: form.firstName,
      lastName: form.lastName,
      venueId: form.venueId,
      departmentId: form.departmentId || null,
      email: form.email || null,
      swiftPosId: form.swiftPosId || null,
      myHrId: form.myHrId || null,
      loadedReportsId: form.loadedReportsId || null,
      sectionIds: form.sectionIds,
    }
    if (form.pin) body.pin = form.pin
    if (form.password) body.password = form.password
    if (!editing) body.role = form.role
    if (isAdmin) body.role = form.role

    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!r.ok) {
      const data = await r.json()
      setError(data.error ?? 'SAVE FAILED')
      setSaving(false)
      return
    }

    setSaving(false)
    setModalOpen(false)
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm('SOFT-DELETE THIS STAFF MEMBER?')) return
    await fetch(`/api/admin/staff/${id}`, { method: 'DELETE' })
    load()
  }

  async function toggleActive(s: StaffMember) {
    await fetch(`/api/admin/staff/${s.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !s.isActive }),
    })
    load()
  }

  const venueOptions = venues.map((v) => ({ value: v.id, label: v.name }))
  const deptOptions = [
    { value: '', label: 'NO DEPARTMENT' },
    ...departments
      .filter((d) => d.venueId === form.venueId)
      .map((d) => ({ value: d.id, label: d.name })),
  ]
  const formSections = sections.filter((s) => s.venueId === form.venueId)
  const isWebUser = form.role === 'ADMIN' || form.role === 'MANAGER'

  function toggleSection(id: string) {
    setForm((f) => ({
      ...f,
      sectionIds: f.sectionIds.includes(id) ? f.sectionIds.filter((x) => x !== id) : [...f.sectionIds, id],
    }))
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-xl font-bold uppercase tracking-widest">STAFF</h1>
        <Button onClick={openCreate} size="sm">+ NEW STAFF</Button>
      </div>

      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border border-grey-mid">
            <thead>
              <tr className="border-b border-grey-mid">
                {['NAME', 'ROLE', 'VENUE', 'DEPARTMENT', 'STATUS', 'ACTIONS'].map((h) => (
                  <th key={h} className="px-4 py-2 font-mono text-xs uppercase text-grey-light text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-grey-mid">
              {staff.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-4 font-mono text-xs text-grey-light">
                    NO STAFF FOUND.
                  </td>
                </tr>
              ) : (
                staff.map((s) => (
                  <tr key={s.id} className="hover:bg-black/20 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold text-white uppercase">
                      {s.lastName}, {s.firstName}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={s.role === 'ADMIN' ? 'warning' : s.role === 'MANAGER' ? 'default' : 'default'}>
                        {s.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-grey-light">{s.venue.name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-grey-light">{s.department?.name ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={s.isActive ? 'success' : 'danger'}>
                        {s.isActive ? 'ACTIVE' : 'INACTIVE'}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-3">
                        <button onClick={() => setTrainingFor(s)} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">
                          TRAINING
                        </button>
                        <button onClick={() => toggleActive(s)} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">
                          {s.isActive ? 'DEACTIVATE' : 'ACTIVATE'}
                        </button>
                        <button onClick={() => openEdit(s)} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">
                          EDIT
                        </button>
                        <button onClick={() => handleDelete(s.id)} className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors">
                          DELETE
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'EDIT STAFF' : 'NEW STAFF'} size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="First Name"
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              placeholder="JANE"
            />
            <Input
              label="Last Name"
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              placeholder="SMITH"
            />
          </div>

          {isAdmin && (
            <Select
              label="Role"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              options={ROLE_OPTIONS}
            />
          )}
          {(isAdmin || !editing) && (
            <Select
              label="Venue"
              value={form.venueId}
              onChange={(e) => setForm({ ...form, venueId: e.target.value, departmentId: '' })}
              options={venueOptions}
              placeholder="SELECT VENUE"
            />
          )}
          <Select
            label="Department"
            value={form.departmentId}
            onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
            options={deptOptions}
          />

          {formSections.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="font-mono text-xs uppercase text-grey-light tracking-wider">Sections worked (optional)</label>
              <div className="flex flex-wrap gap-1">
                {formSections.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSection(s.id)}
                    className={`font-mono text-xs px-2 py-1.5 border transition-colors ${
                      form.sectionIds.includes(s.id)
                        ? 'bg-white text-black border-white'
                        : 'bg-transparent text-grey-light border-grey-mid hover:border-white hover:text-white'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Web login (admins/managers) */}
          {isWebUser && (
            <div className="border-l-4 border-l-grey-mid pl-3 space-y-3">
              <p className="font-mono text-xs uppercase tracking-wider text-grey-light">WEB LOGIN</p>
              <Input
                label="Email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="name@venue.com"
                autoComplete="off"
              />
              <Input
                label={editing ? 'New Password (leave blank to keep)' : 'Password (min 8 chars)'}
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>
          )}

          {/* Worker PIN (floor login via QR + numpad) */}
          <Input
            label={
              isWebUser
                ? editing
                  ? 'Floor PIN — optional (leave blank to keep)'
                  : 'Floor PIN — optional (2-4 digits)'
                : editing
                  ? 'New PIN (leave blank to keep)'
                  : 'PIN (2-4 digits)'
            }
            type="password"
            value={form.pin}
            onChange={(e) => setForm({ ...form, pin: e.target.value })}
            placeholder="••••"
            maxLength={4}
            pattern="\d{2,4}"
          />

          {/* One profile, linked across systems */}
          <div className="border-l-4 border-l-grey-mid pl-3 space-y-3">
            <div>
              <p className="font-mono text-xs uppercase tracking-wider text-grey-light">STAFF SYNC IDS</p>
              <p className="font-mono text-xs text-grey-light mt-0.5">
                LINK THIS PROFILE ACROSS SYSTEMS. AUTO-SYNC COMING SOON — SET MANUALLY FOR NOW.
              </p>
            </div>
            <Input
              label="SwiftPOS ID"
              value={form.swiftPosId}
              onChange={(e) => setForm({ ...form, swiftPosId: e.target.value })}
              placeholder="SWIFTPOS STAFF ID"
            />
            <Input
              label="MyHR ID"
              value={form.myHrId}
              onChange={(e) => setForm({ ...form, myHrId: e.target.value })}
              placeholder="MYHR ID"
            />
            <Input
              label="LoadedReports ID"
              value={form.loadedReportsId}
              onChange={(e) => setForm({ ...form, loadedReportsId: e.target.value })}
              placeholder="LOADEDREPORTS ID"
            />
          </div>

          {error && <p className="font-mono text-xs text-danger">{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} loading={saving}>SAVE</Button>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>CANCEL</Button>
          </div>
        </div>
      </Modal>

      {trainingFor && (
        <StaffTrainingModal
          staffId={trainingFor.id}
          staffName={`${trainingFor.firstName} ${trainingFor.lastName}`}
          onClose={() => setTrainingFor(null)}
        />
      )}
    </div>
  )
}
