'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { FurnitureShapeEditor } from '@/components/admin/FurnitureShapeEditor'
import { pushToast } from '@/components/ui/Toast'
import type { FurnitureView } from '@hospo-ops/types'
import type { Vertex, FurnitureShape } from '@/lib/furniture'

/**
 * Create and edit a piece of furniture.
 *
 * This replaces TableProfileForm. That form wrote to a TableProfile while the
 * inventory page kept a parallel InventoryItem with the same name, and its
 * chair-edge designer was never included in the save body — so every edit to it
 * was silently discarded. Here there is one record and one save.
 */

interface InventoryItemView {
  id: string
  name: string
  unit: string
}

interface BomRow {
  inventoryItemId: string
  name?: string
  unit?: string
  quantity: number
  perChair: boolean
}

const FURNITURE_TYPES = [
  { value: 'TABLE', label: 'TABLE' },
  { value: 'BOOTH', label: 'BOOTH' },
  { value: 'SOFA', label: 'SOFA' },
  { value: 'BAR', label: 'BAR' },
  { value: 'CHAIR', label: 'CHAIR' },
  { value: 'OTHER', label: 'OTHER' },
]

const SHAPES = [
  { value: 'RECTANGLE', label: 'RECTANGLE' },
  { value: 'CIRCLE', label: 'ROUND' },
  { value: 'POLYGON', label: 'CUSTOM SHAPE' },
]

interface Props {
  furnitureId?: string | null
  onSaved: () => void
  onCancel: () => void
  onDeleted?: () => void
}

