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
import type { Vertex } from '@hospo-ops/types'

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
  const [konvaReady, setKonvaReady] = useState(false)
  const [KC, setKC] = useState<{
    Stage: React.FC<any>; Layer: React.FC<any>; Rect: React.FC<any>
    Circle: React.FC<any>; Line: React.FC<any>; Text: React.FC<any>
    Group: React.FC<any>; Transformer: React.FC<any>; Shape: React.FC<any>
  } | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(true)
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [snap45Enabled, setSnap45Enabled] = useState(false)
  const [showSections, setShowSections] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [showInvTab, setShowInvTab] = useState(false)
  const [penActive, setPenActive] = useState(false)
  const [penVertices, setPenVertices] = useState<Vertex[]>([])
  const [penDragStart, setPenDragStart] = useState<{ x: number; y: number } | null>(null)
  const [zones, setZones] = useState<SectionZone[]>([])
  const [zoneDrawing, setZoneDrawing] = useState(false)
  const [zoneDrawStart, setZoneDrawStart] = useState<{ x: number; y: number } | null>(null)
  const [zoneDrawRect, setZoneDrawRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [zoneSectionId, setZoneSectionId] = useState(sections[0]?.id ?? '')
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)

  const INVENTORY_TYPES = ['TABLE', 'CHAIR', 'BOOTH_BENCH', 'BAR', 'COUNTER', 'SINK', 'STORAGE', 'KITCHEN_EQUIP']

  const stageRef = useRef<any>(null)
  const transformerRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const nextIdCounter = useRef(1)

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

  const CANVAS_PAD = 40
  const [stageSize, setStageSize] = useState({ w: 800, h: 600 })

  useEffect(() => {
    import('react-konva').then((RK) => {
      setKC({
        Stage: RK.Stage, Layer: RK.Layer, Rect: RK.Rect, Circle: RK.Circle,
        Line: RK.Line, Text: RK.Text, Group: RK.Group, Transformer: RK.Transformer,
        Shape: RK.Shape,
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
        if (data.zones) setZones(data.zones)
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
    pushHistory()
    setElements((prev) => [...prev, el])
    setSelectedId(id)
  }

  function finishPen() {
    if (penVertices.length < 3) return
    const gu = plan.gridUnit
    const verts = penVertices.map((v) => ({
      x: snap(v.x, gu),
      y: snap(v.y, gu),
      cp1x: v.cp1x !== undefined ? snap(v.cp1x, gu) : undefined,
      cp1y: v.cp1y !== undefined ? snap(v.cp1y, gu) : undefined,
      cp2x: v.cp2x !== undefined ? snap(v.cp2x, gu) : undefined,
      cp2y: v.cp2y !== undefined ? snap(v.cp2y, gu) : undefined,
    }))
    const minX = Math.min(...verts.map((v) => v.x))
    const minY = Math.min(...verts.map((v) => v.y))
    const maxX = Math.max(...verts.map((v) => v.x))
    const maxY = Math.max(...verts.map((v) => v.y))
    const id = `new_${nextIdCounter.current++}`
    const el: ElementData = {
      id, type: 'OTHER', shape: 'POLYGON', label: null, labelVisible: true,
      x: minX, y: minY,
      width: Math.max(maxX - minX, gu),
      depth: Math.max(maxY - minY, gu),
      rotation: 0, fillColour: '#6B6B6B', opacity: 1,
      zIndex: elements.length + 1, sortOrder: elements.length, isActive: true,
      style: null,
      vertices: verts.map((v) => ({ x: v.x - minX, y: v.y - minY, cp1x: v.cp1x !== undefined ? v.cp1x - minX : undefined, cp1y: v.cp1y !== undefined ? v.cp1y - minY : undefined, cp2x: v.cp2x !== undefined ? v.cp2x - minX : undefined, cp2y: v.cp2y !== undefined ? v.cp2y - minY : undefined })),
    }
    pushHistory()
    setElements((prev) => [...prev, el])
    setSelectedId(id)
    setPenActive(false)
    setPenVertices([])
    setPenDragStart(null)
  }

  function handleStageClick(e: any) {
    if (!penActive && e.target === e.target.getStage()) setSelectedId(null)
  }

  function handleStageDblClick(e: any) {
    if (!penActive) return
    e.evt.preventDefault()
    if (penVertices.length < 3) return
    finishPen()
  }

  function handleStageMouseDown(e: any) {
    if (zoneDrawing) {
      if (e.target !== e.target.getStage()) return
      const rect = containerRef.current!.getBoundingClientRect()
      const gx = (e.evt.clientX - rect.left - offsetX) / scale
      const gy = (e.evt.clientY - rect.top - offsetY) / scale
      setZoneDrawStart({ x: gx, y: gy })
      setZoneDrawRect(null)
      setSelectedZoneId(null)
      return
    }
    if (!penActive) {
      if (e.target === e.target.getStage()) setSelectedId(null)
      return
    }
    if (e.target !== e.target.getStage()) return
    const rect = containerRef.current!.getBoundingClientRect()
    const gx = (e.evt.clientX - rect.left - offsetX) / scale
    const gy = (e.evt.clientY - rect.top - offsetY) / scale
    setPenDragStart({ x: gx, y: gy })
  }

  function handleStageMouseMove(e: any) {
    if (!zoneDrawing || !zoneDrawStart) return
    const rect = containerRef.current!.getBoundingClientRect()
    const gx = (e.evt.clientX - rect.left - offsetX) / scale
    const gy = (e.evt.clientY - rect.top - offsetY) / scale
    const x = Math.min(zoneDrawStart.x, gx)
    const y = Math.min(zoneDrawStart.y, gy)
    const w = Math.abs(gx - zoneDrawStart.x)
    const h = Math.abs(gy - zoneDrawStart.y)
    setZoneDrawRect({ x, y, w, h })
  }

  function handleStageMouseUp(e: any) {
    if (zoneDrawing && zoneDrawStart) {
      const rect = containerRef.current!.getBoundingClientRect()
      const gx = (e.evt.clientX - rect.left - offsetX) / scale
      const gy = (e.evt.clientY - rect.top - offsetY) / scale
      const gu = plan.gridUnit
      const w = Math.abs(gx - zoneDrawStart.x)
      const h = Math.abs(gy - zoneDrawStart.y)
      if (w > gu && h > gu) {
        const x = Math.min(zoneDrawStart.x, gx)
        const y = Math.min(zoneDrawStart.y, gy)
        const newZone: SectionZone = {
          id: `zone_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          x: snap(x, gu), y: snap(y, gu),
          width: snap(w, gu), height: snap(h, gu),
          sectionId: zoneSectionId,
        }
        setZones((prev) => [...prev, newZone])
        setSelectedZoneId(newZone.id)
      }
      setZoneDrawStart(null)
      setZoneDrawRect(null)
      return
    }
    if (!penActive || !penDragStart) return
    const rect = containerRef.current!.getBoundingClientRect()
    const gx = (e.evt.clientX - rect.left - offsetX) / scale
    const gy = (e.evt.clientY - rect.top - offsetY) / scale
    const dist = Math.sqrt((gx - penDragStart.x) ** 2 + (gy - penDragStart.y) ** 2)
    const gu = plan.gridUnit
    const sgx = snap(gx, gu)
    const sgy = snap(gy, gu)

    if (dist > 5) {
      setPenVertices((prev) => {
        if (prev.length === 0) return [{ x: sgx, y: sgy }]
        const updated = [...prev]
        const last = { ...updated[updated.length - 1] }
        const dx = sgx - last.x
        const dy = sgy - last.y
        last.cp2x = snap(last.x + dx * 0.5, gu)
        last.cp2y = snap(last.y + dy * 0.5, gu)
        updated[updated.length - 1] = last
        const next: Vertex = { x: sgx, y: sgy, cp1x: snap(sgx - dx * 0.5, gu), cp1y: snap(sgy - dy * 0.5, gu) }
        return [...updated, next]
      })
    } else {
      setPenVertices((prev) => [...prev, { x: sgx, y: sgy }])
    }
    setPenDragStart(null)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
      e.preventDefault()
      deleteSelected()
      return
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

  function handleExportPNG() {
    const stage = stageRef.current
    if (!stage) return
    const uri = stage.toDataURL({ mimeType: 'image/png', pixelRatio: 2 })
    const a = document.createElement('a')
    a.download = `${plan.slug}.png`
    a.href = uri
    a.click()
  }

  async function handleExportPDF() {
    const stage = stageRef.current
    if (!stage) return
    const uri = stage.toDataURL({ mimeType: 'image/png', pixelRatio: 2 })
    const { jsPDF } = await import('jspdf')
    const orientation = plan.roomWidth > plan.roomDepth ? 'l' : 'p'
    const pdf = new jsPDF({ orientation, unit: 'cm' })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const margin = 1
    const imgW = pageW - margin * 2
    const imgH = imgW * (plan.roomDepth / plan.roomWidth)
    pdf.setFontSize(8)
    pdf.text(`${plan.name} · ${new Date().toLocaleDateString('en-NZ')}`, margin, 0.8)
    pdf.addImage(uri, 'PNG', margin, 1.2, imgW, Math.min(imgH, pageH - 2))
    pdf.save(`${plan.slug}.pdf`)
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

  const { Stage, Layer, Rect, Circle, Line, Text, Group, Transformer, Shape } = KC

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
          <button onClick={() => { setPaletteOpen(!paletteOpen); if (penActive) { setPenActive(false); setPenVertices([]); setPenDragStart(null) } }}
            className={`font-mono text-xs uppercase px-2 py-1 border ${paletteOpen ? 'border-white text-white' : 'border-grey-mid text-grey-light'} hover:border-white transition-colors`}>
            PALETTE
          </button>
          <button onClick={() => {
            if (penActive) { setPenActive(false); setPenVertices([]); setPenDragStart(null) }
            else { setPenActive(true); setPaletteOpen(false); setSelectedId(null) }
          }}
            className={`font-mono text-xs uppercase px-2 py-1 border ${penActive ? 'border-accent text-accent bg-accent/10' : 'border-grey-mid text-grey-light'} hover:border-accent transition-colors`}>
            PEN {penActive ? '· ON' : ''}
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
          <button onClick={() => {
            if (zoneDrawing) { setZoneDrawing(false); setZoneDrawStart(null); setZoneDrawRect(null) }
            else { setZoneDrawing(true); setPenActive(false); setPenVertices([]); setSelectedId(null) }
          }}
            className={`font-mono text-[10px] uppercase px-2 py-1 border ${zoneDrawing ? 'border-success text-success bg-success/10' : 'border-grey-mid text-grey-light'} hover:border-success transition-colors`}>
            ZONES {zoneDrawing ? '· ON' : ''}
          </button>
          <button onClick={() => setShowSummary(!showSummary)}
            className={`font-mono text-[10px] uppercase px-2 py-1 border ${showSummary ? 'border-success text-success' : 'border-grey-mid text-grey-light'} hover:border-success transition-colors`}>
            SUMMARY
          </button>
          <Button onClick={handleSave} loading={saving} size="sm">SAVE</Button>
          <button onClick={undo} className="font-mono text-xs uppercase text-grey-light hover:text-white border border-grey-mid px-2 py-1">↶</button>
          <button onClick={redo} className="font-mono text-xs uppercase text-grey-light hover:text-white border border-grey-mid px-2 py-1">↷</button>
          <Button onClick={handleExportPNG} variant="ghost" size="sm">PNG</Button>
          <Button onClick={handleExportPDF} variant="ghost" size="sm">PDF</Button>
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
            onDblClick={handleStageDblClick}
            onMouseDown={handleStageMouseDown} onMouseUp={handleStageMouseUp}
            onMouseMove={handleStageMouseMove}>
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

              {zones.map((zone) => {
                const sec = sectionMap.get(zone.sectionId)
                const zc = sec?.colour ?? '#4A4A4A'
                return (
                  <Group key={zone.id} onClick={() => setSelectedZoneId(zone.id)}>
                    <Rect x={offsetX + zone.x * scale} y={offsetY + zone.y * scale}
                      width={zone.width * scale} height={zone.height * scale}
                      fill={zc} opacity={0.1} stroke={zone.id === selectedZoneId ? '#FFF' : zc}
                      strokeWidth={zone.id === selectedZoneId ? 2 : 1} listening={true} />
                    {zone.label && (
                      <Text x={offsetX + (zone.x + 5) * scale} y={offsetY + (zone.y + 5) * scale}
                        text={zone.label} fontSize={10} fill={zc} listening={false} />
                    )}
                  </Group>
                )
              })}

              {zoneDrawRect && (
                <Rect x={offsetX + zoneDrawRect.x * scale} y={offsetY + zoneDrawRect.y * scale}
                  width={zoneDrawRect.w * scale} height={zoneDrawRect.h * scale}
                  fill="#FFF" opacity={0.08} stroke="#FFF" strokeWidth={1} dash={[4, 4]} listening={false} />
              )}

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
                         pushHistory()
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
                       pushHistory()
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

              {elements.filter((e) => e.type === 'BOOTH_BENCH').map((bench) => {
                const served: string[] = (bench.style as any)?.servedTableIds ?? []
                if (served.length === 0) return null
                return served.map((tid) => {
                  const table = elements.find((e) => e.id === tid && e.type === 'TABLE')
                  if (!table) return null
                  const bx = offsetX + (bench.x + bench.width / 2) * scale
                  const by = offsetY + (bench.y + bench.depth / 2) * scale
                  const tx = offsetX + (table.x + table.width / 2) * scale
                  const ty = offsetY + (table.y + table.depth / 2) * scale
                  return (
                    <Line key={`${bench.id}-${tid}`}
                      points={[bx, by, tx, ty]}
                      stroke="#FFD700" strokeWidth={1.5} dash={[5, 3]} listening={false} />
                  )
                })
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
                  pushHistory()
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

              {penActive && penVertices.length > 0 && (
                <>
                  {penVertices.map((v, i) => {
                    const px = offsetX + v.x * scale
                    const py = offsetY + v.y * scale
                    const isFirst = i === 0
                    const isLast = i === penVertices.length - 1
                    return (
                      <Group key={i}>
                        <Circle x={px} y={py} radius={4} fill={isLast ? '#FFD700' : '#FFF'} stroke="#333" strokeWidth={1} listening={false} />
                        {v.cp2x !== undefined && v.cp2y !== undefined && (
                          <>
                            <Line points={[px, py, offsetX + v.cp2x * scale, offsetY + v.cp2y * scale]} stroke="#FFD700" strokeWidth={1} dash={[3, 3]} listening={false} />
                            <Circle x={offsetX + v.cp2x * scale} y={offsetY + v.cp2y * scale} radius={2} fill="#FFD700" listening={false} />
                          </>
                        )}
                      </Group>
                    )
                  })}
                  <Line
                    points={penVertices.flatMap((v) => [offsetX + v.x * scale, offsetY + v.y * scale])}
                    stroke="#FFD700" strokeWidth={2} dash={[5, 3]} closed={false} listening={false} />
                </>
              )}
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
            <p className="font-mono text-[10px] text-grey-light">Drag on canvas to draw a zone rectangle.</p>
            <Select label="Section" value={zoneSectionId}
              onChange={(e) => setZoneSectionId(e.target.value)}
              options={sections.map((s) => ({ value: s.id, label: s.name }))} />
            <div className="mt-3 space-y-1 max-h-48 overflow-y-auto">
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
            {selectedZoneId && (
              <div className="border-t border-grey-mid pt-2 space-y-2">
                <button onClick={() => {
                  const z = zones.find((x) => x.id === selectedZoneId)
                  if (z) {
                    setZones((prev) => prev.map((x) => x.id === z.id ? { ...x, sectionId: zoneSectionId } : x))
                  }
                }}
                  className="font-mono text-[10px] text-grey-light hover:text-white uppercase border border-grey-mid px-2 py-1 w-full">
                  APPLY SECTION
                </button>
                <button onClick={() => {
                  setZones((prev) => prev.filter((x) => x.id !== selectedZoneId))
                  setSelectedZoneId(null)
                }}
                  className="font-mono text-[10px] text-danger hover:text-white uppercase border border-danger px-2 py-1 w-full">
                  DELETE ZONE
                </button>
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
