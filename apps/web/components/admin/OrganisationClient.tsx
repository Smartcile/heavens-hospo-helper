'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { getActiveVenueId } from '@/lib/active-venue'

const TIMEZONES = [
  { value: 'Pacific/Auckland', label: 'Pacific/Auckland (NZST)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (AEST)' },
  { value: 'Australia/Melbourne', label: 'Australia/Melbourne (AEDT)' },
  { value: 'Australia/Brisbane', label: 'Australia/Brisbane (AEST)' },
  { value: 'Australia/Perth', label: 'Australia/Perth (AWST)' },
  { value: 'UTC', label: 'UTC' },
]

interface DeptSection {
  id: string
  name: string
  colour: string | null
  isActive: boolean
}

interface Department {
  id: string
  name: string
  colour: string | null
  isActive: boolean
  sections: DeptSection[]
  linkedTo?: { toDepartment: { id: string; name: string; colour: string | null } }[]
}

interface Venue {
  id: string
  name: string
  address: string | null
  timezone: string
  isActive: boolean
  geoLat: number | null
  geoLon: number | null
  geoRadius: number | null
  departments: Department[]
}

const DEPT_COLOURS = [
  { value: '#F87171', label: 'RED' },
  { value: '#FB923C', label: 'ORANGE' },
  { value: '#FACC15', label: 'AMBER' },
  { value: '#A3E635', label: 'LIME' },
  { value: '#4ADE80', label: 'GREEN' },
  { value: '#34D399', label: 'EMERALD' },
  { value: '#2DD4BF', label: 'TEAL' },
  { value: '#22D3EE', label: 'CYAN' },
  { value: '#38BDF8', label: 'SKY' },
  { value: '#60A5FA', label: 'BLUE' },
  { value: '#818CF8', label: 'INDIGO' },
  { value: '#A78BFA', label: 'VIOLET' },
  { value: '#C084FC', label: 'PURPLE' },
  { value: '#E879F9', label: 'FUCHSIA' },
  { value: '#F472B6', label: 'PINK' },
  { value: '#FB7185', label: 'ROSE' },
  { value: '#78716C', label: 'BROWN' },
  { value: '#A3A3A3', label: 'SILVER' },
  { value: '#6B6B6B', label: 'GREY' },
  { value: '#F5F5F5', label: 'WHITE' },
]

function pickUnusedColour(usedHexes: Set<string>): string {
  const avail = DEPT_COLOURS.filter((c) => !usedHexes.has(c.value) && c.value !== '#6B6B6B')
  if (avail.length > 0) return avail[Math.floor(Math.random() * avail.length)].value
  const fallback = DEPT_COLOURS.find((c) => !usedHexes.has(c.value))
  return fallback ? fallback.value : DEPT_COLOURS[Math.floor(Math.random() * DEPT_COLOURS.length)].value
}