export function FurnitureForm({ furnitureId, onSaved, onCancel, onDeleted }: Props) {
  const isEditing = !!furnitureId

  const [name, setName] = useState('')
  const [furnitureType, setFurnitureType] = useState('TABLE')
  const [shape, setShape] = useState<FurnitureShape>('RECTANGLE')
  const [width, setWidth] = useState('120')
  const [depth, setDepth] = useState('60')
  const [vertices, setVertices] = useState<Vertex[] | null>(null)
  const [colour, setColour] = useState('#e6c347')
  const [totalQty, setTotalQty] = useState('0')
  const [defaultChairCount, setDefaultChairCount] = useState('0')
  const [seatingDensity, setSeatingDensity] = useState('60')
  const [maxHeadChairs, setMaxHeadChairs] = useState('1')
  const [chairItemId, setChairItemId] = useState('')
  const [tableNumbers, setTableNumbers] = useState<string[]>([])
  const [numberInput, setNumberInput] = useState('')
  const [bom, setBom] = useState<BomRow[]>([])
  const [newBomId, setNewBomId] = useState('')
  const [newBomQty, setNewBomQty] = useState('1')
  const [newBomPerChair, setNewBomPerChair] = useState(false)

  const [chairOptions, setChairOptions] = useState<FurnitureView[]>([])
  const [inventoryItems, setInventoryItems] = useState<InventoryItemView[]>([])
  const [loading, setLoading] = useState(isEditing)
  const [saving, setSaving] = useState(false)

  const isChair = furnitureType === 'CHAIR'

  useEffect(() => {
    fetch('/api/admin/furniture?type=CHAIR')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setChairOptions(Array.isArray(d) ? d : []))
      .catch(() => {})

    fetch('/api/admin/inventory')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setInventoryItems(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!furnitureId) return
    setLoading(true)
    fetch(`/api/admin/furniture/${furnitureId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((f: FurnitureView | null) => {
        if (!f) return
        setName(f.name)
        setFurnitureType(f.furnitureType)
        setShape((f.shape as FurnitureShape) ?? 'RECTANGLE')
        setWidth(String(Math.round(f.width)))
        setDepth(String(Math.round(f.depth)))
        setVertices(f.vertices)
        setColour(f.colour ?? '#e6c347')
        setTotalQty(String(f.totalQty))
        setDefaultChairCount(String(f.defaultChairCount))
        setSeatingDensity(f.seatingDensity != null ? String(f.seatingDensity) : '')
        setMaxHeadChairs(String(f.maxHeadChairs))
        setChairItemId(f.chairItemId ?? '')
        setTableNumbers(f.tableNumbers ?? [])
        setBom(
          f.bomItems.map((b) => ({
            inventoryItemId: b.inventoryItemId,
            quantity: b.quantity,
            perChair: b.perChair,
          })),
        )
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [furnitureId])

  function addNumber() {
    const n = numberInput.trim().toUpperCase()
    if (!n || tableNumbers.includes(n)) return
    setTableNumbers((prev) => [...prev, n])
    setNumberInput('')
  }

  function addBomRow() {
    if (!newBomId) return
    if (bom.some((b) => b.inventoryItemId === newBomId)) return
    const inv = inventoryItems.find((i) => i.id === newBomId)
    setBom((prev) => [
      ...prev,
      {
        inventoryItemId: newBomId,
        name: inv?.name,
        unit: inv?.unit,
        quantity: parseInt(newBomQty) || 1,
        perChair: newBomPerChair,
      },
    ])
    setNewBomId('')
    setNewBomQty('1')
    setNewBomPerChair(false)
  }

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)

    const body = {
      name: name.trim().toUpperCase(),
      furnitureType,
      shape,
      width: parseFloat(width) || 80,
      depth: parseFloat(depth) || 80,
      vertices: shape === 'POLYGON' ? vertices : null,
      colour,
      totalQty: parseInt(totalQty) || 0,
      defaultChairCount: parseInt(defaultChairCount) || 0,
      seatingDensity: seatingDensity ? parseFloat(seatingDensity) : null,
      maxHeadChairs: parseInt(maxHeadChairs) || 1,
      // A chair doesn't get seated by another chair.
      chairItemId: isChair ? null : chairItemId || null,
      tableNumbers,
      bomItems: bom,
    }

    const res = await fetch(
      isEditing ? `/api/admin/furniture/${furnitureId}` : '/api/admin/furniture',
      {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    )

    setSaving(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      pushToast(err.error ?? 'COULD NOT SAVE FURNITURE', 'error')
      return
    }
    onSaved()
  }

  async function handleDelete() {
    if (!furnitureId || !confirm('Delete this furniture?')) return
    const res = await fetch(`/api/admin/furniture/${furnitureId}`, { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      pushToast(err.error ?? 'COULD NOT DELETE', 'error')
      return
    }
    onDeleted?.()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="font-mono text-xs text-grey-light uppercase loading-cursor">LOADING</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── LEFT: identity + dimensions ── */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-mono text-[10px] uppercase text-grey-light block mb-1">NAME</label>
              <Input value={name} onChange={(e) => setName(e.target.value.toUpperCase())} placeholder="8-SEAT ROUND" />
            </div>
            <div>
              <label className="font-mono text-[10px] uppercase text-grey-light block mb-1">TYPE</label>
              <Select value={furnitureType} onChange={(e) => setFurnitureType(e.target.value)} options={FURNITURE_TYPES} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="font-mono text-[10px] uppercase text-grey-light block mb-1">SHAPE</label>
              <Select value={shape} onChange={(e) => setShape(e.target.value as FurnitureShape)} options={SHAPES} />
            </div>
            <div>
              <label className="font-mono text-[10px] uppercase text-grey-light block mb-1">WIDTH (CM)</label>
              <Input type="number" value={width} onChange={(e) => setWidth(e.target.value)} disabled={shape === 'POLYGON'} />
            </div>
            <div>
              <label className="font-mono text-[10px] uppercase text-grey-light block mb-1">DEPTH (CM)</label>
              <Input type="number" value={depth} onChange={(e) => setDepth(e.target.value)} disabled={shape === 'POLYGON'} />
            </div>
          </div>
          {shape === 'POLYGON' && (
            <p className="font-mono text-[9px] text-grey-light">
              SIZE IS TAKEN FROM THE SHAPE YOU DRAW
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-mono text-[10px] uppercase text-grey-light block mb-1">HOW MANY OWNED</label>
              <Input type="number" value={totalQty} onChange={(e) => setTotalQty(e.target.value)} />
            </div>
            <div>
              <label className="font-mono text-[10px] uppercase text-grey-light block mb-1">COLOUR</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={colour}
                  onChange={(e) => setColour(e.target.value)}
                  className="w-8 h-8 border border-grey-mid cursor-pointer bg-transparent p-0"
                />
                <Input value={colour} onChange={(e) => setColour(e.target.value)} className="flex-1" />
              </div>
            </div>
          </div>

          {!isChair && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="font-mono text-[10px] uppercase text-grey-light block mb-1">SEATS</label>
                  <Input type="number" value={defaultChairCount} onChange={(e) => setDefaultChairCount(e.target.value)} />
                </div>
                <div>
                  <label className="font-mono text-[10px] uppercase text-grey-light block mb-1">CM / CHAIR</label>
                  <Input type="number" value={seatingDensity} onChange={(e) => setSeatingDensity(e.target.value)} placeholder="60" />
                </div>
                <div>
                  <label className="font-mono text-[10px] uppercase text-grey-light block mb-1">MAX ON ENDS</label>
                  <Input type="number" value={maxHeadChairs} onChange={(e) => setMaxHeadChairs(e.target.value)} />
                </div>
              </div>

              <div>
                <label className="font-mono text-[10px] uppercase text-grey-light block mb-1">CHAIR TYPE</label>
                <Select
                  value={chairItemId}
                  onChange={(e) => setChairItemId(e.target.value)}
                  options={chairOptions.map((c) => ({
                    value: c.id,
                    label: `${c.name} (${Math.round(c.width)}×${Math.round(c.depth)}CM)`,
                  }))}
                  placeholder={chairOptions.length ? 'GENERIC CHAIR' : 'NO CHAIRS IN INVENTORY YET'}
                />
                <p className="font-mono text-[9px] text-grey-light mt-1">
                  DRAWN TO ITS REAL SIZE ON THE PLAN AND COUNTED AGAINST STOCK
                </p>
              </div>

              <div>
                <label className="font-mono text-[10px] uppercase text-grey-light block mb-1">TABLE NUMBERS</label>
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {tableNumbers.map((n, i) => (
                    <span key={n} className="inline-flex items-center gap-1 bg-grey-mid border border-grey-light px-1.5 py-0.5 font-mono text-[10px] text-white">
                      {n}
                      <button type="button" onClick={() => setTableNumbers((prev) => prev.filter((_, j) => j !== i))} className="text-grey-light hover:text-danger">×</button>
                    </span>
                  ))}
                </div>
                <Input
                  value={numberInput}
                  onChange={(e) => setNumberInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNumber() } }}
                  onBlur={addNumber}
                  placeholder="TYPE A NUMBER, PRESS ENTER..."
                />
                <p className="font-mono text-[9px] text-grey-light mt-1">
                  CLAIMED BY THE DEFAULT LAYOUT — EVENT LAYOUTS CAN OVERRIDE PER TABLE
                </p>
              </div>
            </>
          )}
        </div>

        {/* ── RIGHT: shape + chair preview ── */}
        <div>
          <FurnitureShapeEditor
            shape={shape}
            width={parseFloat(width) || 80}
            depth={parseFloat(depth) || 80}
            vertices={vertices}
            seatingDensity={seatingDensity ? parseFloat(seatingDensity) : null}
            maxHeadChairs={parseInt(maxHeadChairs) || 1}
            onChange={({ vertices: v, width: w, depth: d }) => {
              setVertices(v)
              setWidth(String(w))
              setDepth(String(d))
            }}
          />
        </div>
      </div>

      {/* ── BOM ── */}
      {!isChair && (
        <div className="border border-grey-mid p-3 space-y-3">
          <h3 className="font-mono text-[10px] uppercase text-grey-light tracking-wider">
            WHAT GOES ON IT ({bom.length})
          </h3>

          {bom.length > 0 && (
            <div className="space-y-1">
              {bom.map((b) => {
                const inv = inventoryItems.find((i) => i.id === b.inventoryItemId)
                return (
                  <div key={b.inventoryItemId} className="flex items-center gap-2 font-mono text-xs">
                    <span className="text-white flex-1 uppercase truncate">{b.name ?? inv?.name ?? b.inventoryItemId}</span>
                    <span className="text-grey-light">×{b.quantity}</span>
                    <span className={`text-[10px] ${b.perChair ? 'text-success' : 'text-grey-light'}`}>
                      {b.perChair ? 'PER CHAIR' : 'PER PIECE'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setBom((prev) => prev.filter((x) => x.inventoryItemId !== b.inventoryItemId))}
                      className="text-danger hover:text-white"
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <Select
              value={newBomId}
              onChange={(e) => setNewBomId(e.target.value)}
              options={inventoryItems
                .filter((i) => i.id !== furnitureId)
                .map((i) => ({ value: i.id, label: `${i.name} (${i.unit})` }))}
              placeholder="SELECT ITEM..."
              className="w-56"
            />
            <Input type="number" value={newBomQty} onChange={(e) => setNewBomQty(e.target.value)} className="w-16" />
            <button
              type="button"
              onClick={() => setNewBomPerChair(!newBomPerChair)}
              className={`font-mono text-xs px-2 py-1.5 border ${newBomPerChair ? 'border-success text-success' : 'border-grey-mid text-grey-light'}`}
            >
              PER CHAIR
            </button>
            <Button size="sm" onClick={addBomRow}>+ ADD</Button>
          </div>
        </div>
      )}

      <div className="border-t border-grey-mid pt-3 flex items-center gap-2">
        <Button onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? 'SAVING...' : 'SAVE'}
        </Button>
        <Button variant="ghost" onClick={onCancel}>CANCEL</Button>
        {isEditing && onDeleted && (
          <Button variant="danger" onClick={handleDelete}>DELETE</Button>
        )}
      </div>
    </div>
  )
}
