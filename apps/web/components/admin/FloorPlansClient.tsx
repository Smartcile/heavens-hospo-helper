'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'

const FloorPlanEditor = dynamic(
  () => import('@/components/admin/FloorPlanEditor').then((m) => m.FloorPlanEditor),
  { ssr: false }
)

interface Venue { id: string; name: string }
interface Section { id: string; name: string; colour: string | null; departmentId: string }

interface PlanSummary {
  id: string; name: string; slug: string; isDefault: boolean
  roomWidth: number; roomDepth: number; gridUnit: number
  _count: { elements: number }
}

interface FullPlan {
  id: string; name: string; slug: string; isDefault: boolean
  roomWidth: number; roomDepth: number; gridUnit: number
}

export function FloorPlansClient({ role, venueId: sessionVenueId }: { role: string; venueId: string }) {
  const [venues, setVenues] = useState<Venue[]>([])
  const [selectedVenueId, setSelectedVenueId] = useState(sessionVenueId)
  const [plans, setPlans] = useState<PlanSummary[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [editingPlan, setEditingPlan] = useState<FullPlan | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', slug: '', roomWidth: '2000', roomDepth: '1500', gridUnit: '50' })
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetch('/api/admin/venues').then((r) => r.ok && r.json()).then((d) => setVenues(d ?? []))
  }, [])

  useEffect(() => { loadPlans(); loadSections() }, [selectedVenueId])

  async function loadPlans() {
    if (!selectedVenueId) { setPlans([]); return }
    const r = await fetch(`/api/admin/floorplan?venueId=${selectedVenueId}`)
    if (r.ok) setPlans(await r.json())
  }

  async function loadSections() {
    if (!selectedVenueId) { setSections([]); return }
    const r = await fetch(`/api/admin/sections?venueId=${selectedVenueId}`)
    if (r.ok) setSections(await r.json())
  }

  async function handleCreate() {
    const { name, slug, roomWidth, roomDepth, gridUnit } = createForm
    if (!name.trim() || !slug.trim()) { setCreateError('NAME AND SLUG REQUIRED'); return }
    setCreating(true); setCreateError('')
    const r = await fetch('/api/admin/floorplan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueId: selectedVenueId, name: name.trim(), slug: slug.trim().toLowerCase().replace(/\s+/g, '-'), roomWidth: parseFloat(roomWidth) || 2000, roomDepth: parseFloat(roomDepth) || 1500, gridUnit: parseFloat(gridUnit) || 50 }),
    })
    setCreating(false)
    if (r.ok) {
      setCreateOpen(false)
      setCreateForm({ name: '', slug: '', roomWidth: '2000', roomDepth: '1500', gridUnit: '50' })
      loadPlans()
    } else {
      const d = await r.json()
      setCreateError(d.error ?? 'CREATE FAILED')
    }
  }

  async function handleDeletePlan(id: string) {
    if (!confirm('DELETE THIS FLOOR PLAN AND ALL ELEMENTS?')) return
    await fetch(`/api/admin/floorplan/${id}`, { method: 'DELETE' })
    loadPlans()
  }

  if (editingPlan) {
    return <FloorPlanEditor plan={editingPlan} sections={sections} onBack={() => setEditingPlan(null)} />
  }

  const venueOptions = venues.map((v) => ({ value: v.id, label: v.name }))

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-mono text-xl font-bold uppercase tracking-widest">FLOOR PLAN</h1>
          <p className="font-mono text-xs text-grey-light mt-1">TO-SCALE VENUE LAYOUT EDITOR</p>
        </div>
        <div className="flex items-center gap-3">
          {role === 'ADMIN' && (
            <Select value={selectedVenueId} onChange={(e) => setSelectedVenueId(e.target.value)} options={venueOptions} placeholder="SELECT VENUE" className="w-48" />
          )}
          <Button onClick={() => setCreateOpen(true)} size="sm">+ NEW PLAN</Button>
        </div>
      </div>

      {plans.length === 0 ? (
        <p className="font-mono text-xs text-grey-light">NO FLOOR PLANS YET.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((p) => (
            <div key={p.id} className="bg-grey-dark border border-grey-mid p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-mono font-semibold text-sm uppercase text-white">{p.name}</div>
                  <div className="font-mono text-xs text-grey-light">/{p.slug}</div>
                </div>
                {p.isDefault && <span className="font-mono text-[10px] uppercase text-accent">DEFAULT</span>}
              </div>
              <div className="font-mono text-xs text-grey-light space-y-1">
                <div>ROOM: {p.roomWidth} × {p.roomDepth} cm</div>
                <div>ELEMENTS: {p._count.elements}</div>
              </div>
              <div className="flex flex-wrap gap-3 pt-1">
                <button onClick={() => setEditingPlan({ id: p.id, name: p.name, slug: p.slug, isDefault: p.isDefault, roomWidth: p.roomWidth, roomDepth: p.roomDepth, gridUnit: p.gridUnit })} className="font-mono text-xs uppercase text-grey-light hover:text-white">EDIT</button>
                <button onClick={() => handleDeletePlan(p.id)} className="font-mono text-xs uppercase text-grey-light hover:text-danger">DELETE</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="CREATE FLOOR PLAN">
        <div className="space-y-4">
          <Input label="Name" value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} placeholder="MAIN DINING" />
          <Input label="Slug" value={createForm.slug} onChange={(e) => setCreateForm({ ...createForm, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} placeholder="main-dining" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Room Width (cm)" type="number" value={createForm.roomWidth} onChange={(e) => setCreateForm({ ...createForm, roomWidth: e.target.value })} />
            <Input label="Room Depth (cm)" type="number" value={createForm.roomDepth} onChange={(e) => setCreateForm({ ...createForm, roomDepth: e.target.value })} />
          </div>
          <Input label="Grid Unit (cm)" type="number" value={createForm.gridUnit} onChange={(e) => setCreateForm({ ...createForm, gridUnit: e.target.value })} />
          {createError && <p className="font-mono text-xs text-danger">{createError}</p>}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleCreate} loading={creating}>CREATE</Button>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>CANCEL</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
