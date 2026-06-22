'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import {
  PALETTE_ITEMS,
  computeSectionSummary, type PaletteItem, type ElementData,
} from '@/components/admin/floorplan-elements'
import { ElementInventoryPanel } from '@/components/admin/ElementInventoryPanel'
import { FloorPlanPixiCanvas, type ViewState } from '@/components/admin/floorplan-pixi'

interface SectionZone {
  id: string
  x: number
  y: number
  width: number
  height: number
  sectionId: string
  label?: string
}

interface Section { id: string; name: string; colour: string | null; departmentId: string }

interface FullPlan {
  id: string; name: string; slug: string; isDefault: boolean
  roomWidth: number; roomDepth: number; gridUnit: number
}

function snap(v: number, unit: number) { return Math.round(v / unit) * unit }

function nextLabel(type: string, existing: ElementData[]): string {
  const map: Record<string, string> = { TABLE: 'T', CHAIR: 'C', BOOTH_BENCH: 'B' }
  const prefix = map[type]
  if (!prefix) return type
  const nums = existing.filter((e) => e.type === type).map((e) => {
    const m = (e.label ?? '').match(/^(\d+)$/)
    return m ? parseInt(m[1]) : 0
  })
  const max = nums.length > 0 ? Math.max(...nums) : 0
  return `${prefix}${max + 1}`
}

