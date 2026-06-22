'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'

interface LineItem { id: string; itemId: string; countedQuantity: number; expectedQuantity: number; variance: number; item: { id: string; name: string; unit: string; category: { id: string; name: string } } }
interface Staff { id: string; firstName: string; lastName: string }
interface Record { id: string; date: string; status: string; notes: string | null; assignedRoleId: string | null; assignedStaffId: string | null; completedAt: string | null; completedBy: { id: string; firstName: string; lastName: string } | null; assignedStaff: Staff | null; _count: { lineItems: number } }
interface FullRecord extends Record { lineItems: LineItem[] }

export function StocktakeClient() {
  const [records, setRecords] = useState<Record[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<FullRecord | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10))
  const [newAssignedStaff, setNewAssignedStaff] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [creating, setCreating] = useState(false)

  async function load() {
    setLoading(true)
    const [rRes, sRes] = await Promise.all([
      fetch('/api/admin/stocktake'),
      fetch('/api/admin/staff?role=STAFF'),
    ])
    if (rRes.ok) setRecords(await rRes.json())
    if (sRes.ok) setStaff(await sRes.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function create() {
    setCreating(true)
    const r = await fetch('/api/admin/stocktake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: newDate, assignedStaffId: newAssignedStaff || null, notes: newNotes || null }),
    })
    if (r.ok) { setShowCreate(false); setNewAssignedStaff(''); setNewNotes(''); load() }
    setCreating(false)
  }

  async function openRecord(id: string) {
    const r = await fetch(`/api/admin/stocktake/${id}`)
    if (r.ok) setSelected(await r.json())
  }

  async function updateCounts() {
    if (!selected) return
    await fetch(`/api/admin/stocktake/${selected.id}/line-items`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lineItems: selected.lineItems.map((li) => ({
          itemId: li.itemId,
          countedQuantity: li.countedQuantity,
          expectedQuantity: li.expectedQuantity,
        })),
      }),
    })
    openRecord(selected.id)
  }

  async function complete() {
    if (!selected) return
    await fetch(`/api/admin/stocktake/${selected.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'COMPLETED' }),
    })
    setSelected(null)
    load()
  }

  function updateCount(itemId: string, val: number) {
    if (!selected) return
    setSelected({
      ...selected,
      lineItems: selected.lineItems.map((li) =>
        li.itemId === itemId
          ? { ...li, countedQuantity: val, variance: val - li.expectedQuantity }
          : li,
      ),
    })
  }

  const statusColour = (s: string) => s === 'COMPLETED' ? 'text-success' : s === 'IN_PROGRESS' ? 'text-accent' : 'text-grey-light'
  const badge = (s: string) => {
    if (s === 'COMPLETED') return 'bg-green-900 text-success'
    if (s === 'IN_PROGRESS') return 'bg-blue-900 text-accent'
    return 'bg-grey-mid text-grey-light'
  }

  if (loading) return <p className="font-mono text-sm text-grey-light loading-cursor">LOADING</p>

  if (selected) {
    const diff = selected.lineItems.reduce((s, li) => s + Math.abs(li.variance), 0)
    const unresolved = selected.lineItems.filter((li) => li.variance !== 0)

    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">STOCKTAKE</h1>
            <p className="font-mono text-[10px] text-grey-light">{selected.date} · {selected.status}</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => { updateCounts(); setSelected(null) }}>BACK</Button>
            {selected.status !== 'COMPLETED' && (
              <Button size="sm" onClick={complete}>COMPLETE</Button>
            )}
          </div>
        </div>

        {unresolved.length > 0 && (
          <div className="bg-danger/10 border border-danger p-2">
            <p className="font-mono text-[10px] text-danger">{unresolved.length} item(s) with variance — total diff: {diff}</p>
          </div>
        )}

        <div className="space-y-1 max-h-[60vh] overflow-y-auto">
          {selected.lineItems.map((li) => (
            <div key={li.id} className={`flex items-center gap-3 bg-grey-dark border p-2 ${li.variance !== 0 ? 'border-danger/50' : 'border-grey-mid'}`}>
              <div className="flex-1 min-w-0">
                <span className="font-mono text-xs text-white truncate">{li.item.name}</span>
                <span className="font-mono text-[10px] text-grey-light ml-2">{li.item.category.name}</span>
              </div>
              <span className="font-mono text-[10px] text-grey-light">{li.item.unit}</span>
              <span className="font-mono text-[10px] text-grey-light">EXP: {li.expectedQuantity}</span>
              {selected.status !== 'COMPLETED' ? (
                <input type="number" value={li.countedQuantity}
                  onChange={(e) => updateCount(li.itemId, parseInt(e.target.value) || 0)}
                  className="w-16 bg-black border border-grey-mid text-white font-mono text-xs text-center p-1" />
              ) : (
                <span className="font-mono text-xs text-white w-16 text-right">{li.countedQuantity}</span>
              )}
              <span className={`font-mono text-[10px] w-12 text-right ${li.variance !== 0 ? 'text-danger' : 'text-success'}`}>
                {li.variance > 0 ? '+' : ''}{li.variance}
              </span>
            </div>
          ))}
        </div>

        <div className="flex justify-between font-mono text-xs text-white border-t border-grey-mid pt-2">
          <span>TOTAL ITEMS: {selected.lineItems.length}</span>
          <span>TOTAL VARIANCE: {diff}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">STOCKTAKES</h1>
        <Button size="sm" onClick={() => setShowCreate(!showCreate)}>NEW STOCKTAKE</Button>
      </div>

      {showCreate && (
        <div className="bg-grey-dark border border-grey-mid p-4 space-y-3">
          <h2 className="font-mono text-xs font-bold text-white uppercase">Create Stocktake</h2>
          <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          <Select value={newAssignedStaff} onChange={(e) => setNewAssignedStaff(e.target.value)}
            options={staff.map((s) => ({ value: s.id, label: `${s.firstName} ${s.lastName}`.toUpperCase() }))}
            placeholder="ASSIGN TO STAFF (OPTIONAL)" />
          <Input value={newNotes} onChange={(e) => setNewNotes(e.target.value)} placeholder="NOTES (OPTIONAL)" />
          <Button size="sm" onClick={create} loading={creating}>CREATE</Button>
        </div>
      )}

      <div className="space-y-1">
        {records.length === 0 && <p className="font-mono text-xs text-grey-light">No stocktakes yet.</p>}
        {records.map((r) => (
          <div key={r.id}
            onClick={() => openRecord(r.id)}
            className="flex items-center gap-3 bg-grey-dark border border-grey-mid p-3 cursor-pointer hover:border-white transition-colors">
            <div className="flex-1 min-w-0">
              <span className="font-mono text-xs text-white">{r.date}</span>
              {r.assignedStaff && (
                <span className="font-mono text-[10px] text-grey-light ml-2">→ {r.assignedStaff.firstName} {r.assignedStaff.lastName}</span>
              )}
            </div>
            <span className={`font-mono text-[10px] px-1.5 py-0.5 ${badge(r.status)}`}>{r.status}</span>
            <span className="font-mono text-[10px] text-grey-light">{r._count.lineItems} items</span>
            {r.completedBy && (
              <span className="font-mono text-[10px] text-grey-light">by {r.completedBy.firstName}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
