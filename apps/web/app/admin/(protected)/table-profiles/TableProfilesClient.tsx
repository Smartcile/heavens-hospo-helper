'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'

interface InventoryItemView {
  id: string
  name: string
  unit: string
  categoryId: string
  totalQty: number
}

interface BomItemView {
  id?: string
  inventoryItemId: string
  inventoryItemName?: string
  inventoryItemUnit?: string
  quantity: number
  perChair: boolean
  _clientId?: string
}

interface TableProfileView {
  id: string
  name: string
  type: string
  capacity: number
  width: number
  depth: number
  shape: string
  colour: string
  chairCount: number
  seatingDensity: number | null
  maxHeadChairs: number
  isActive: boolean
  bomItems?: BomItemView[]
}

const TABLE_TYPES = [
  { value: 'TABLE', label: 'TABLE' },
  { value: 'BOOTH', label: 'BOOTH' },
  { value: 'BAR', label: 'BAR' },
]

const SHAPES = [
  { value: 'RECTANGLE', label: 'RECTANGLE' },
  { value: 'CIRCLE', label: 'CIRCLE' },
]

function generateId() { return crypto.randomUUID() }

export function TableProfilesClient() {
  const [profiles, setProfiles] = useState<TableProfileView[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [inventoryItems, setInventoryItems] = useState<InventoryItemView[]>([])

  // Form fields
  const [name, setName] = useState('')
  const [type, setType] = useState('TABLE')
  const [capacity, setCapacity] = useState('0')
  const [width, setWidth] = useState('80')
  const [depth, setDepth] = useState('80')
  const [shape, setShape] = useState('RECTANGLE')
  const [colour, setColour] = useState('#555')
  const [chairCount, setChairCount] = useState('0')
  const [seatingDensity, setSeatingDensity] = useState('')
  const [maxHeadChairs, setMaxHeadChairs] = useState('1')
  const [bomItems, setBomItems] = useState<BomItemView[]>([])
  const [newBomItemId, setNewBomItemId] = useState('')
  const [newBomQty, setNewBomQty] = useState('1')
  const [newBomPerChair, setNewBomPerChair] = useState(false)

  const selectedProfile = profiles.find((p) => p.id === selectedId)

  async function load() {
    setLoading(true)
    try {
      const [prRes, invRes] = await Promise.all([
        fetch('/api/admin/table-profiles'),
        fetch('/api/admin/inventory'),
      ])
      if (prRes.ok) {
        const prs = await prRes.json()
        setProfiles(Array.isArray(prs) ? prs : [])
      }
      if (invRes.ok) {
        const items = await invRes.json()
        setInventoryItems(Array.isArray(items) ? items : [])
      }
    } catch {}
    setLoading(false)
  }

  async function loadBom(profileId: string) {
    const r = await fetch(`/api/admin/table-profiles/${profileId}/bom`)
    if (r.ok) {
      const items = await r.json()
      setBomItems(Array.isArray(items) ? items : [])
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (selectedId && !isCreating) {
      const p = profiles.find((x) => x.id === selectedId)
      if (p) {
        setName(p.name)
        setType(p.type)
        setCapacity(String(p.capacity))
        setWidth(String(p.width))
        setDepth(String(p.depth))
        setShape(p.shape)
        setColour(p.colour || '#555')
        setChairCount(String(p.chairCount))
        setSeatingDensity(p.seatingDensity != null ? String(p.seatingDensity) : '')
        setMaxHeadChairs(String(p.maxHeadChairs))
        loadBom(p.id)
      }
    }
  }, [selectedId, isCreating])

  function handleNew() {
    setIsCreating(true)
    setSelectedId(null)
    setName('')
    setType('TABLE')
    setCapacity('0')
    setWidth('80')
    setDepth('80')
    setShape('RECTANGLE')
    setColour('#555')
    setChairCount('0')
    setSeatingDensity('')
    setMaxHeadChairs('1')
    setBomItems([])
  }

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)

    const body = {
      name: name.trim().toUpperCase(),
      type,
      capacity: parseInt(capacity) || 0,
      width: parseFloat(width) || 80,
      depth: parseFloat(depth) || 80,
      shape,
      colour,
      chairCount: parseInt(chairCount) || 0,
      seatingDensity: seatingDensity ? parseFloat(seatingDensity) : null,
      maxHeadChairs: parseInt(maxHeadChairs) || 1,
    }

    let profileId = selectedId

    if (isCreating) {
      const r = await fetch('/api/admin/table-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (r.ok) {
        const created = await r.json()
        profileId = created.id
        setIsCreating(false)
        setSelectedId(created.id)
        await load()
      }
    } else if (selectedId) {
      const r = await fetch(`/api/admin/table-profiles/${selectedId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (r.ok) await load()
    }

    if (profileId && bomItems.length > 0) {
      await fetch(`/api/admin/table-profiles/${profileId}/bom`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: bomItems }),
      })
    }

    setSaving(false)
  }

  async function handleDelete() {
    if (!selectedId) return
    if (!confirm('Delete this table profile?')) return
    await fetch(`/api/admin/table-profiles/${selectedId}`, { method: 'DELETE' })
    setSelectedId(null)
    setIsCreating(false)
    await load()
  }

  function handleAddBomItem() {
    if (!newBomItemId) return
    const qty = parseInt(newBomQty) || 1
    const inv = inventoryItems.find((i) => i.id === newBomItemId)
    setBomItems((prev) => [
      ...prev,
      {
        _clientId: generateId(),
        inventoryItemId: newBomItemId,
        inventoryItemName: inv?.name,
        inventoryItemUnit: inv?.unit,
        quantity: qty,
        perChair: newBomPerChair,
      },
    ])
    setNewBomItemId('')
    setNewBomQty('1')
    setNewBomPerChair(false)
  }

  function handleRemoveBomItem(clientId: string) {
    setBomItems((prev) => prev.filter((b) => (b._clientId ?? b.id) !== clientId))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="font-mono text-xs text-grey-light uppercase">LOADING TABLE PROFILES...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      {/* LEFT — profile list */}
      <div className="lg:w-72 shrink-0 border border-grey-mid p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-xs uppercase text-grey-light tracking-wider">
            TABLE PROFILES ({profiles.length})
          </h2>
          <Button size="sm" onClick={handleNew}>+ ADD</Button>
        </div>
        <div className="space-y-0.5 max-h-[70vh] overflow-y-auto">
          {profiles.map((p) => (
            <button
              key={p.id}
              onClick={() => { setIsCreating(false); setSelectedId(p.id) }}
              className={`w-full text-left px-2 py-1.5 font-mono text-xs uppercase border ${
                selectedId === p.id && !isCreating
                  ? 'border-white text-white'
                  : 'border-transparent text-grey-light hover:border-grey-mid hover:text-white'
              }`}
            >
              {p.name}
              <span className="block text-[10px] text-grey-light normal-case">
                {p.type} · {p.capacity} SEAT · {p.width}×{p.depth}cm
              </span>
            </button>
          ))}
          {profiles.length === 0 && (
            <p className="font-mono text-xs text-grey-light px-2 py-1">NO PROFILES YET</p>
          )}
        </div>
      </div>

      {/* RIGHT — editor */}
      <div className="flex-1 border border-grey-mid p-4 space-y-4">
        {(!selectedId && !isCreating) ? (
          <p className="font-mono text-xs text-grey-light uppercase">
            SELECT A PROFILE OR CLICK + ADD TO CREATE ONE
          </p>
        ) : (
          <>
            <h2 className="font-mono text-xs uppercase text-grey-light tracking-wider">
              {isCreating ? 'NEW TABLE PROFILE' : 'PROPERTIES'}
            </h2>

            {/* Properties form */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="font-mono text-xs uppercase text-grey-light block mb-1">NAME</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="TABLE PROFILE NAME" />
              </div>
              <div>
                <label className="font-mono text-xs uppercase text-grey-light block mb-1">TYPE</label>
                <Select value={type} onChange={(e) => setType(e.target.value)} options={TABLE_TYPES} />
              </div>
              <div>
                <label className="font-mono text-xs uppercase text-grey-light block mb-1">WIDTH (CM)</label>
                <Input type="number" value={width} onChange={(e) => setWidth(e.target.value)} />
              </div>
              <div>
                <label className="font-mono text-xs uppercase text-grey-light block mb-1">DEPTH (CM)</label>
                <Input type="number" value={depth} onChange={(e) => setDepth(e.target.value)} />
              </div>
              <div>
                <label className="font-mono text-xs uppercase text-grey-light block mb-1">SHAPE</label>
                <Select value={shape} onChange={(e) => setShape(e.target.value)} options={SHAPES} />
              </div>
              <div>
                <label className="font-mono text-xs uppercase text-grey-light block mb-1">COLOUR</label>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 border border-grey-mid" style={{ backgroundColor: colour }} />
                  <Input value={colour} onChange={(e) => setColour(e.target.value)} className="flex-1" />
                </div>
              </div>
            </div>

            {/* Seating params */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="font-mono text-xs uppercase text-grey-light block mb-1">CHAIR COUNT</label>
                <Input type="number" value={chairCount} onChange={(e) => setChairCount(e.target.value)} />
              </div>
              <div>
                <label className="font-mono text-xs uppercase text-grey-light block mb-1">CAPACITY</label>
                <Input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
              </div>
              <div>
                <label className="font-mono text-xs uppercase text-grey-light block mb-1">SEATING DENSITY (CM/CHAIR)</label>
                <Input type="number" value={seatingDensity} onChange={(e) => setSeatingDensity(e.target.value)} placeholder="e.g. 60" />
              </div>
              <div>
                <label className="font-mono text-xs uppercase text-grey-light block mb-1">MAX HEAD CHAIRS</label>
                <Input type="number" value={maxHeadChairs} onChange={(e) => setMaxHeadChairs(e.target.value)} />
              </div>
            </div>

            {/* BOM section */}
            <div className="border border-grey-mid p-3 space-y-3">
              <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">
                BILL OF MATERIALS ({bomItems.length})
              </h3>

              {/* BOM item rows */}
              {bomItems.length > 0 && (
                <div className="space-y-1">
                  {bomItems.map((b) => {
                    const cid = b._clientId ?? b.id ?? ''
                    return (
                      <div key={cid} className="flex items-center gap-2 text-xs font-mono">
                        <span className="text-white flex-1 uppercase">{b.inventoryItemName ?? b.inventoryItemId}</span>
                        <span className="text-grey-light">×{b.quantity}</span>
                        <span className={`text-[10px] ${b.perChair ? 'text-success' : 'text-grey-light'}`}>
                          {b.perChair ? 'PER CHAIR' : 'PER TABLE'}
                        </span>
                        <button onClick={() => handleRemoveBomItem(cid)} className="text-danger hover:text-white">✕</button>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Add BOM item row */}
              <div className="flex items-center gap-2 flex-wrap">
                <Select
                  value={newBomItemId}
                  onChange={(e) => setNewBomItemId(e.target.value)}
                  options={inventoryItems.map((i) => ({ value: i.id, label: `${i.name} (${i.unit})` }))}
                  placeholder="SELECT ITEM..."
                  className="w-56"
                />
                <Input
                  type="number"
                  value={newBomQty}
                  onChange={(e) => setNewBomQty(e.target.value)}
                  className="w-16"
                />
                <button
                  onClick={() => setNewBomPerChair(!newBomPerChair)}
                  className={`font-mono text-xs px-2 py-1.5 border ${
                    newBomPerChair ? 'border-success text-success' : 'border-grey-mid text-grey-light'
                  }`}
                >
                  PER CHAIR
                </button>
                <Button size="sm" onClick={handleAddBomItem}>+ ADD ITEM</Button>
              </div>
            </div>

            {/* Actions */}
            <div className="border-t border-grey-mid pt-3 flex items-center gap-2 flex-wrap">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'SAVING...' : 'SAVE'}
              </Button>
              {!isCreating && (
                <Button variant="danger" size="sm" onClick={handleDelete}>DELETE</Button>
              )}
              {isCreating && (
                <Button variant="ghost" size="sm" onClick={() => { setIsCreating(false); setSelectedId(null) }}>
                  CANCEL
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