export function OrganisationClient({ role, sessionVenueId, defaultVenueId }: { role: string; sessionVenueId: string; defaultVenueId: string | null | undefined }) {
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedVenueId, setSelectedVenueId] = useState(() => getActiveVenueId(role, sessionVenueId, defaultVenueId))

  // Venue form
  const [venueModalOpen, setVenueModalOpen] = useState(false)
  const [venueEditing, setVenueEditing] = useState<Venue | null>(null)
  const [vName, setVName] = useState('')
  const [vAddress, setVAddress] = useState('')
  const [vTimezone, setVTimezone] = useState('Pacific/Auckland')
  const [vGeoLat, setVGeoLat] = useState('')
  const [vGeoLon, setVGeoLon] = useState('')
  const [vGeoRadius, setVGeoRadius] = useState('')
  const [vSaving, setVSaving] = useState(false)
  const [vError, setVError] = useState('')

  // Dept form
  const [deptModalOpen, setDeptModalOpen] = useState(false)
  const [deptEditing, setDeptEditing] = useState<Department | null>(null)
  const [dName, setDName] = useState('')
  const [dColour, setDColour] = useState('#6B6B6B')
  const [dSaving, setDSaving] = useState(false)
  const [dError, setDError] = useState('')
  const [dLinkedIds, setDLinkedIds] = useState<string[]>([])
  const [dLinkSearch, setDLinkSearch] = useState('')

  // Section form
  const [secModalOpen, setSecModalOpen] = useState(false)
  const [secEditing, setSecEditing] = useState<DeptSection | null>(null)
  const [secDeptId, setSecDeptId] = useState('')
  const [sName, setSName] = useState('')
  const [sColour, setSColour] = useState('#6B6B6B')
  const [sSaving, setSSaving] = useState(false)
  const [sError, setSError] = useState('')

  async function load() {
    const r = await fetch('/api/admin/venues')
    const data = await r.json()

    // Load departments and sections for each venue
    const [dR, sR] = await Promise.all([
      fetch('/api/admin/departments'),
      fetch('/api/admin/sections'),
    ])
    const [depts, sections] = await Promise.all([dR.json(), sR.json()])

    const venuesWithData = data.map((v: any) => ({
      ...v,
      departments: depts
        .filter((d: any) => d.venueId === v.id)
        .map((d: any) => ({
          id: d.id,
          name: d.name,
          colour: d.colour,
          isActive: d.isActive,
          linkedTo: d.linkedTo ?? [],
          sections: sections
            .filter((s: any) => s.departmentId === d.id)
            .map((s: any) => ({
              id: s.id,
              name: s.name,
              colour: s.colour,
              isActive: s.isActive,
            })),
        })),
    }))

    setVenues(venuesWithData)
    setLoading(false)

    // Re-check cookie after data loads — it may have been set by the sidebar after initial render
    const cookie = document.cookie
      .split('; ')
      .find((r) => r.startsWith('admin-active-venue='))
      ?.split('=')[1]
    const active = cookie || defaultVenueId || ''
    if (active && venuesWithData.some((v: Venue) => v.id === active)) {
      setSelectedVenueId(active)
    }
  }

  useEffect(() => { load() }, [])

  const selectedVenue = venues.find((v) => v.id === selectedVenueId)

  // ── Venue handlers ──

  function openVenueCreate() {
    setVenueEditing(null)
    setVName(''); setVAddress(''); setVTimezone('Pacific/Auckland')
    setVGeoLat(''); setVGeoLon(''); setVGeoRadius('')
    setVError(''); setVenueModalOpen(true)
  }

  function openVenueEdit(v: Venue) {
    setVenueEditing(v)
    setVName(v.name); setVAddress(v.address ?? ''); setVTimezone(v.timezone)
    setVGeoLat(v.geoLat != null ? String(v.geoLat) : '')
    setVGeoLon(v.geoLon != null ? String(v.geoLon) : '')
    setVGeoRadius(v.geoRadius != null ? String(v.geoRadius) : '')
    setVError(''); setVenueModalOpen(true)
  }

  async function handleVenueSave() {
    if (!vName.trim()) { setVError('NAME IS REQUIRED'); return }
    setVSaving(true); setVError('')

    const url = venueEditing ? `/api/admin/venues/${venueEditing.id}` : '/api/admin/venues'
    const method = venueEditing ? 'PUT' : 'POST'

    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: vName,
        address: vAddress || null,
        timezone: vTimezone,
        geoLat: vGeoLat ? Number(vGeoLat) : null,
        geoLon: vGeoLon ? Number(vGeoLon) : null,
        geoRadius: vGeoRadius ? Number(vGeoRadius) : null,
      }),
    })

    setVSaving(false)
    if (!r.ok) { const d = await r.json(); setVError(d.error ?? 'FAILED'); return }
    setVenueModalOpen(false); load()
  }

  async function handleVenueDelete(id: string) {
    if (!confirm('SOFT-DELETE THIS VENUE?')) return
    await fetch(`/api/admin/venues/${id}`, { method: 'DELETE' })
    if (selectedVenueId === id) setSelectedVenueId('')
    load()
  }

  // ── Dept handlers ──

  function openDeptCreate() {
    setDeptEditing(null)
    const usedHexes = new Set((venues.flatMap((v) => v.departments.map((d) => d.colour))).filter(Boolean) as string[])
    setDName(''); setDColour(pickUnusedColour(usedHexes))
    setDLinkedIds([]); setDLinkSearch('')
    setDError(''); setDeptModalOpen(true)
  }

  function openDeptEdit(d: Department) {
    setDeptEditing(d)
    setDName(d.name); setDColour(d.colour ?? '#6B6B6B')
    setDLinkedIds((d.linkedTo ?? []).map((l) => l.toDepartment.id))
    setDLinkSearch('')
    setDError(''); setDeptModalOpen(true)
  }

  async function handleDeptSave() {
    if (!dName.trim() || !selectedVenueId) { setDError('NAME AND VENUE REQUIRED'); return }
    setDSaving(true); setDError('')

    const url = deptEditing ? `/api/admin/departments/${deptEditing.id}` : '/api/admin/departments'
    const method = deptEditing ? 'PUT' : 'POST'

    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        deptEditing
          ? { name: dName, colour: dColour, linkedDepartmentIds: dLinkedIds }
          : { name: dName, venueId: selectedVenueId, colour: dColour }
      ),
    })

    setDSaving(false)
    if (!r.ok) { const d = await r.json(); setDError(d.error ?? 'FAILED'); return }
    setDeptModalOpen(false); load()
  }

  // Linked department helpers
  function addLinkedDept(id: string) {
    if (!dLinkedIds.includes(id)) setDLinkedIds((prev) => [...prev, id])
    setDLinkSearch('')
  }
  function removeLinkedDept(id: string) {
    setDLinkedIds((prev) => prev.filter((x) => x !== id))
  }

  async function handleDeptDelete(id: string) {
    if (!confirm('SOFT-DELETE THIS DEPARTMENT?')) return
    await fetch(`/api/admin/departments/${id}`, { method: 'DELETE' })
    load()
  }

  // ── Section handlers ──

  function openSecCreate(deptId: string) {
    setSecEditing(null)
    setSecDeptId(deptId)
    const dept = venues.flatMap((v) => v.departments).find((d) => d.id === deptId)
    const usedHexes = new Set((dept?.sections.map((s) => s.colour) ?? []).filter(Boolean) as string[])
    setSName(''); setSColour(pickUnusedColour(usedHexes))
    setSError(''); setSecModalOpen(true)
  }

  function openSecEdit(s: DeptSection, deptId: string) {
    setSecEditing(s)
    setSecDeptId(deptId)
    setSName(s.name); setSColour(s.colour ?? '#6B6B6B')
    setSError(''); setSecModalOpen(true)
  }

  async function handleSecSave() {
    if (!sName.trim() || !secDeptId) { setSError('NAME AND DEPARTMENT REQUIRED'); return }
    setSSaving(true); setSError('')

    const url = secEditing ? `/api/admin/sections/${secEditing.id}` : '/api/admin/sections'
    const method = secEditing ? 'PUT' : 'POST'

    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        secEditing
          ? { name: sName, colour: sColour }
          : { name: sName, departmentId: secDeptId, colour: sColour }
      ),
    })

    setSSaving(false)
    if (!r.ok) { const d = await r.json(); setSError(d.error ?? 'FAILED'); return }
    setSecModalOpen(false); load()
  }

  async function handleSecDelete(id: string) {
    if (!confirm('SOFT-DELETE THIS SECTION?')) return
    await fetch(`/api/admin/sections/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-xl font-bold uppercase tracking-widest">VENUE</h1>
        {role === 'ADMIN' && (
          <Button onClick={openVenueCreate} size="sm">+ NEW VENUE</Button>
        )}
      </div>

      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : (
        <div className="space-y-4">
          {selectedVenue && (
            <div className="space-y-4">
              {/* Venue card */}
              <div className="border border-grey-mid bg-grey-dark p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold uppercase text-white">{selectedVenue.name}</span>
                      <span className={`font-mono text-xs uppercase ${selectedVenue.isActive ? 'text-success' : 'text-danger'}`}>
                        {selectedVenue.isActive ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </div>
                    {selectedVenue.address && <p className="font-mono text-xs text-grey-light mt-0.5">{selectedVenue.address}</p>}
                    <div className="flex flex-wrap gap-3 mt-1">
                      <span className="font-mono text-xs text-grey-light">{selectedVenue.timezone}</span>
                      {selectedVenue.geoLat != null && (
                        <span className="font-mono text-xs text-grey-light">GEO: {selectedVenue.geoLat}, {selectedVenue.geoLon} ({selectedVenue.geoRadius}m)</span>
                      )}
                    </div>
                  </div>
                  {role === 'ADMIN' && (
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => openVenueEdit(selectedVenue)}
                        className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors px-1 py-0.5">EDIT</button>
                      <button onClick={() => handleVenueDelete(selectedVenue.id)}
                        className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors px-1 py-0.5">DEL</button>
                    </div>
                  )}
                </div>
              </div>

              {/* Departments */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-mono text-xs uppercase text-grey-light tracking-wider">
                    DEPARTMENTS ({selectedVenue.departments.length})
                  </h2>
                  <Button size="sm" onClick={openDeptCreate}>+ DEPARTMENT</Button>
                </div>

                {selectedVenue.departments.length === 0 ? (
                  <p className="font-mono text-xs text-grey-light">NO DEPARTMENTS YET.</p>
                ) : (
                  selectedVenue.departments.map((dept) => (
                    <div key={dept.id} className="border border-grey-mid bg-grey-dark">
                      <div className="p-3 border-b border-grey-mid flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          {dept.colour && (
                            <div className="w-3 h-3 flex-shrink-0 border border-grey-mid" style={{ backgroundColor: dept.colour }} />
                          )}
                          <span className="font-mono text-sm font-bold uppercase text-white">{dept.name}</span>
                          <span className={`font-mono text-xs ${dept.isActive ? 'text-success' : 'text-danger'}`}>
                            {dept.isActive ? 'ON' : 'OFF'}
                          </span>
                          {(dept.linkedTo ?? []).length > 0 && (
                            <span className="font-mono text-[10px] text-[#60A5FA]">
                              LINKED: {(dept.linkedTo ?? []).map((l) => l.toDepartment.name).join(', ')}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button onClick={() => openSecCreate(dept.id)}
                            className="font-mono text-xs uppercase text-success hover:opacity-80 px-1 py-0.5">+ SECTION</button>
                          <button onClick={() => openDeptEdit(dept)}
                            className="font-mono text-xs uppercase text-grey-light hover:text-white px-1 py-0.5">EDIT</button>
                          <button onClick={() => handleDeptDelete(dept.id)}
                            className="font-mono text-xs uppercase text-grey-light hover:text-danger px-1 py-0.5">DEL</button>
                        </div>
                      </div>

                      {/* Sections under this department */}
                      {dept.sections.length > 0 && (
                        <div className="divide-y divide-grey-mid">
                          {dept.sections.map((sec) => (
                            <div key={sec.id} className="px-3 py-2 flex items-center justify-between gap-3 pl-6">
                              <div className="flex items-center gap-2">
                                {sec.colour && (
                                  <div className="w-2 h-2 flex-shrink-0 border border-grey-mid" style={{ backgroundColor: sec.colour }} />
                                )}
                                <span className="font-mono text-xs uppercase text-white">{sec.name}</span>
                                {!sec.isActive && <span className="font-mono text-[10px] text-danger">OFF</span>}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <button onClick={() => openSecEdit(sec, dept.id)}
                                  className="font-mono text-xs text-grey-light hover:text-white px-1 py-0.5">EDIT</button>
                                <button onClick={() => handleSecDelete(sec.id)}
                                  className="font-mono text-xs text-grey-light hover:text-danger px-1 py-0.5">DEL</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>


            </div>
          )}
        </div>
      )}

      {/* Venue modal */}
      <Modal isOpen={venueModalOpen} onClose={() => setVenueModalOpen(false)} title={venueEditing ? 'EDIT VENUE' : 'NEW VENUE'}>
        <div className="space-y-4">
          <Input label="Name" value={vName} onChange={(e) => setVName(e.target.value)} placeholder="THE CROWN HOTEL" />
          <Input label="Address (optional)" value={vAddress} onChange={(e) => setVAddress(e.target.value)} placeholder="123 Main Street" />
          <Select label="Timezone" value={vTimezone} onChange={(e) => setVTimezone(e.target.value)} options={TIMEZONES} />
          <div className="grid grid-cols-3 gap-3">
            <Input label="Geo Lat" value={vGeoLat} onChange={(e) => setVGeoLat(e.target.value)} placeholder="-36.8" />
            <Input label="Geo Lon" value={vGeoLon} onChange={(e) => setVGeoLon(e.target.value)} placeholder="174.7" />
            <Input label="Radius (m)" value={vGeoRadius} onChange={(e) => setVGeoRadius(e.target.value)} placeholder="200" />
          </div>
          {vError && <p className="font-mono text-xs text-danger">{vError}</p>}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleVenueSave} loading={vSaving}>SAVE</Button>
            <Button variant="ghost" onClick={() => setVenueModalOpen(false)}>CANCEL</Button>
          </div>
        </div>
      </Modal>

      {/* Dept modal */}
      <Modal isOpen={deptModalOpen} onClose={() => setDeptModalOpen(false)} title={deptEditing ? 'EDIT DEPARTMENT' : 'NEW DEPARTMENT'}>
        <div className="space-y-4">
          <Input label="Name" value={dName} onChange={(e) => setDName(e.target.value)} placeholder="BAR" />
          <div>
            <label className="font-mono text-xs uppercase text-grey-light tracking-wider mb-1 block">Colour</label>
            <div className="flex flex-wrap gap-1 mb-2">
              {DEPT_COLOURS.map((c) => (
                <button key={c.value} onClick={() => setDColour(c.value)}
                  className="w-7 h-7 border"
                  style={{ backgroundColor: c.value, borderColor: dColour === c.value ? '#F5F5F5' : '#2E2E2E' }}
                  title={c.label} />
              ))}
            </div>
            <Input value={dColour} onChange={(e) => setDColour(e.target.value)} className="font-mono" />
          </div>

          {/* Linked departments — only shown when editing (not creating) */}
          {deptEditing && (
            <div>
              <label className="font-mono text-xs uppercase text-grey-light tracking-wider mb-1 block">LINKED DEPARTMENTS</label>
              <p className="font-mono text-[10px] text-grey-light mb-2">
                TASKS AND CHECKLISTS FROM LINKED DEPARTMENTS WILL ALSO SHOW FOR THIS DEPARTMENT&apos;S STAFF.
              </p>

              {/* Selected linked departments as removable tags */}
              {dLinkedIds.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {dLinkedIds.map((id) => {
                    const dep = selectedVenue?.departments.find((x) => x.id === id)
                    return (
                      <span key={id} className="inline-flex items-center gap-1 font-mono text-xs px-2 py-1 bg-grey-dark border border-grey-mid text-white">
                        {dep?.colour && (
                          <span className="w-2 h-2 inline-block border border-grey-mid" style={{ backgroundColor: dep.colour }} />
                        )}
                        {dep?.name ?? id}
                        <button onClick={() => removeLinkedDept(id)} className="ml-1 text-grey-light hover:text-danger font-mono text-sm leading-none">&times;</button>
                      </span>
                    )
                  })}
                </div>
              )}

              {/* Search + dropdown */}
              <div className="relative">
                <input
                  type="text"
                  value={dLinkSearch}
                  onChange={(e) => setDLinkSearch(e.target.value)}
                  placeholder="SEARCH DEPARTMENTS"
                  className="w-full bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white placeholder:text-grey-light"
                />
                {dLinkSearch.trim() && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-black border border-grey-mid max-h-32 overflow-y-auto">
                    {selectedVenue?.departments
                      .filter((d) => d.id !== deptEditing.id && !dLinkedIds.includes(d.id) && d.name.toLowerCase().includes(dLinkSearch.toLowerCase()))
                      .slice(0, 20)
                      .map((d) => (
                        <button
                          key={d.id}
                          onClick={() => addLinkedDept(d.id)}
                          className="w-full text-left px-2 py-1.5 font-mono text-xs text-grey-light hover:bg-grey-dark hover:text-white flex items-center gap-2"
                        >
                          {d.colour && (
                            <span className="w-2 h-2 inline-block border border-grey-mid flex-shrink-0" style={{ backgroundColor: d.colour }} />
                          )}
                          <span className="truncate">{d.name}</span>
                        </button>
                      ))}
                    {dLinkSearch.trim() && selectedVenue?.departments.filter((d) => d.id !== deptEditing.id && !dLinkedIds.includes(d.id) && d.name.toLowerCase().includes(dLinkSearch.toLowerCase())).length === 0 && (
                      <p className="px-2 py-1.5 font-mono text-xs text-grey-light">NO MATCHING DEPARTMENTS</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {dError && <p className="font-mono text-xs text-danger">{dError}</p>}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleDeptSave} loading={dSaving}>SAVE</Button>
            <Button variant="ghost" onClick={() => setDeptModalOpen(false)}>CANCEL</Button>
          </div>
        </div>
      </Modal>

      {/* Section modal */}
      <Modal isOpen={secModalOpen} onClose={() => setSecModalOpen(false)} title={secEditing ? 'EDIT SECTION' : 'NEW SECTION'}>
        <div className="space-y-4">
          <Input label="Name" value={sName} onChange={(e) => setSName(e.target.value)} placeholder="COFFEE STATION" />
          <div>
            <label className="font-mono text-xs uppercase text-grey-light tracking-wider mb-1 block">Colour</label>
            <div className="flex flex-wrap gap-1 mb-2">
              {DEPT_COLOURS.map((c) => (
                <button key={c.value} onClick={() => setSColour(c.value)}
                  className="w-7 h-7 border"
                  style={{ backgroundColor: c.value, borderColor: sColour === c.value ? '#F5F5F5' : '#2E2E2E' }}
                  title={c.label} />
              ))}
            </div>
            <Input value={sColour} onChange={(e) => setSColour(e.target.value)} className="font-mono" />
          </div>
          {sError && <p className="font-mono text-xs text-danger">{sError}</p>}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSecSave} loading={sSaving}>SAVE</Button>
            <Button variant="ghost" onClick={() => setSecModalOpen(false)}>CANCEL</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
