'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import {
  PALETTE_ITEMS, isFixture, FloorPlanElementVisual,
  computeSectionSummary, type PaletteItem, type ElementData,
} from '@/components/admin/floorplan-elements'
import { ElementInventoryPanel } from '@/components/admin/ElementInventoryPanel'

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
  const [konvaReady, setKonvaReady] = useState(false)
  const [KC, setKC] = useState<{
    Stage: React.FC<any>; Layer: React.FC<any>; Rect: React.FC<any>
    Circle: React.FC<any>; Line: React.FC<any>; Text: React.FC<any>
    Group: React.FC<any>; Transformer: React.FC<any>
  } | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(true)
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [snap45Enabled, setSnap45Enabled] = useState(false)
  const [showSections, setShowSections] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [showInvTab, setShowInvTab] = useState(false)

  const INVENTORY_TYPES = ['TABLE', 'CHAIR', 'BOOTH_BENCH', 'BAR', 'COUNTER', 'SINK', 'STORAGE', 'KITCHEN_EQUIP']

  const stageRef = useRef<any>(null)
  const transformerRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const nextIdCounter = useRef(1)

  const CANVAS_PAD = 40
  const [stageSize, setStageSize] = useState({ w: 800, h: 600 })

  useEffect(() => {
    import('react-konva').then((RK) => {
      setKC({
        Stage: RK.Stage, Layer: RK.Layer, Rect: RK.Rect, Circle: RK.Circle,
        Line: RK.Line, Text: RK.Text, Group: RK.Group, Transformer: RK.Transformer,
      })
      setKonvaReady(true)
    })
  }, [])

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
          })))
          nextIdCounter.current = (data.elements.length || 0) + 1
        }
      }
      setLoading(false)
    }
    load()
  }, [plan.id])

  useEffect(() => {
    if (!containerRef.current) return
    const resize = () => {
      const parent = containerRef.current!.parentElement!
      const w = Math.min(parent.clientWidth - 2, 1200)
      const h = Math.min(window.innerHeight - 200, 700)
      setStageSize({ w, h })
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  useEffect(() => {
    if (!transformerRef.current || !selectedId) { transformerRef.current?.nodes([]); return }
    const stage = stageRef.current
    if (!stage) return
    const selectedNode = stage.findOne(`#${selectedId}`)
    if (selectedNode) transformerRef.current.nodes([selectedNode])
    else transformerRef.current.nodes([])
    transformerRef.current.getLayer()?.batchDraw()
  }, [selectedId, elements, konvaReady])

  const selected = elements.find((e) => e.id === selectedId) ?? null

  const sectionMap = new Map(sections.map((s) => [s.id, s]))

  function updateElement(id: string, patch: Partial<ElementData>) {
    setElements((prev) => prev.map((e) => e.id === id ? { ...e, ...patch } : e))
  }

  function deleteSelected() {
    if (!selectedId) return
    setElements((prev) => prev.filter((e) => e.id !== selectedId))
    setSelectedId(null)
  }

  function bringForward(id: string) {
    setElements((prev) => {
      const maxZ = Math.max(...prev.map((e) => e.zIndex), 0)
      return prev.map((e) => e.id === id ? { ...e, zIndex: maxZ + 1 } : e)
    })
  }

  function addFromPalette(item: PaletteItem, pos: { x: number; y: number }) {
    const id = `new_${nextIdCounter.current++}`
    const gu = plan.gridUnit
    const label = nextLabel(item.type, elements)
    const el: ElementData = {
      id,
      type: item.type,
      shape: item.circle ? 'CIRCLE' : 'RECTANGLE',
      label,
      labelVisible: true,
      x: snap(pos.x, gu) - (item.circle ? 0 : snap(item.w / 2, gu)),
      y: snap(pos.y, gu) - (item.circle ? 0 : snap(item.d / 2, gu)),
      width: snap(item.w, gu) || gu,
      depth: snap(item.d, gu) || gu,
      radius: item.circle ? snap(Math.min(item.w, item.d) / 2, gu) : null,
      rotation: 0,
      fillColour: item.fill,
      opacity: 1,
      zIndex: elements.length + 1,
      sortOrder: elements.length,
      isActive: true,
      style: null,
    }
    setElements((prev) => [...prev, el])
    setSelectedId(id)
  }

  function handleStageClick(e: any) {
    if (e.target === e.target.getStage()) setSelectedId(null)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
      e.preventDefault()
      deleteSelected()
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
      }),
    })
    setSaving(false)
  }

  function handleExportPNG() {
    const stage = stageRef.current
    if (!stage) return
    const uri = stage.toDataURL({ mimeType: 'image/png', pixelRatio: 2 })
    const a = document.createElement('a')
    a.download = `${plan.slug}.png`
    a.href = uri
    a.click()
  }

  const scale = Math.min(
    (stageSize.w - CANVAS_PAD * 2) / plan.roomWidth,
    (stageSize.h - CANVAS_PAD * 2) / plan.roomDepth,
  )
  const offsetX = (stageSize.w - plan.roomWidth * scale) / 2
  const offsetY = (stageSize.h - plan.roomDepth * scale) / 2

  if (loading || !konvaReady || !KC) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="font-mono text-sm text-grey-light loading-cursor">LOADING</p>
      </div>
    )
  }

  const { Stage, Layer, Rect, Circle, Line, Text, Group, Transformer } = KC

  const isSelectedFixture = selected ? isFixture(selected.type) : true

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
          <button onClick={() => setShowSections(!showSections)}
            className={`font-mono text-[10px] uppercase px-2 py-1 border ${showSections ? 'border-accent text-accent' : 'border-grey-mid text-grey-light'} hover:border-accent transition-colors`}>
            SECTIONS
          </button>
          <button onClick={() => setShowSummary(!showSummary)}
            className={`font-mono text-[10px] uppercase px-2 py-1 border ${showSummary ? 'border-success text-success' : 'border-grey-mid text-grey-light'} hover:border-success transition-colors`}>
            SUMMARY
          </button>
          <Button onClick={handleSave} loading={saving} size="sm">SAVE</Button>
          <Button onClick={handleExportPNG} variant="ghost" size="sm">EXPORT PNG</Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {paletteOpen && (
          <div className="w-44 flex-shrink-0 border-r border-grey-mid overflow-y-auto bg-grey-dark p-2 space-y-1">
            <p className="font-mono text-[10px] text-grey-light uppercase tracking-wider px-1 pb-1 border-b border-grey-mid">ELEMENTS</p>
            {PALETTE_ITEMS.map((item) => (
              <div
                key={item.type}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', item.type)
                  const dragImg = new globalThis.Image()
                  dragImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
                  e.dataTransfer.setDragImage(dragImg, 0, 0)
                }}
                onDragEnd={() => {}}
                className="flex items-center gap-2 p-1.5 cursor-grab hover:bg-grey-mid transition-colors"
              >
                <div className="w-4 h-4 flex-shrink-0 border border-grey-light" style={{ backgroundColor: item.fill }} />
                <span className="font-mono text-[10px] text-white uppercase truncate">{item.label}</span>
              </div>
            ))}
          </div>
        )}

        <div
          ref={containerRef}
          className="flex-1 overflow-hidden bg-black"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const type = e.dataTransfer.getData('text/plain')
            const item = PALETTE_ITEMS.find((p) => p.type === type)
            if (!item) return
            const rect = containerRef.current!.getBoundingClientRect()
            const x = (e.clientX - rect.left - offsetX) / scale
            const y = (e.clientY - rect.top - offsetY) / scale
            addFromPalette(item, { x, y })
          }}
        >
          <Stage ref={stageRef} width={stageSize.w} height={stageSize.h}
            onClick={handleStageClick} onTap={handleStageClick}
            onMouseDown={(e: any) => { if (e.target === e.target.getStage()) setSelectedId(null) }}>
            <Layer>
              <Rect x={offsetX} y={offsetY} width={plan.roomWidth * scale} height={plan.roomDepth * scale}
                fill="#1A1A1A" stroke="#4A4A4A" strokeWidth={2} listening={false} />

              {snapEnabled && Array.from({ length: Math.floor(plan.roomDepth / plan.gridUnit) + 1 }).map((_, i) => (
                <Rect key={`h${i}`} x={offsetX} y={offsetY + i * plan.gridUnit * scale}
                  width={plan.roomWidth * scale} height={1} fill="#2E2E2E" listening={false} />
              ))}
              {snapEnabled && Array.from({ length: Math.floor(plan.roomWidth / plan.gridUnit) + 1 }).map((_, i) => (
                <Rect key={`v${i}`} x={offsetX + i * plan.gridUnit * scale} y={offsetY}
                  width={1} height={plan.roomDepth * scale} fill="#2E2E2E" listening={false} />
              ))}

              {elements.sort((a, b) => a.zIndex - b.zIndex).map((el) => {
                const isSel = el.id === selectedId
                const sec = el.sectionId ? sectionMap.get(el.sectionId) : null
                const sectionColour = sec?.colour ?? null
                const kx = offsetX + el.x * scale
                const ky = offsetY + el.y * scale

                const visual = (
                  <FloorPlanElementVisual
                    el={el} KC={KC} scale={scale} offsetX={offsetX} offsetY={offsetY}
                    isSelected={isSel} sectionColour={sectionColour}
                    showSectionOverlay={showSections} />
                )

                if (el.shape === 'POLYGON') {
                  return <Group key={el.id} id={el.id}>{visual}</Group>
                }

                if (el.shape === 'CIRCLE') {
                  return (
                    <Group key={el.id} id={el.id}
                      draggable onClick={() => setSelectedId(el.id ?? null)} onTap={() => setSelectedId(el.id ?? null)}
                      onDragEnd={(e: any) => {
                        const gu = plan.gridUnit
                        const nx = snap((e.target.x() - offsetX) / scale, gu)
                        const ny = snap((e.target.y() - offsetY) / scale, gu)
                        updateElement(el.id!, { x: nx, y: ny })
                        e.target.x(offsetX + nx * scale)
                        e.target.y(offsetY + ny * scale)
                      }}>
                      {visual}
                    </Group>
                  )
                }

                return (
                  <Group key={el.id} id={el.id} x={kx} y={ky} rotation={el.rotation}
                    draggable
                    onClick={() => setSelectedId(el.id ?? null)} onTap={() => setSelectedId(el.id ?? null)}
                    onDragEnd={(e: any) => {
                      const gu = plan.gridUnit
                      const nx = snap((e.target.x() - offsetX) / scale, gu)
                      const ny = snap((e.target.y() - offsetY) / scale, gu)
                      const nr = e.target.rotation()
                      updateElement(el.id!, { x: nx, y: ny, rotation: nr })
                      e.target.x(offsetX + nx * scale)
                      e.target.y(offsetY + ny * scale)
                    }}>
                    {visual}
                  </Group>
                )
              })}

              <Transformer
                ref={transformerRef}
                rotateEnabled={true}
                rotationSnaps={snap45Enabled ? [0, 45, 90, 135, 180, 225, 270, 315] : undefined}
                enabledAnchors={isSelectedFixture
                  ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
                  : []}
                boundBoxFunc={(oldBox: any, newBox: any) => {
                  if (newBox.width < 10 || newBox.height < 10) return oldBox
                  return newBox
                }}
                onTransformEnd={(e: any) => {
                  if (!selectedId) return
                  const node = stageRef.current?.findOne(`#${selectedId}`)
                  if (!node) return
                  const gu = plan.gridUnit
                  updateElement(selectedId, {
                    x: snap((node.x() - offsetX) / scale, gu),
                    y: snap((node.y() - offsetY) / scale, gu),
                    width: snap(node.width() / scale, gu) || gu,
                    depth: snap(node.height() / scale, gu) || gu,
                    rotation: node.rotation(),
                  })
                }}
              />
            </Layer>
          </Stage>
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
                  <div key={type} className="flex justify-between font-mono text-[10px] text-grey-light pl-3">
                    <span>{type}{info.totalCapacity > 0 ? ` (${info.totalCapacity} seats)` : ''}</span>
                    <span>×{info.count}</span>
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

        {selected && (
          <div className="w-56 flex-shrink-0 border-l border-grey-mid overflow-y-auto bg-grey-dark p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-white">{selected.type}</span>
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
                <Input label="Fill Colour" value={selected.fillColour ?? ''}
                  onChange={(e) => updateElement(selected.id!, { fillColour: e.target.value || null })} placeholder="#555" />
                <Select label="Section" value={selected.sectionId ?? ''}
                  onChange={(e) => updateElement(selected.id!, { sectionId: e.target.value || null })}
                  options={sections.map((s) => ({ value: s.id, label: s.name }))} placeholder="NONE" />
                <Input label="Capacity" type="number" value={selected.capacity?.toString() ?? ''}
                  onChange={(e) => updateElement(selected.id!, { capacity: e.target.value ? parseInt(e.target.value) : null })} />
                <Input label="Z-Index" type="number" value={selected.zIndex.toString()}
                  onChange={(e) => updateElement(selected.id!, { zIndex: parseInt(e.target.value) || 0 })} />
                <div className="grid grid-cols-2 gap-2">
                  <Input label="X (cm)" type="number" value={Math.round(selected.x).toString()}
                    onChange={(e) => updateElement(selected.id!, { x: parseFloat(e.target.value) || 0 })} />
                  <Input label="Y (cm)" type="number" value={Math.round(selected.y).toString()}
                    onChange={(e) => updateElement(selected.id!, { y: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Input label="Width (cm)" type="number" value={Math.round(selected.width).toString()}
                      onChange={(e) => updateElement(selected.id!, { width: parseFloat(e.target.value) || plan.gridUnit })}
                      disabled={!isSelectedFixture} />
                    {!isSelectedFixture && <p className="font-mono text-[8px] text-grey-light mt-0.5">FIXED SIZE</p>}
                  </div>
                  <div>
                    <Input label="Depth (cm)" type="number" value={Math.round(selected.depth).toString()}
                      onChange={(e) => updateElement(selected.id!, { depth: parseFloat(e.target.value) || plan.gridUnit })}
                      disabled={!isSelectedFixture} />
                    {!isSelectedFixture && <p className="font-mono text-[8px] text-grey-light mt-0.5">FIXED SIZE</p>}
                  </div>
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
