'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'

interface Assignment { id: string; itemId: string; quantity: number; item: { id: string; name: string; unit: string; category: { name: string } } }
interface ItemSummary { id: string; name: string; categoryName: string; unit: string }

export function ElementInventoryPanel({ elementId, floorPlanId }: { elementId: string; floorPlanId: string }) {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [items, setItems] = useState<ItemSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newItemId, setNewItemId] = useState('')
  const [newQty, setNewQty] = useState('1')

  async function load() {
    setLoading(true)
    const [aRes, iRes] = await Promise.all([
      fetch(`/api/admin/floorplan/${floorPlanId}/elements/${elementId}/inventory`),
      fetch('/api/admin/inventory'),
    ])
    if (aRes.ok) setAssignments(await aRes.json())
    if (iRes.ok) {
      const data = await iRes.json()
      setItems(data.map((i: any) => ({ id: i.id, name: i.name, categoryName: i.category.name, unit: i.unit })))
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [elementId, floorPlanId])

  async function addAssignment() {
    if (!newItemId) return
    const updated = [
      ...assignments.map((a) => ({ itemId: a.itemId, quantity: a.quantity })),
      { itemId: newItemId, quantity: parseInt(newQty) || 1 },
    ]
    await fetch(`/api/admin/floorplan/${floorPlanId}/elements/${elementId}/inventory`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignments: updated }),
    })
    setNewItemId(''); setNewQty('1'); setShowAdd(false)
    load()
  }

  async function removeAssignment(itemId: string) {
    const updated = assignments
      .filter((a) => a.itemId !== itemId)
      .map((a) => ({ itemId: a.itemId, quantity: a.quantity }))
    await fetch(`/api/admin/floorplan/${floorPlanId}/elements/${elementId}/inventory`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignments: updated }),
    })
    load()
  }

  async function updateQty(itemId: string, qty: number) {
    const updated = assignments.map((a) => ({
      itemId: a.itemId,
      quantity: a.itemId === itemId ? Math.max(0, qty) : a.quantity,
    }))
    await fetch(`/api/admin/floorplan/${floorPlanId}/elements/${elementId}/inventory`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignments: updated }),
    })
    load()
  }

  const unassigned = items.filter((i) => !assignments.some((a) => a.itemId === i.id))

  if (loading) return <p className="font-mono text-[10px] text-grey-light">LOADING INVENTORY...</p>

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] text-grey-light uppercase">ITEMS ON THIS ELEMENT</span>
        <button onClick={() => setShowAdd(!showAdd)}
          className="font-mono text-[10px] text-accent hover:text-white uppercase">+ ADD</button>
      </div>

      {showAdd && (
        <div className="bg-black border border-grey-mid p-2 space-y-2">
          <Select value={newItemId} onChange={(e) => setNewItemId(e.target.value)}
            options={unassigned.map((i) => ({ value: i.id, label: `${i.name} (${i.categoryName})` }))}
            placeholder="SELECT ITEM" />
          <div className="flex gap-2 items-center">
            <Input type="number" value={newQty} onChange={(e) => setNewQty(e.target.value)}
              placeholder="QTY" className="w-20" />
            <Button size="sm" onClick={addAssignment} disabled={!newItemId}>ADD</Button>
          </div>
        </div>
      )}

      {assignments.length === 0 && !showAdd && (
        <p className="font-mono text-[10px] text-grey-light">No items assigned.</p>
      )}

      {assignments.map((a) => (
        <div key={a.id} className="flex items-center gap-2 bg-black border border-grey-mid p-1.5">
          <div className="flex-1 min-w-0">
            <span className="font-mono text-[10px] text-white truncate">{a.item.name}</span>
            <span className="font-mono text-[8px] text-grey-light ml-1">{a.item.category.name}</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => updateQty(a.itemId, a.quantity - 1)}
              className="w-5 h-5 bg-grey-mid text-white font-mono text-[10px]">−</button>
            <span className="w-6 text-center font-mono text-[10px] text-white">{a.quantity}</span>
            <button onClick={() => updateQty(a.itemId, a.quantity + 1)}
              className="w-5 h-5 bg-grey-mid text-white font-mono text-[10px]">+</button>
          </div>
          <span className="font-mono text-[8px] text-grey-light w-8 text-right">{a.item.unit}</span>
          <button onClick={() => removeAssignment(a.itemId)}
            className="font-mono text-[10px] text-danger hover:text-white">✕</button>
        </div>
      ))}
    </div>
  )
}
