'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'

interface Section { id: string; name: string; colour: string | null; departmentId: string }

interface ElementData {
  id?: string
  type: string; shape: string
  label?: string | null
  x: number; y: number
  width: number; depth: number
  radius?: number | null
  vertices?: { x: number; y: number }[] | null
  rotation: number
  colour?: string | null
  fillColour?: string | null
  opacity: number; zIndex: number
  sectionId?: string | null
  capacity?: number | null
  sortOrder: number; isActive: boolean
}

interface FullPlan {
  id: string; name: string; slug: string; isDefault: boolean
  roomWidth: number; roomDepth: number; gridUnit: number
}

const PALETTE_ITEMS = [
  { type: 'WALL', label: 'WALL', w: 200, d: 10, fill: '#4A4A4A' },
  { type: 'DOOR', label: 'DOOR', w: 10, d: 80, fill: '#6B4226' },
  { type: 'WINDOW', label: 'WINDOW', w: 10, d: 60, fill: '#87CEEB' },
  { type: 'TABLE', label: 'TABLE', w: 80, d: 80, fill: '#2A2A2A' },
  { type: 'CHAIR', label: 'CHAIR', w: 30, d: 30, fill: '#3A3A3A' },
  { type: 'COUNTER', label: 'COUNTER', w: 120, d: 40, fill: '#5C4033' },
  { type: 'BAR', label: 'BAR', w: 160, d: 50, fill: '#8B4513' },
  { type: 'SINK', label: 'SINK', w: 50, d: 40, fill: '#B0C4DE' },
  { type: 'KITCHEN_EQUIP', label: 'KITCHEN EQUIP', w: 70, d: 60, fill: '#555' },
  { type: 'STORAGE', label: 'STORAGE', w: 60, d: 60, fill: '#666' },
  { type: 'ENTRY', label: 'ENTRY', w: 20, d: 90, fill: '#556B2F' },
  { type: 'EXIT', label: 'EXIT', w: 20, d: 90, fill: '#8B0000' },
  { type: 'STAIRS', label: 'STAIRS', w: 80, d: 30, fill: '#808080' },
  { type: 'TOILET', label: 'TOILET', w: 50, d: 50, fill: '#4682B4' },
  { type: 'PLANT', label: 'PLANT', w: 20, d: 20, circle: true, fill: '#228B22' },
  { type: 'OTHER', label: 'OTHER', w: 50, d: 50, fill: '#6B6B6B' },
]

