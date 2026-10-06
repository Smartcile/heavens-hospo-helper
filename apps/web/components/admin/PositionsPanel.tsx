'use client'

// Positions are job titles — "BARTENDER", "DUTY MANAGER" — as opposed to
// Sections, which are places. A person holds any number of them, and guides or
// pathways can be targeted at one.

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { RoleRequirementsDrawer } from '@/components/admin/RoleRequirementsDrawer'

interface Position {
  id: string
  name: string
  colour: string | null
  departmentId: string | null
  departmentIds: string[]
  hourlyRate: number | null
  department: { id: string; name: string } | null
  _count: { staff: number }
}
interface Department { id: string; name: string; venueId: string }

export function PositionsPanel({ venueId }: { venueId: string }) {
  const [positions, setPositions] = useState<Position[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [name, setName] = useState('')
  const [departmentIds, setDepartmentIds] = useState<string[]>([])
  const [hourlyRate, setHourlyRate] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [requirementsFor, setRequirementsFor] = useState<Position | null>(null)
  const [readiness, setReadiness] = useState<Record<string, { total: number; ready: number }>>({})

  const load = useCallback(async () => {
    const [pR, dR, rR] = await Promise.all([
      fetch(`/api/admin/positions?venueId=${encodeURIComponent(venueId)}`),
      fetch('/api/admin/departments'),
      fetch(`/api/admin/positions/readiness?venueId=${encodeURIComponent(venueId)}`),
    ])
    setPositions(pR.ok ? await pR.json() : [])
    setDepartments(dR.ok ? await dR.json() : [])
    setReadiness(rR.ok ? await rR.json() : {})
    setLoading(false)
  }, [venueId])

  useEffect(() => { load() }, [load])

  async function create() {
    if (!name.trim()) return
    setSaving(true); setError('')
    const r = await fetch('/api/admin/positions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, departmentIds, venueId, hourlyRate: hourlyRate.trim() ? Number(hourlyRate) : null }),
    })
    setSaving(false)
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setError(d.error ?? 'COULD NOT CREATE')
      return
    }
    setName(''); setDepartmentIds([]); setHourlyRate('')
    load()
  }

  async function updateRate(p: Position, value: string) {
    const next = value.trim() ? Number(value) : null
    if (next === (p.hourlyRate ?? null)) return
    await fetch(`/api/admin/positions/${p.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hourlyRate: next }),
    })
    load()
  }

  async function remove(p: Position) {
    const warn = p._count.staff > 0
      ? `DELETE "${p.name}"? ${p._count.staff} STAFF WILL LOSE THIS ROLE.`
      : `DELETE "${p.name}"?`
    if (!confirm(warn)) return
    await fetch(`/api/admin/positions/${p.id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="border border-grey-mid p-4 space-y-3">
      <div>
        <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">POSITIONS / ROLES</h3>
        <p className="font-mono text-xs uppercase text-grey-light mt-0.5">
          A JOB TITLE, NOT A PLACE. LEAVE THE DEPARTMENT BLANK FOR ROLES THAT SPAN EVERYTHING.
        </p>
      </div>

      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : positions.length === 0 ? (
        <p className="font-mono text-xs text-grey-light">NO POSITIONS YET.</p>
      ) : (
        <div className="divide-y divide-grey-mid border border-grey-mid">
          {positions.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <span className="font-mono text-xs uppercase text-white">{p.name}</span>
                <span className="font-mono text-xs uppercase text-grey-light ml-2">
                  {(p.departmentIds?.length
                    ? p.departmentIds.map((id) => departments.find((d) => d.id === id)?.name ?? '?').join(', ')
                    : p.department?.name ?? 'ALL DEPARTMENTS')} · {p._count.staff} STAFF
                </span>
                {readiness[p.id] && (
                  <span
                    className={`font-mono text-xs uppercase ml-2 ${
                      readiness[p.id].total > 0 && readiness[p.id].ready === readiness[p.id].total
                        ? 'text-success'
                        : 'text-warning'
                    }`}
                  >
                    {readiness[p.id].total === 0
                      ? 'NO STAFF'
                      : `${readiness[p.id].ready}/${readiness[p.id].total} READY`}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="font-mono text-xs text-grey-light">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={p.hourlyRate ?? ''}
                  placeholder="RATE"
                  onBlur={(e) => updateRate(p, e.target.value)}
                  className="w-20 bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1 text-right outline-none focus:border-white placeholder:text-grey-light"
                  title="Default rate for this role"
                />
                <span className="font-mono text-xs text-grey-light">/HR</span>
              </div>
              <div className="flex gap-3 shrink-0">
                <button
                  onClick={() => setRequirementsFor(p)}
                  className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors"
                >
                  REQUIREMENTS
                </button>
                <button
                  onClick={() => remove(p)}
                  className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors"
                >
                  DELETE
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[10rem]">
          <Input label="New position" value={name} onChange={(e) => setName(e.target.value)} placeholder="BARTENDER" />
        </div>
        <div className="flex-1 min-w-[12rem]">
          <label className="font-mono text-xs uppercase text-grey-light tracking-wider">Departments (optional — a role can span several)</label>
          <div className="flex flex-wrap gap-1 mt-1">
            {departments.filter((d) => d.venueId === venueId).map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDepartmentIds((prev) => (prev.includes(d.id) ? prev.filter((x) => x !== d.id) : [...prev, d.id]))}
                className={`font-mono text-xs uppercase px-2 py-1 border transition-colors ${departmentIds.includes(d.id) ? 'bg-white text-black border-white' : 'text-grey-light border-grey-mid hover:border-white hover:text-white'}`}
              >
                {d.name}
              </button>
            ))}
          </div>
        </div>
        <div className="w-28">
          <Input label="Rate $" type="number" min="0" step="0.01" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} placeholder="25.00" />
        </div>
        <Button size="sm" variant="ghost" onClick={create} loading={saving}>+ ADD</Button>
      </div>

      {error && <p className="font-mono text-xs text-danger">{error}</p>}

      {requirementsFor && (
        <RoleRequirementsDrawer
          positionId={requirementsFor.id}
          positionName={requirementsFor.name}
          venueId={venueId}
          onClose={() => { setRequirementsFor(null); load() }}
        />
      )}
    </div>
  )
}
