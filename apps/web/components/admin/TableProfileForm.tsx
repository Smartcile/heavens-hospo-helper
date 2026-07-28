'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'

interface InventoryItemView {
  id: string
  name: string
  unit: string
}

interface BomItemView {
  id?: string
  _clientId?: string
  inventoryItemId: string
  inventoryItemName?: string
  inventoryItemUnit?: string
  quantity: number
  perChair: boolean
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

interface Props {
  onSaved: () => void
  onCancel: () => void
  profileId?: string | null
  onDelete?: () => void
}

export function TableProfileForm({ onSaved, onCancel, profileId, onDelete }: Props) {
  const isEditing = !!profileId
  const [name, setName] = useState('')
  const [type, setType] = useState('TABLE')
  const [capacity, setCapacity] = useState('0')
  const [width, setWidth] = useState('80')
  const [depth, setDepth] = useState('80')
  const [shape, setShape] = useState('RECTANGLE')
  const [colour, setColour] = useState('#e6c347')
  const [chairCount, setChairCount] = useState('0')
  const [seatingDensity, setSeatingDensity] = useState('')
  const [maxHeadChairs, setMaxHeadChairs] = useState('1')
  const [edgeChairs, setEdgeChairs] = useState<{ t: number; b: number; l: number; r: number }>({ t: 0, b: 0, l: 0, r: 0 })
  const [bomItems, setBomItems] = useState<BomItemView[]>([])
  const [newBomItemId, setNewBomItemId] = useState('')
  const [newBomQty, setNewBomQty] = useState('1')
  const [newBomPerChair, setNewBomPerChair] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [tableNumbers, setTableNumbers] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [inventoryItems, setInventoryItems] = useState<InventoryItemView[]>([])

  useEffect(() => {
    fetch('/api/admin/inventory')
      .then((r) => r.ok ? r.json() : [])
      .then((items) => setInventoryItems(Array.isArray(items) ? items : []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!profileId) return
    setLoading(true)
    fetch(`/api/admin/table-profiles/${profileId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((p) => {
        if (!p) return
        setName(p.name ?? '')
        setType(p.type ?? 'TABLE')
        setCapacity(String(p.capacity ?? 0))
        setWidth(String(p.width ?? 80))
        setDepth(String(p.depth ?? 80))
        setShape(p.shape ?? 'RECTANGLE')
        setColour(p.colour ?? '#e6c347')
        setChairCount(String(p.chairCount ?? 0))
        setSeatingDensity(p.seatingDensity != null ? String(p.seatingDensity) : '')
        setMaxHeadChairs(String(p.maxHeadChairs ?? 1))
        setTableNumbers(Array.isArray((p as any).tableNumbers) ? (p as any).tableNumbers.map(String) : [])
        const ec = (p as any).edgeChairs
        if (ec && typeof ec === 'object') setEdgeChairs({ t: ec.t ?? 0, b: ec.b ?? 0, l: ec.l ?? 0, r: ec.r ?? 0 })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [profileId])

  useEffect(() => {
    if (!isEditing || !profileId) return
    fetch(`/api/admin/table-profiles/${profileId}/bom`)
      .then((r) => r.ok ? r.json() : [])
      .then((items) => {
        const mapped = (Array.isArray(items) ? items : []).map((i: any) => ({
          id: i.id,
          inventoryItemId: i.inventoryItemId,
          inventoryItemName: i.item?.name ?? i.inventoryItemName,
          inventoryItemUnit: i.item?.unit ?? i.inventoryItemUnit,
          quantity: i.quantity,
          perChair: i.perChair,
        }))
        setBomItems(mapped)
      })
      .catch(() => {})
  }, [profileId, isEditing])

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
    setBomItems((prev) => prev.filter((b) => (b._clientId ?? b.id ?? b.inventoryItemId) !== clientId))
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
      tableNumbers: tableNumbers.length > 0 ? tableNumbers : null,
    }

    let targetId = profileId ?? ''

    if (isEditing) {
      const r = await fetch(`/api/admin/table-profiles/${profileId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) { setSaving(false); return }
    } else {
      const r = await fetch('/api/admin/table-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) { setSaving(false); return }
      const created = await r.json()
      targetId = created.id
    }

    if (targetId && bomItems.length > 0) {
      await fetch(`/api/admin/table-profiles/${targetId}/bom`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: bomItems }),
      })
    }

    setSaving(false)
    onSaved()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="font-mono text-xs text-grey-light uppercase">LOADING PROFILE...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-xs uppercase text-grey-light tracking-wider">
          {isEditing ? 'EDIT TABLE PROFILE' : 'NEW TABLE PROFILE'}
        </h2>
        <Button variant="ghost" size="sm" onClick={onCancel}>CANCEL</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="font-mono text-xs uppercase text-grey-light block mb-1">NAME</label>
          <Input value={name} onChange={(e) => setName(e.target.value.toUpperCase())} placeholder="TABLE PROFILE NAME" />
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
            <input
              type="color"
              value={colour}
              onChange={(e) => setColour(e.target.value)}
              className="w-8 h-8 border border-grey-mid cursor-pointer bg-transparent p-0"
            />
            <div className="w-6 h-6 border border-grey-mid flex-shrink-0" style={{ backgroundColor: colour || '#555' }} />
            <Input value={colour} onChange={(e) => setColour(e.target.value)} className="flex-1" />
          </div>
        </div>
      </div>

      <div>
        <label className="font-mono text-xs uppercase text-grey-light block mb-1">TABLE NUMBERS</label>
        <div className="flex flex-wrap gap-1 mb-1.5">
          {tableNumbers.map((n, i) => (
            <span key={i} className="inline-flex items-center gap-1 bg-grey-mid border border-grey-light px-1.5 py-0.5 font-mono text-[10px] text-white">
              {n}
              <button onClick={() => setTableNumbers(prev => prev.filter((_, j) => j !== i))}
                className="text-grey-light hover:text-danger">×</button>
            </span>
          ))}
        </div>
        <Input
          value={tagInput}
          onChange={(e) => {
            const v = e.target.value
            if (v.endsWith(',')) {
              const num = v.replace(/,/g, '').trim()
              if (num && !tableNumbers.includes(num)) setTableNumbers(prev => [...prev, num])
              setTagInput('')
            } else { setTagInput(v) }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              const num = tagInput.trim()
              if (num && !tableNumbers.includes(num)) setTableNumbers(prev => [...prev, num])
              setTagInput('')
            }
          }}
          placeholder="TYPE NUMBER, PRESS ENTER..."
        />
      </div>

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

      {/* Chair edge visual selector */}
      <div>
        <label className="font-mono text-xs uppercase text-grey-light block mb-2">CHAIR EDGES (CLICK EDGE TO ADD/REMOVE)</label>
        <div className="flex items-start gap-4">
          <div className="relative" style={{ width: Math.max(80, Math.min(200, (parseInt(width) || 80) * 0.5)), height: Math.max(80, Math.min(200, (parseInt(depth) || 80) * 0.5)) }}>
            {/* Top edge */}
            <button
              onClick={() => setEdgeChairs((prev) => ({ ...prev, t: prev.t + 1 }))}
              onContextMenu={(e) => { e.preventDefault(); setEdgeChairs((prev) => ({ ...prev, t: Math.max(0, prev.t - 1) })) }}
              className="absolute top-0 left-0 right-0 h-6 flex items-center justify-center gap-0.5 cursor-pointer hover:bg-white/5 border-t border-x border-grey-mid"
              style={{ backgroundColor: '#1a1a1a' }}
              title="LEFT CLICK: add chair · RIGHT CLICK: remove chair">
              {Array.from({ length: edgeChairs.t }, (_, i) => (
                <span key={i} className="w-2 h-4 border border-[#c4a530] bg-[#c4a530]/20" />
              ))}
            </button>
            {/* Bottom edge */}
            <button
              onClick={() => setEdgeChairs((prev) => ({ ...prev, b: prev.b + 1 }))}
              onContextMenu={(e) => { e.preventDefault(); setEdgeChairs((prev) => ({ ...prev, b: Math.max(0, prev.b - 1) })) }}
              className="absolute bottom-0 left-0 right-0 h-6 flex items-center justify-center gap-0.5 cursor-pointer hover:bg-white/5 border-b border-x border-grey-mid"
              style={{ backgroundColor: '#1a1a1a' }}
              title="LEFT CLICK: add chair · RIGHT CLICK: remove chair">
              {Array.from({ length: edgeChairs.b }, (_, i) => (
                <span key={i} className="w-2 h-4 border border-[#c4a530] bg-[#c4a530]/20" />
              ))}
            </button>
            {/* Left edge */}
            <button
              onClick={() => setEdgeChairs((prev) => ({ ...prev, l: prev.l + 1 }))}
              onContextMenu={(e) => { e.preventDefault(); setEdgeChairs((prev) => ({ ...prev, l: Math.max(0, prev.l - 1) })) }}
              className="absolute left-0 top-6 bottom-6 w-6 flex flex-col items-center justify-center gap-0.5 cursor-pointer hover:bg-white/5 border-l border-y border-grey-mid"
              style={{ backgroundColor: '#1a1a1a' }}
              title="LEFT CLICK: add chair · RIGHT CLICK: remove chair">
              {Array.from({ length: edgeChairs.l }, (_, i) => (
                <span key={i} className="h-2 w-4 border border-[#c4a530] bg-[#c4a530]/20" />
              ))}
            </button>
            {/* Right edge */}
            <button
              onClick={() => setEdgeChairs((prev) => ({ ...prev, r: prev.r + 1 }))}
              onContextMenu={(e) => { e.preventDefault(); setEdgeChairs((prev) => ({ ...prev, r: Math.max(0, prev.r - 1) })) }}
              className="absolute right-0 top-6 bottom-6 w-6 flex flex-col items-center justify-center gap-0.5 cursor-pointer hover:bg-white/5 border-r border-y border-grey-mid"
              style={{ backgroundColor: '#1a1a1a' }}
              title="LEFT CLICK: add chair · RIGHT CLICK: remove chair">
              {Array.from({ length: edgeChairs.r }, (_, i) => (
                <span key={i} className="h-2 w-4 border border-[#c4a530] bg-[#c4a530]/20" />
              ))}
            </button>
            {/* Table top surface */}
            <div className="absolute inset-6 flex items-center justify-center border border-grey-mid" style={{ backgroundColor: colour || '#e6c347' }}>
              <span className="font-mono text-[8px] text-black/70">{width}×{depth}</span>
            </div>
          </div>
          <div className="text-left font-mono text-[9px] text-grey-light space-y-0.5">
            <div>T: {edgeChairs.t} · B: {edgeChairs.b}</div>
            <div>L: {edgeChairs.l} · R: {edgeChairs.r}</div>
            <div className="text-white">TOTAL: {edgeChairs.t + edgeChairs.b + edgeChairs.l + edgeChairs.r}</div>
          </div>
        </div>
      </div>

      <div className="border border-grey-mid p-3 space-y-3">
        <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">
          BILL OF MATERIALS ({bomItems.length})
        </h3>

        {bomItems.length > 0 && (
          <div className="space-y-1">
            {bomItems.map((b) => {
              const cid = b._clientId ?? b.id ?? b.inventoryItemId ?? ''
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

        <div className="flex items-center gap-2 flex-wrap">
          <Select
            value={newBomItemId}
            onChange={(e) => setNewBomItemId(e.target.value)}
            options={inventoryItems.map((i) => ({ value: i.id, label: `${i.name} (${i.unit})` }))}
            placeholder="SELECT ITEM..."
            className="w-56"
          />
          <Input type="number" value={newBomQty} onChange={(e) => setNewBomQty(e.target.value)} className="w-16" />
          <button
            onClick={() => setNewBomPerChair(!newBomPerChair)}
            className={`font-mono text-xs px-2 py-1.5 border ${newBomPerChair ? 'border-success text-success' : 'border-grey-mid text-grey-light'}`}
          >
            PER CHAIR
          </button>
          <Button size="sm" onClick={handleAddBomItem}>+ ADD ITEM</Button>
        </div>
      </div>

      <div className="border-t border-grey-mid pt-3 flex items-center gap-2">
        <Button onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? 'SAVING...' : 'SAVE'}
        </Button>
        {isEditing && onDelete && (
          <Button variant="danger" onClick={onDelete}>DELETE</Button>
        )}
      </div>
    </div>
  )
}