function snap(v: number, unit: number) { return Math.round(v / unit) * unit }

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
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [draggingFromPalette, setDraggingFromPalette] = useState<typeof PALETTE_ITEMS[0] | null>(null)
  const [snapEnabled, setSnapEnabled] = useState(true)

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
          setElements(data.elements.map((el: any) => ({ ...el, sortOrder: el.sortOrder ?? 0, isActive: el.isActive ?? true })))
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

  function addFromPalette(item: typeof PALETTE_ITEMS[0], pos: { x: number; y: number }) {
    const id = `new_${nextIdCounter.current++}`
    const gu = plan.gridUnit
    const el: ElementData = {
      id,
      type: item.type,
      shape: item.circle ? 'CIRCLE' : 'RECTANGLE',
      label: item.label,
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
    }
    setElements((prev) => [...prev, el])
    setSelectedId(id)
  }

  function handleStageClick(e: any) {
    if (e.target === e.target.getStage()) setSelectedId(null)
  }

  async function handleSave() {
    setSaving(true)
    await fetch(`/api/admin/floorplan/${plan.id}/elements`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ elements: elements.map((el) => ({ ...el, id: el.id?.startsWith('new_') ? undefined : el.id })) }),
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
    (stageSize.h - CANVAS_PAD * 2) / plan.roomDepth
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

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-grey-mid bg-black flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="font-mono text-xs uppercase text-grey-light hover:text-white">← BACK</button>
          <h1 className="font-mono text-sm font-bold uppercase tracking-widest text-white">{plan.name}</h1>
          <span className="font-mono text-[10px] text-grey-light">{plan.roomWidth}×{plan.roomDepth} cm · {plan.gridUnit} cm grid</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setPaletteOpen(!paletteOpen)} className={`font-mono text-xs uppercase px-2 py-1 border ${paletteOpen ? 'border-white text-white' : 'border-grey-mid text-grey-light'} hover:border-white transition-colors`}>PALETTE</button>
          <label className="flex items-center gap-1 font-mono text-[10px] text-grey-light cursor-pointer">
            <input type="checkbox" checked={snapEnabled} onChange={() => setSnapEnabled(!snapEnabled)} className="accent-white" />
            SNAP
          </label>
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
                onDragStart={(e) => { setDraggingFromPalette(item); e.dataTransfer.setData('text/plain', item.type) }}
                onDragEnd={() => setDraggingFromPalette(null)}
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
            if (!draggingFromPalette) return
            const rect = containerRef.current!.getBoundingClientRect()
            const x = (e.clientX - rect.left - offsetX) / scale
            const y = (e.clientY - rect.top - offsetY) / scale
            addFromPalette(draggingFromPalette, { x, y })
            setDraggingFromPalette(null)
          }}
        >
          <Stage ref={stageRef} width={stageSize.w} height={stageSize.h} onClick={handleStageClick} onTap={handleStageClick} onMouseDown={(e: any) => { if (e.target === e.target.getStage()) setSelectedId(null) }}>
            <Layer>
              <Rect x={offsetX} y={offsetY} width={plan.roomWidth * scale} height={plan.roomDepth * scale} fill="#1A1A1A" stroke="#4A4A4A" strokeWidth={2} listening={false} />

              {snapEnabled && Array.from({ length: Math.floor(plan.roomDepth / plan.gridUnit) + 1 }).map((_, i) => (
                <Rect key={`h${i}`} x={offsetX} y={offsetY + i * plan.gridUnit * scale} width={plan.roomWidth * scale} height={1} fill="#2E2E2E" listening={false} />
              ))}
              {snapEnabled && Array.from({ length: Math.floor(plan.roomWidth / plan.gridUnit) + 1 }).map((_, i) => (
                <Rect key={`v${i}`} x={offsetX + i * plan.gridUnit * scale} y={offsetY} width={1} height={plan.roomDepth * scale} fill="#2E2E2E" listening={false} />
              ))}

              {elements.sort((a, b) => a.zIndex - b.zIndex).map((el) => {
                const kx = offsetX + el.x * scale
                const ky = offsetY + el.y * scale
                const kw = el.width * scale
                const kd = el.depth * scale
                const isSelected = el.id === selectedId

                if (el.shape === 'CIRCLE') {
                  const r = (el.radius ?? Math.min(el.width, el.depth) / 2) * scale
                  return <Circle key={el.id} id={el.id} x={kx} y={ky} radius={r} fill={el.fillColour ?? '#555'} stroke={isSelected ? '#FFF' : '#444'} strokeWidth={isSelected ? 2 : 1} opacity={el.opacity} draggable onClick={() => setSelectedId(el.id ?? null)} onTap={() => setSelectedId(el.id ?? null)} onDragEnd={(e: any) => { const gu = plan.gridUnit; const nx = snap((e.target.x() - offsetX) / scale, gu); const ny = snap((e.target.y() - offsetY) / scale, gu); updateElement(el.id!, { x: nx, y: ny }); e.target.x(offsetX + nx * scale); e.target.y(offsetY + ny * scale) }} />
                }

                if (el.shape === 'POLYGON' && el.vertices) {
                  const pts = el.vertices.flatMap((v) => [offsetX + (el.x + v.x) * scale, offsetY + (el.y + v.y) * scale])
                  return <Line key={el.id} id={el.id} points={pts} closed fill={el.fillColour ?? '#555'} stroke={isSelected ? '#FFF' : '#444'} strokeWidth={isSelected ? 2 : 1} opacity={el.opacity} />
                }

                return (
                  <Group key={el.id} id={el.id} x={kx} y={ky} rotation={el.rotation} offsetX={0} offsetY={0} draggable onClick={() => setSelectedId(el.id ?? null)} onTap={() => setSelectedId(el.id ?? null)} onDragEnd={(e: any) => { const gu = plan.gridUnit; const nx = snap((e.target.x() - offsetX) / scale, gu); const ny = snap((e.target.y() - offsetY) / scale, gu); const nr = e.target.rotation(); updateElement(el.id!, { x: nx, y: ny, rotation: nr }); e.target.x(offsetX + nx * scale); e.target.y(offsetY + ny * scale) }}>
                    <Rect width={kw} height={kd} fill={el.fillColour ?? '#555'} stroke={isSelected ? '#FFF' : '#444'} strokeWidth={isSelected ? 2 : 1} opacity={el.opacity} />
                    {el.label && <Text x={2} y={2} text={el.label} fontSize={8} fill="#FFF" listening={false} />}
                  </Group>
                )
              })}

              <Transformer ref={transformerRef} rotateEnabled={true} enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']} boundBoxFunc={(oldBox: any, newBox: any) => { if (newBox.width < 10 || newBox.height < 10) return oldBox; return newBox }} onTransformEnd={(e: any) => {
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
              }} />
            </Layer>
          </Stage>
        </div>

        {selected && (
          <div className="w-56 flex-shrink-0 border-l border-grey-mid overflow-y-auto bg-grey-dark p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-white">{selected.type}</span>
              <button onClick={deleteSelected} className="font-mono text-[10px] text-danger hover:text-white">DELETE</button>
            </div>
            <Input label="Label" value={selected.label ?? ''} onChange={(e) => updateElement(selected.id!, { label: e.target.value.toUpperCase() || null })} />
            <Input label="Fill Colour" value={selected.fillColour ?? ''} onChange={(e) => updateElement(selected.id!, { fillColour: e.target.value || null })} placeholder="#555" />
            <Select label="Section" value={selected.sectionId ?? ''} onChange={(e) => updateElement(selected.id!, { sectionId: e.target.value || null })} options={sections.map((s) => ({ value: s.id, label: s.name }))} placeholder="NONE" />
            <Input label="Capacity" type="number" value={selected.capacity?.toString() ?? ''} onChange={(e) => updateElement(selected.id!, { capacity: e.target.value ? parseInt(e.target.value) : null })} />
            <Input label="Z-Index" type="number" value={selected.zIndex.toString()} onChange={(e) => updateElement(selected.id!, { zIndex: parseInt(e.target.value) || 0 })} />
            <div className="grid grid-cols-2 gap-2">
              <Input label="X (cm)" type="number" value={Math.round(selected.x).toString()} onChange={(e) => updateElement(selected.id!, { x: parseFloat(e.target.value) || 0 })} />
              <Input label="Y (cm)" type="number" value={Math.round(selected.y).toString()} onChange={(e) => updateElement(selected.id!, { y: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input label="Width (cm)" type="number" value={Math.round(selected.width).toString()} onChange={(e) => updateElement(selected.id!, { width: parseFloat(e.target.value) || plan.gridUnit })} />
              <Input label="Depth (cm)" type="number" value={Math.round(selected.depth).toString()} onChange={(e) => updateElement(selected.id!, { depth: parseFloat(e.target.value) || plan.gridUnit })} />
            </div>
            <Input label="Rotation" type="number" value={Math.round(selected.rotation).toString()} onChange={(e) => updateElement(selected.id!, { rotation: parseFloat(e.target.value) || 0 })} />
            <Input label="Opacity" type="number" min="0" max="1" step="0.1" value={selected.opacity.toString()} onChange={(e) => updateElement(selected.id!, { opacity: Math.min(1, Math.max(0, parseFloat(e.target.value) || 1)) })} />
            <button onClick={() => bringForward(selected.id!)} className="font-mono text-[10px] text-grey-light hover:text-white uppercase">BRING FORWARD</button>
          </div>
        )}
      </div>
    </div>
  )
}