export function FloorPlanEditor({ plan, sections, onBack }: { plan: FullPlan; sections: Section[]; onBack: () => void }) {
  const [elements, setElements] = useState<ElementData[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(true)
  const [snapEnabled, setSnapEnabled] = useState(false)
  const [snap45Enabled, setSnap45Enabled] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [showInvTab, setShowInvTab] = useState(false)
  const [zones, setZones] = useState<SectionZone[]>([])
  const [zoneDrawing, setZoneDrawing] = useState(false)
  const [zoneDrawStart, setZoneDrawStart] = useState<{ x: number; y: number } | null>(null)
  const [zoneDrawRect, setZoneDrawRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [zoneSectionId, setZoneSectionId] = useState(sections[0]?.id ?? '')
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)
  const [customPresets, setCustomPresets] = useState<PaletteItem[]>([])
  const [presetFormOpen, setPresetFormOpen] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [presetW, setPresetW] = useState(80)
  const [presetD, setPresetD] = useState(80)
  const [presetFill, setPresetFill] = useState('#555')
  const [furnitureItems, setFurnitureItems] = useState<any[]>([])

  const INVENTORY_TYPES = ['TABLE', 'CHAIR', 'BOOTH_BENCH', 'BAR', 'COUNTER', 'SINK', 'STORAGE', 'KITCHEN_EQUIP']

  const containerRef = useRef<HTMLDivElement>(null)
  const nextIdCounter = useRef(1)
  const viewRef = useRef<ViewState>({ baseScale: 1, ox: 0, oy: 0, zoom: 1, panX: 0, panY: 0 })
  const [zoomLevel, setZoomLevel] = useState(1)

  const historyRef = useRef<{ past: ElementData[][]; future: ElementData[][] }>({ past: [], future: [] })

  function pushHistory() {
    historyRef.current.past.push(JSON.parse(JSON.stringify(elements)))
    historyRef.current.future = []
  }

  function undo() {
    const { past, future } = historyRef.current
    if (past.length === 0) return
    const prev = past.pop()!
    future.push(JSON.parse(JSON.stringify(elements)))
    setElements(prev)
  }

  function redo() {
    const { past, future } = historyRef.current
    if (future.length === 0) return
    const next = future.pop()!
    past.push(JSON.parse(JSON.stringify(elements)))
    setElements(next)
  }

  const [rebuildKey, setRebuildKey] = useState(0)

  useEffect(() => {
    const load = async () => {
      const r = await fetch(`/api/admin/floorplan/${plan.id}`)
      if (r.ok) {
        const data = await r.json()
        if (data.elements) {
          setElements(data.elements.map((el: any) => ({
            ...el,
            labelVisible: el.labelVisible ?? true,
            sortOrder: el.sortOrder ?? 0,
            isActive: el.isActive ?? true,
            chairCount: el.chairCount ?? 0,
          })))
          nextIdCounter.current = (data.elements.length || 0) + 1
        }
        if (data.zones) setZones(data.zones)
      }
      const furnRes = await fetch('/api/admin/inventory?furniture=true')
      if (furnRes.ok) setFurnitureItems(await furnRes.json())
      setLoading(false)
    }
    load()
  }, [plan.id])

  // ResizeObserver triggers rebuild via rebuildKey
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setRebuildKey((k) => k + 1))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const selected = elements.find((e) => e.id === selectedId) ?? null

  const sectionMap = new Map(sections.map((s) => [s.id, s]))

  function updateElement(id: string, patch: Partial<ElementData>) {
    setElements((prev) => prev.map((e) => e.id === id ? { ...e, ...patch } : e))
  }

  function deleteSelected() {
    if (!selectedId) return
    pushHistory()
    setElements((prev) => prev.filter((e) => e.id !== selectedId))
    setSelectedId(null)
  }

  function bringForward(id: string) {
    setElements((prev) => {
      const maxZ = Math.max(...prev.map((e) => e.zIndex), 0)
      return prev.map((e) => e.id === id ? { ...e, zIndex: maxZ + 1 } : e)
    })
  }

  function addFromPalette(item: PaletteItem, pos: { x: number; y: number }, furnItem?: any) {
    const id = `new_${nextIdCounter.current++}`
    const gu = plan.gridUnit
    const w = furnItem?.elementWidth ?? item.w
    const d = furnItem?.elementDepth ?? item.d
    const fill = furnItem?.defaultColour ?? item.fill
    const label = furnItem?.name ?? nextLabel(item.type, elements)
    const el: ElementData = {
      id,
      type: item.type,
      shape: furnItem?.elementShape ?? (item.circle ? 'CIRCLE' : 'RECTANGLE'),
      label,
      labelVisible: true,
      x: snapEnabled ? snap(pos.x - (item.circle ? 0 : w / 2), gu) : (pos.x - (item.circle ? 0 : w / 2)),
      y: snapEnabled ? snap(pos.y - (item.circle ? 0 : d / 2), gu) : (pos.y - (item.circle ? 0 : d / 2)),
      width: snapEnabled ? (snap(w, gu) || gu) : (w || gu),
      depth: snapEnabled ? (snap(d, gu) || gu) : (d || gu),
      radius: item.circle ? (snapEnabled ? snap(Math.min(w, d) / 2, gu) : Math.min(w, d) / 2) : null,
      rotation: 0,
      fillColour: fill,
      opacity: 1,
      zIndex: elements.length + 1,
      sortOrder: elements.length,
      isActive: true,
      style: null,
      chairCount: furnItem?.defaultChairCount ?? 0,
      _furnitureItemId: furnItem?.id ?? undefined,
    }
    pushHistory()
    setElements((prev) => [...prev, el])
    setSelectedId(id)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Delete') {
      if (selectedId) { e.preventDefault(); deleteSelected(); return }
      if (zoneDrawing && selectedZoneId) { e.preventDefault(); setZones((prev) => prev.filter((z) => z.id !== selectedZoneId)); setSelectedZoneId(null); return }
    }
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        redo()
      } else if (e.key === 'z') {
        e.preventDefault()
        undo()
      }
    }
  }

  async function handleSave() {
    setSaving(true)
    await fetch(`/api/admin/floorplan/${plan.id}/elements`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        elements: elements.map((el) => ({
          ...el,
          id: el.id?.startsWith('new_') ? undefined : el.id,
        })),
        zones: zones.length > 0 ? zones : undefined,
      }),
    })
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="font-mono text-sm text-grey-light loading-cursor">LOADING</p>
      </div>
    )
  }

  const summary = showSummary ? computeSectionSummary(elements, sections) : null

  return (
    <div tabIndex={0} onKeyDown={handleKeyDown} className="flex flex-col h-full outline-none">
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-grey-mid bg-black flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="font-mono text-xs uppercase text-grey-light hover:text-white">← BACK</button>
          <h1 className="font-mono text-sm font-bold uppercase tracking-widest text-white">{plan.name}</h1>
          <span className="font-mono text-[10px] text-grey-light">{plan.roomWidth}×{plan.roomDepth} cm · {plan.gridUnit} cm grid</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[10px] text-grey-light w-16 text-right">ZOOM: {Math.round(zoomLevel * 100)}%</span>
          <button onClick={() => setPaletteOpen(!paletteOpen)}
            className={`font-mono text-xs uppercase px-2 py-1 border ${paletteOpen ? 'border-white text-white' : 'border-grey-mid text-grey-light'} hover:border-white transition-colors`}>
            PALETTE
          </button>
          <label className="flex items-center gap-1 font-mono text-[10px] text-grey-light cursor-pointer select-none">
            <input type="checkbox" checked={snapEnabled} onChange={() => setSnapEnabled(!snapEnabled)} className="accent-white" />
            GRID
          </label>
          <label className="flex items-center gap-1 font-mono text-[10px] text-grey-light cursor-pointer select-none">
            <input type="checkbox" checked={snap45Enabled} onChange={() => setSnap45Enabled(!snap45Enabled)} className="accent-white" />
            45°
          </label>
          <button onClick={() => {
            if (zoneDrawing) { setZoneDrawing(false); setZoneDrawStart(null); setZoneDrawRect(null) }
            else { setZoneDrawing(true); setSelectedId(null) }
          }}
            className={`font-mono text-[10px] uppercase px-2 py-1 border ${zoneDrawing ? 'border-accent text-accent bg-accent/10' : 'border-grey-mid text-grey-light'} hover:border-accent transition-colors`}>
            SECTIONS {zoneDrawing ? '· ON' : ''}
          </button>
          <button onClick={() => setShowSummary(!showSummary)}
            className={`font-mono text-[10px] uppercase px-2 py-1 border ${showSummary ? 'border-success text-success' : 'border-grey-mid text-grey-light'} hover:border-success transition-colors`}>
            SUMMARY
          </button>
          <Button onClick={handleSave} loading={saving} size="sm">SAVE</Button>
          <button onClick={undo} className="font-mono text-xs uppercase text-grey-light hover:text-white border border-grey-mid px-2 py-1">↶</button>
          <button onClick={redo} className="font-mono text-xs uppercase text-grey-light hover:text-white border border-grey-mid px-2 py-1">↷</button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {paletteOpen && (
          <div className="w-44 flex-shrink-0 border-r border-grey-mid overflow-y-auto bg-grey-dark p-2 space-y-1">
            {(['FIXTURE', 'FURNITURE'] as const).map((cat) => {
              const items = [...PALETTE_ITEMS, ...customPresets].filter((i) => i.category === cat)
              if (items.length === 0) return null
              return (
                <div key={cat}>
                  <p className="font-mono text-[10px] text-grey-light uppercase tracking-wider px-1 pb-1 border-b border-grey-mid mt-2 first:mt-0">{cat}</p>
                  {items.map((item) => (
                    <div
                      key={item.type}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', item.type)
                        const dragImg = new globalThis.Image()
                        dragImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
                        e.dataTransfer.setDragImage(dragImg, 0, 0)
                      }}
                      className="flex items-center gap-2 p-1.5 cursor-grab hover:bg-grey-mid transition-colors"
                    >
                      <div className="w-4 h-4 flex-shrink-0 border border-grey-light" style={{ backgroundColor: item.fill }} />
                      <span className="font-mono text-[10px] text-white uppercase truncate">{item.label}</span>
                      <span className="font-mono text-[8px] text-grey-light ml-auto">{item.w}×{item.d}</span>
                    </div>
                  ))}
                </div>
              )
            })}
            {furnitureItems.length > 0 && (
              <div>
                <p className="font-mono text-[10px] text-grey-light uppercase tracking-wider px-1 pb-1 border-b border-grey-mid mt-2">INVENTORY</p>
                {furnitureItems.map((fi: any) => (
                  <div
                    key={`furn_${fi.id}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', `furn_${fi.id}`)
                      const dragImg = new globalThis.Image()
                      dragImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
                      e.dataTransfer.setDragImage(dragImg, 0, 0)
                    }}
                    className="flex items-center gap-2 p-1.5 cursor-grab hover:bg-grey-mid transition-colors"
                  >
                    <div className="w-4 h-4 flex-shrink-0 border border-grey-light" style={{ backgroundColor: fi.defaultColour ?? '#555' }} />
                    <span className="font-mono text-[10px] text-white truncate">{fi.name}</span>
                    <span className="font-mono text-[8px] text-grey-light ml-auto">{fi.elementWidth}×{fi.elementDepth}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t border-grey-mid pt-2 mt-2">
              {presetFormOpen ? (
                <div className="space-y-1 px-1">
                  <Input label="Name" value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="E.G. TABLE-60X60" />
                  <div className="grid grid-cols-2 gap-1">
                    <Input label="W" type="number" value={presetW.toString()} onChange={(e) => setPresetW(parseInt(e.target.value) || 80)} />
                    <Input label="D" type="number" value={presetD.toString()} onChange={(e) => setPresetD(parseInt(e.target.value) || 80)} />
                  </div>
                  <Input label="Colour" value={presetFill} onChange={(e) => setPresetFill(e.target.value)} placeholder="#555" />
                  <div className="flex gap-1">
                    <button onClick={() => {
                      if (!presetName.trim()) return
                      const p: PaletteItem = { type: presetName.toUpperCase().trim(), label: presetName.toUpperCase().trim(), w: presetW, d: presetD, fill: presetFill, category: 'FURNITURE' }
                      setCustomPresets((prev) => [...prev, p])
                      setPresetName(''); setPresetW(80); setPresetD(80); setPresetFill('#555')
                      setPresetFormOpen(false)
                    }}
                      className="font-mono text-[10px] text-success hover:text-white uppercase px-1.5 py-0.5 border border-success flex-1">
                      ADD
                    </button>
                    <button onClick={() => setPresetFormOpen(false)}
                      className="font-mono text-[10px] text-grey-light hover:text-white uppercase px-1.5 py-0.5">
                      CANCEL
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setPresetFormOpen(true)}
                  className="font-mono text-[10px] text-grey-light hover:text-white uppercase px-1.5 py-1 w-full text-left">
                  + ADD PRESET
                </button>
              )}
            </div>
          </div>
        )}

        <div
          ref={containerRef}
          className="flex-1 overflow-hidden bg-black"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const type = e.dataTransfer.getData('text/plain')
            const rect = containerRef.current!.getBoundingClientRect()
            const vs = viewRef.current
            const screenX = e.clientX - rect.left
            const screenY = e.clientY - rect.top
            const x = (screenX - vs.ox - vs.panX) / (vs.baseScale * vs.zoom)
            const y = (screenY - vs.oy - vs.panY) / (vs.baseScale * vs.zoom)
            if (type.startsWith('furn_')) {
              const fi = furnitureItems.find((f: any) => `furn_${f.id}` === type)
              if (!fi) return
              const paletteItem: PaletteItem = {
                type: fi.furnitureType ?? 'TABLE',
                label: fi.name,
                w: fi.elementWidth ?? 80,
                d: fi.elementDepth ?? 80,
                fill: fi.defaultColour ?? '#555',
                category: 'FURNITURE',
                circle: fi.elementShape === 'CIRCLE',
              }
              addFromPalette(paletteItem, { x, y }, fi)
              return
            }
            const item = [...PALETTE_ITEMS, ...customPresets].find((p) => p.type === type)
            if (!item) return
            addFromPalette(item, { x, y })
          }}
        >
          <FloorPlanPixiCanvas
            roomWidth={plan.roomWidth} roomDepth={plan.roomDepth} gridUnit={plan.gridUnit}
            elements={elements} zones={zones}
            selectedId={selectedId} snapEnabled={snapEnabled}
            sectionColours={new Map(sections.filter((s) => s.colour).map((s) => [s.id, s.colour!]))}
            zoneDrawing={zoneDrawing}
            zoneDrawStart={zoneDrawStart}
            zoneDrawRect={zoneDrawRect}
            selectedZoneId={selectedZoneId}
            containerRef={containerRef}
            viewRef={viewRef}
            onElementClick={(id) => setSelectedId(id)}
            onElementDragEnd={(id, x, y) => { pushHistory(); updateElement(id, { x, y }) }}
            onZoneClick={(id) => setSelectedZoneId(id)}
            onZoneDragEnd={(id, x, y) => setZones((prev) => prev.map((z) => z.id === id ? { ...z, x, y } : z))}
            onZoneDrawStart={(x, y) => {
              const gu = plan.gridUnit
              setZoneDrawStart({ x: snap(x, gu), y: snap(y, gu) }); setZoneDrawRect(null); setSelectedZoneId(null)
            }}
            onZoneDrawMove={(cx, cy) => {
              setZoneDrawStart((prev) => {
                if (!prev) return prev
                const gu = plan.gridUnit
                const sx = snap(cx, gu); const sy = snap(cy, gu)
                setZoneDrawRect({ x: Math.min(prev.x, sx), y: Math.min(prev.y, sy), w: Math.abs(sx - prev.x), h: Math.abs(sy - prev.y) })
                return prev
              })
            }}
            onZoneDrawEnd={(cx, cy) => {
              setZoneDrawStart((prev) => {
                if (!prev) { setZoneDrawRect(null); return prev }
                const gu = plan.gridUnit
                const sx = snap(cx, gu); const sy = snap(cy, gu)
                const w = Math.abs(sx - prev.x); const h = Math.abs(sy - prev.y)
                if (w > gu && h > gu) {
                  setZones((pz) => [...pz, { id: `zone_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, x: Math.min(prev.x, sx), y: Math.min(prev.y, sy), width: w, height: h, sectionId: zoneSectionId }])
                }
                setZoneDrawRect(null); setSelectedZoneId(null)
                return null
              })
            }}
            onViewChange={(z) => setZoomLevel(z)}
            rebuildKey={rebuildKey}
          />
        </div>

        {/* Right panel: properties or summary */}
        {showSummary && !selected && (
          <div className="w-64 flex-shrink-0 border-l border-grey-mid overflow-y-auto bg-grey-dark p-3">
            <h2 className="font-mono text-xs font-bold text-white uppercase tracking-wider mb-3">SECTION SUMMARY</h2>
            {summary && summary.entries.length === 0 && (
              <p className="font-mono text-[10px] text-grey-light">No elements placed yet.</p>
            )}
            {summary && summary.entries.map((entry) => (
              <div key={entry.sectionName} className="mb-3 pb-2 border-b border-grey-mid last:border-0">
                <div className="flex items-center gap-2 mb-1">
                  {entry.sectionColour && <div className="w-2 h-2 flex-shrink-0" style={{ backgroundColor: entry.sectionColour }} />}
                  <span className="font-mono text-xs text-white uppercase">{entry.sectionName}</span>
                </div>
                {Object.entries(entry.byType).map(([type, info]) => (
                  <div key={type}>
                    <div className="flex justify-between font-mono text-[10px] text-grey-light pl-3">
                      <span>{type}{info.totalCapacity > 0 ? ` (${info.totalCapacity} seats)` : ''}</span>
                      <span>×{info.count}</span>
                    </div>
                    {type === 'BOOTH_BENCH' && elements.filter((e) => e.type === 'BOOTH_BENCH').map((bench) => {
                      const served: string[] = (bench.style as any)?.servedTableIds ?? []
                      if (served.length === 0) return null
                      const tableLabels = served.map((tid) => {
                        const t = elements.find((e) => e.id === tid)
                        return t?.label || '?'
                      })
                      return (
                        <div key={bench.id} className="font-mono text-[9px] text-accent pl-5">
                          {bench.label || '?'} serves {tableLabels.join(', ')}
                        </div>
                      )
                    })}
                  </div>
                ))}
                <div className="flex justify-between font-mono text-[10px] text-white mt-1 pl-3">
                  <span>TOTAL</span>
                  <span>{entry.itemCount} items{entry.totalCapacity > 0 ? ` · ${entry.totalCapacity} seats` : ''}</span>
                </div>
              </div>
            ))}
            {summary && summary.entries.length > 0 && (
              <div className="pt-2 border-t border-grey-light">
                <div className="flex justify-between font-mono text-xs font-bold text-white">
                  <span>GRAND TOTAL</span>
                  <span>{summary.grandTotal.itemCount} items{summary.grandTotal.totalCapacity > 0 ? ` · ${summary.grandTotal.totalCapacity} seats` : ''}</span>
                </div>
                {Object.entries(summary.grandTotal.byType).map(([type, info]) => (
                  <div key={type} className="flex justify-between font-mono text-[10px] text-grey-light">
                    <span>{type}</span>
                    <span>×{info.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {zoneDrawing && !selected && (
          <div className="w-56 flex-shrink-0 border-l border-grey-mid overflow-y-auto bg-grey-dark p-3 space-y-3">
            <h2 className="font-mono text-xs font-bold text-white uppercase tracking-wider">SECTION ZONES</h2>
            <p className="font-mono text-[10px] text-grey-light">Drag on canvas to draw or move zones.</p>
            <Select label="Section" value={zoneSectionId}
              onChange={(e) => setZoneSectionId(e.target.value)}
              options={sections.map((s) => ({ value: s.id, label: s.name }))} />
            <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
              {zones.map((z) => {
                const sec = sectionMap.get(z.sectionId)
                return (
                  <div key={z.id} onClick={() => setSelectedZoneId(z.id)}
                    className={`flex items-center gap-2 p-1.5 cursor-pointer font-mono text-[10px] ${z.id === selectedZoneId ? 'bg-grey-mid text-white' : 'text-grey-light hover:text-white'}`}>
                    <div className="w-3 h-3 flex-shrink-0" style={{ backgroundColor: sec?.colour ?? '#666' }} />
                    <span className="truncate flex-1">{sec?.name ?? '?'}</span>
                    <span>{Math.round(z.width)}×{Math.round(z.height)}</span>
                  </div>
                )
              })}
              {zones.length === 0 && <p className="font-mono text-[10px] text-grey-light italic">No zones yet</p>}
            </div>
            {selectedZoneId && (() => {
              const z = zones.find((x) => x.id === selectedZoneId)
              if (!z) return null
              return (
                <div className="border-t border-grey-mid pt-2 space-y-2">
                  <Input label="X (cm)" type="number" value={Math.round(z.x).toString()}
                    onChange={(e) => setZones((prev) => prev.map((x) => x.id === z.id ? { ...x, x: parseFloat(e.target.value) || 0 } : x))}
                    onBlur={() => setZones((prev) => prev.map((x) => x.id === z.id ? { ...x, x: snap(x.x, plan.gridUnit) } : x))} />
                  <Input label="Y (cm)" type="number" value={Math.round(z.y).toString()}
                    onChange={(e) => setZones((prev) => prev.map((x) => x.id === z.id ? { ...x, y: parseFloat(e.target.value) || 0 } : x))}
                    onBlur={() => setZones((prev) => prev.map((x) => x.id === z.id ? { ...x, y: snap(x.y, plan.gridUnit) } : x))} />
                  <div className="grid grid-cols-2 gap-2">
                    <Input label="W" type="number" value={Math.round(z.width).toString()}
                      onChange={(e) => setZones((prev) => prev.map((x) => x.id === z.id ? { ...x, width: Math.max(parseFloat(e.target.value) || plan.gridUnit, plan.gridUnit) } : x))}
                      onBlur={() => setZones((prev) => prev.map((x) => x.id === z.id ? { ...x, width: Math.max(snap(x.width, plan.gridUnit), plan.gridUnit) } : x))} />
                    <Input label="H" type="number" value={Math.round(z.height).toString()}
                      onChange={(e) => setZones((prev) => prev.map((x) => x.id === z.id ? { ...x, height: Math.max(parseFloat(e.target.value) || plan.gridUnit, plan.gridUnit) } : x))}
                      onBlur={() => setZones((prev) => prev.map((x) => x.id === z.id ? { ...x, height: Math.max(snap(x.height, plan.gridUnit), plan.gridUnit) } : x))} />
                  </div>
                  <Select label="Section" value={z.sectionId}
                    onChange={(e) => setZones((prev) => prev.map((x) => x.id === z.id ? { ...x, sectionId: e.target.value } : x))}
                    options={sections.map((s) => ({ value: s.id, label: s.name }))} />
                  <button onClick={() => {
                    setZones((prev) => prev.filter((x) => x.id !== selectedZoneId))
                    setSelectedZoneId(null)
                  }}
                    className="font-mono text-[10px] text-danger hover:text-white uppercase border border-danger px-2 py-1 w-full">
                    DELETE ZONE
                  </button>
                </div>
              )
            })()}
          </div>
        )}

        {selected && (
          <div className="w-56 flex-shrink-0 border-l border-grey-mid overflow-y-auto bg-grey-dark p-3 space-y-3">
            <div className="flex items-center justify-between">
              <input value={selected.type}
                onChange={(e) => updateElement(selected.id!, { type: e.target.value.toUpperCase() || 'OTHER' })}
                className="font-mono text-xs font-bold text-white bg-transparent border-0 p-0 outline-none w-24" />
              <button onClick={deleteSelected}
                className="font-mono text-[10px] text-danger hover:text-white uppercase border border-danger px-1.5 py-0.5">
                DELETE
              </button>
            </div>

            {/* Tab buttons */}
            {INVENTORY_TYPES.includes(selected.type) && (
              <div className="flex border-b border-grey-mid -mx-3 px-3 pb-2">
                <button onClick={() => setShowInvTab(false)}
                  className={`font-mono text-[10px] uppercase px-2 py-1 ${!showInvTab ? 'border-b border-white text-white' : 'text-grey-light'}`}>
                  PROPERTIES
                </button>
                <button onClick={() => setShowInvTab(true)}
                  className={`font-mono text-[10px] uppercase px-2 py-1 ${showInvTab ? 'border-b border-white text-white' : 'text-grey-light'}`}>
                  INVENTORY
                </button>
              </div>
            )}

            {showInvTab && INVENTORY_TYPES.includes(selected.type) && selected.id ? (
              <ElementInventoryPanel elementId={selected.id} floorPlanId={plan.id} />
            ) : (
              <>
                <Input label="Label" value={selected.label ?? ''}
                  onChange={(e) => updateElement(selected.id!, { label: e.target.value.toUpperCase() || null })} />
                <label className="flex items-center gap-2 font-mono text-[10px] text-grey-light cursor-pointer select-none">
                  <input type="checkbox" checked={selected.labelVisible !== false}
                    onChange={(e) => updateElement(selected.id!, { labelVisible: e.target.checked })}
                    className="accent-white" />
                  SHOW LABEL
                </label>
                {selected.type === 'BOOTH_BENCH' && (
                  <div className="space-y-1">
                    <p className="font-mono text-[10px] text-grey-light uppercase">Serves Tables</p>
                    {elements.filter((e) => e.type === 'TABLE').map((t) => {
                      const served: string[] = (selected.style as any)?.servedTableIds ?? []
                      const checked = served.includes(t.id!)
                      return (
                        <label key={t.id} className="flex items-center gap-2 font-mono text-[10px] text-grey-light cursor-pointer select-none">
                          <input type="checkbox" checked={checked}
                            onChange={() => {
                              const s: string[] = [...served]
                              if (checked) {
                                const idx = s.indexOf(t.id!)
                                if (idx >= 0) s.splice(idx, 1)
                              } else {
                                s.push(t.id!)
                              }
                              updateElement(selected.id!, { style: { ...(selected.style ?? {}), servedTableIds: s } })
                            }}
                            className="accent-white" />
                          <span>{t.label || t.type}</span>
                        </label>
                      )
                    })}
                    {elements.filter((e) => e.type === 'TABLE').length === 0 && (
                      <p className="font-mono text-[10px] text-grey-light italic">No tables on plan</p>
                    )}
                  </div>
                )}
                <Input label="Fill Colour" value={selected.fillColour ?? ''}
                  onChange={(e) => updateElement(selected.id!, { fillColour: e.target.value || null })} placeholder="#555" />
                {selected.shape === 'RECTANGLE' && (
                  <div>
                    <p className="font-mono text-[10px] text-grey-light uppercase mb-1">Corner Radius</p>
                    <div className="grid grid-cols-4 gap-1">
                      {['TL', 'TR', 'BR', 'BL'].map((label, idx) => {
                        const cr: number[] = ((selected.style as any)?.cornerRadius) ?? [0, 0, 0, 0]
                        return (
                          <Input key={label} label={label} type="number" min="0" max={Math.min(selected.width, selected.depth) / 2}
                            value={cr[idx]?.toString() ?? '0'}
                            onChange={(e) => {
                              const next = [...cr]
                              next[idx] = Math.min(parseInt(e.target.value) || 0, Math.min(selected.width, selected.depth) / 2)
                              updateElement(selected.id!, { style: { ...(selected.style ?? {}), cornerRadius: next } })
                            }} />
                        )
                      })}
                    </div>
                  </div>
                )}
                <Select label="Section" value={selected.sectionId ?? ''}
                  onChange={(e) => updateElement(selected.id!, { sectionId: e.target.value || null })}
                  options={sections.map((s) => ({ value: s.id, label: s.name }))} placeholder="NONE" />
                <Input label="Capacity" type="number" value={selected.capacity?.toString() ?? ''}
                  onChange={(e) => updateElement(selected.id!, { capacity: e.target.value ? parseInt(e.target.value) : null })} />
                {selected.type === 'TABLE' && (
                  <Input label="Chair Count" type="number" min="0" value={(selected.chairCount ?? 0).toString()}
                    onChange={(e) => updateElement(selected.id!, { chairCount: parseInt(e.target.value) || 0 })} />
                )}
                <Input label="Z-Index" type="number" value={selected.zIndex.toString()}
                  onChange={(e) => updateElement(selected.id!, { zIndex: parseInt(e.target.value) || 0 })} />
                <div className="grid grid-cols-2 gap-2">
                  <Input label="X (cm)" type="number" value={Math.round(selected.x).toString()}
                    onChange={(e) => updateElement(selected.id!, { x: parseFloat(e.target.value) || 0 })} />
                  <Input label="Y (cm)" type="number" value={Math.round(selected.y).toString()}
                    onChange={(e) => updateElement(selected.id!, { y: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input label="Width (cm)" type="number" value={Math.round(selected.width).toString()}
                    onChange={(e) => updateElement(selected.id!, { width: parseFloat(e.target.value) || plan.gridUnit })} />
                  <Input label="Depth (cm)" type="number" value={Math.round(selected.depth).toString()}
                    onChange={(e) => updateElement(selected.id!, { depth: parseFloat(e.target.value) || plan.gridUnit })} />
                </div>
                <Input label="Rotation" type="number" value={Math.round(selected.rotation).toString()}
                  onChange={(e) => updateElement(selected.id!, { rotation: parseFloat(e.target.value) || 0 })} />
                <Input label="Opacity" type="number" min="0" max="1" step="0.1"
                  value={selected.opacity.toString()}
                  onChange={(e) => updateElement(selected.id!, { opacity: Math.min(1, Math.max(0, parseFloat(e.target.value) || 1)) })} />
                <div className="flex gap-2">
                  <button onClick={() => bringForward(selected.id!)}
                    className="font-mono text-[10px] text-grey-light hover:text-white uppercase border border-grey-mid px-2 py-1 flex-1">
                    BRING FWD
                  </button>
                  {selected.style !== undefined && (
                    <button onClick={() => updateElement(selected.id!, { style: null })}
                      className="font-mono text-[10px] text-grey-light hover:text-white uppercase border border-grey-mid px-2 py-1">
                      RESET STYLE
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
