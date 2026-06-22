'use client'

import { useEffect, useRef, useState } from 'react'
import {
  FloorPlanElementVisual, type ElementData,
} from '@/components/admin/floorplan-elements'

interface View { slug: string; name: string; isDefault: boolean }

interface SectionInfo { id: string; name: string; colour: string | null }

type WorkerElement = ElementData & { section?: SectionInfo | null }

interface FullPlan {
  id: string; name: string; slug: string; isDefault: boolean
  roomWidth: number; roomDepth: number; gridUnit: number
  elements: WorkerElement[]
  eventBanner?: { eventName: string; planName: string } | null
}

export function WorkerFloorPlan() {
  const [plan, setPlan] = useState<FullPlan | null>(null)
  const [views, setViews] = useState<View[]>([])
  const [activeView, setActiveView] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [infoPanel, setInfoPanel] = useState<WorkerElement | null>(null)
  const [showSections, setShowSections] = useState(false)
  const [konvaReady, setKonvaReady] = useState(false)
  const [KC, setKC] = useState<{
    Stage: React.FC<any>; Layer: React.FC<any>; Rect: React.FC<any>
    Circle: React.FC<any>; Line: React.FC<any>; Text: React.FC<any>
    Group: React.FC<any>
  } | null>(null)

  const stageRef = useRef<any>(null)
  const CANVAS_W = typeof window !== 'undefined' ? Math.min(window.innerWidth - 32, 800) : 800
  const CANVAS_H = 500

  useEffect(() => {
    import('react-konva').then((RK) => {
      setKC({ Stage: RK.Stage, Layer: RK.Layer, Rect: RK.Rect, Circle: RK.Circle, Line: RK.Line, Text: RK.Text, Group: RK.Group })
      setKonvaReady(true)
    })
  }, [])

  async function loadPlan(view?: string | null) {
    setLoading(true)
    const params = view ? `?view=${view}` : ''
    const r = await fetch(`/api/worker/floorplan${params}`)
    if (r.ok) setPlan(await r.json())
    setLoading(false)
  }

  async function loadViews() {
    const r = await fetch('/api/worker/floorplan/views')
    if (r.ok) setViews(await r.json())
  }

  useEffect(() => { loadViews(); loadPlan() }, [])

  function switchView(slug: string) {
    setActiveView(slug)
    loadPlan(slug)
    setInfoPanel(null)
  }

  const scale = plan ? Math.min(CANVAS_W / plan.roomWidth, CANVAS_H / plan.roomDepth) : 0.5

  if (loading || !konvaReady || !KC) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="font-mono text-sm text-grey-light loading-cursor">LOADING</p>
      </div>
    )
  }

  if (!plan) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6">
        <p className="font-mono text-sm text-grey-light">NO FLOOR PLAN AVAILABLE.</p>
      </div>
    )
  }

  const { Stage, Layer, Rect, Group } = KC

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {plan.eventBanner && (
        <div className="bg-accent/20 border-b border-accent px-4 py-2">
          <p className="font-mono text-xs text-accent uppercase text-center">
            EVENT MODE — {plan.eventBanner.planName} LAYOUT ACTIVE · {plan.eventBanner.eventName}
          </p>
        </div>
      )}
      <div className="flex items-center justify-between px-4 py-3 border-b border-grey-mid">
        <div>
          <h1 className="font-mono text-sm font-bold uppercase tracking-widest text-white">FLOOR PLAN</h1>
          <p className="font-mono text-[10px] text-grey-light uppercase">{plan.name}</p>
        </div>
        <div className="flex items-center gap-2">
          {views.length > 1 && (
            <select value={activeView ?? plan.slug} onChange={(e) => switchView(e.target.value)}
              className="bg-grey-dark border border-grey-mid text-white font-mono text-xs uppercase p-2">
              {views.map((v) => <option key={v.slug} value={v.slug}>{v.name}{v.isDefault ? ' (DEFAULT)' : ''}</option>)}
            </select>
          )}
          <button onClick={() => setShowSections(!showSections)}
            className={`font-mono text-[10px] uppercase px-2 py-1 border ${showSections ? 'border-accent text-accent' : 'border-grey-mid text-grey-light'} hover:border-accent transition-colors`}>
            SECTIONS
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
        <Stage ref={stageRef} width={CANVAS_W} height={CANVAS_H} scaleX={scale} scaleY={scale}
          className="border border-grey-mid">
          <Layer>
            <Rect x={0} y={0} width={plan.roomWidth} height={plan.roomDepth}
              fill="#1A1A1A" stroke="#4A4A4A" strokeWidth={2} listening={false} />

            {plan.elements.sort((a, b) => a.zIndex - b.zIndex).map((el) => {
              const secColour = el.section?.colour ?? null
              const kx = el.x
              const ky = el.y

              return (
                <Group key={el.id} x={kx} y={ky} rotation={el.rotation}
                  onClick={() => setInfoPanel(el)} onTap={() => setInfoPanel(el)}>
                  <FloorPlanElementVisual
                    el={el} KC={KC} scale={1} offsetX={0} offsetY={0}
                    isSelected={false} sectionColour={secColour}
                    showSectionOverlay={showSections} />
                </Group>
              )
            })}
          </Layer>
        </Stage>
      </div>

      {infoPanel && (
        <div className="fixed bottom-0 inset-x-0 bg-grey-dark border-t border-grey-mid p-4 z-50">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="font-mono text-sm font-bold uppercase text-white">{infoPanel.label ?? infoPanel.type}</div>
              {infoPanel.section && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2" style={{ backgroundColor: infoPanel.section.colour ?? '#555' }} />
                  <span className="font-mono text-xs text-grey-light">{infoPanel.section.name}</span>
                </div>
              )}
              {infoPanel.capacity && <div className="font-mono text-xs text-grey-light">CAPACITY: {infoPanel.capacity}</div>}
              <div className="font-mono text-[10px] text-grey-light">{Math.round(infoPanel.width)} × {Math.round(infoPanel.depth)} cm</div>
            </div>
            <button onClick={() => setInfoPanel(null)} className="font-mono text-xs text-grey-light hover:text-white">CLOSE</button>
          </div>
        </div>
      )}
    </div>
  )
}


