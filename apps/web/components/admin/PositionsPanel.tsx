'use client'

// Positions are job titles — "BARTENDER", "DUTY MANAGER" — as opposed to
// Sections, which are places. A person holds any number of them, and guides or
// pathways can be targeted at one.

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'

interface Position {
  id: string
  name: string
  colour: string | null
  departmentId: string | null
  department: { id: string; name: string } | null
  _count: { staff: number }
}
interface Department { id: string; name: string; venueId: string }

export function PositionsPanel({ venueId }: { venueId: string }) {
  const [positions, setPositions] = useState<Position[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [name, setName] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [pR, dR] = await Promise.all([
      fetch(`/api/admin/positions?venueId=${encodeURIComponent(venueId)}`),
      fetch('/api/admin/departments'),
    ])
    setPositions(pR.ok ? await pR.json() : [])
    setDepartments(dR.ok ? await dR.json() : [])
    setLoading(false)
  }, [venueId])

  useEffect(() => { load() }, [load])

  async function create() {
    if (!name.trim()) return
    setSaving(true); setError('')
    const r = await fetch('/api/admin/positions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, departmentId: departmentId || null, venueId }),
    })
    setSaving(false)
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setError(d.error ?? 'COULD NOT CREATE')
      return
    }
    setName(''); setDepartmentId('')
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

  const deptOptions = [
    { value: '', label: 'ALL DEPARTMENTS' },
    ...departments.filter((d) => d.venueId === venueId).map((d) => ({ value: d.id, label: d.name })),
  ]

  return (
    <div className="border border-grey-mid p-4 space-y-3">
      <div>
        <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">POSITIONS / ROLES</h3>
        <p className="font-mono text-[10px] uppercase text-grey-light mt-0.5">
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
                <span className="font-mono text-[10px] uppercase text-grey-light ml-2">
                  {p.department?.name ?? 'ALL DEPARTMENTS'} · {p._count.staff} STAFF
                </span>
              </div>
              <button
                onClick={() => remove(p)}
                className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors"
              >
                DELETE
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[10rem]">
          <Input label="New position" value={name} onChange={(e) => setName(e.target.value)} placeholder="BARTENDER" />
        </div>
        <div className="flex-1 min-w-[10rem]">
          <Select label="Department" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} options={deptOptions} />
        </div>
        <Button size="sm" variant="ghost" onClick={create} loading={saving}>+ ADD</Button>
      </div>

      {error && <p className="font-mono text-xs text-danger">{error}</p>}
    </div>
  )
}
