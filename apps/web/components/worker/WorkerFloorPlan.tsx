'use client'

import { useEffect, useRef, useState } from 'react'

interface View { slug: string; name: string; isDefault: boolean }

interface SectionInfo { id: string; name: string; colour: string | null }

interface ElementData {
  id: string
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
  section?: SectionInfo | null
}

interface FullPlan {
  id: string; name: string; slug: string; isDefault: boolean
  roomWidth: number; roomDepth: number; gridUnit: number
  elements: ElementData[]
}

function defaultFill(type: string) {
  const map: Record<string, string> = {
    WALL: '#4A4A4A', DOOR: '#6B4226', WINDOW: '#87CEEB', TABLE: '#2A2A2A',
    CHAIR: '#3A3A3A', COUNTER: '#5C4033', BAR: '#8B4513', SINK: '#B0C4DE',
    KITCHEN_EQUIP: '#555', STORAGE: '#666', ENTRY: '#556B2F', EXIT: '#8B0000',
    STAIRS: '#808080', TOILET: '#4682B4', PLANT: '#228B22', OTHER: '#6B6B6B',
  }
  return map[type] ?? '#6B6B6B'
}

export function WorkerFloorPlan() {
  const [plan, setPlan] = useState<FullPlan | null>(null)
  const [views, setViews] = useState<View[]>([])
  const [activeView, setActiveView] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [infoPanel, setInfoPanel] = useState<ElementData | null>(null)
  const [konvaReady, setKonvaReady] = useState(false)
  const [KC, setKC] = useState<{
    Stage: React.FC<any>; Layer: React.FC<any>; Rect: React.FC<any>
    Circle: React.FC<any>; Line: React.FC<any>; Group: React.FC<any>
  } | null>(null)

  const stageRef = useRef<any>(null)
  const CANVAS_W = typeof window !== 'undefined' ? Math.min(window.innerWidth - 32, 800) : 800
  const CANVAS_H = 500

  useEffect(() => {
    import('react-konva').then((RK) => {
      setKC({ Stage: RK.Stage, Layer: RK.Layer, Rect: RK.Rect, Circle: RK.Circle, Line: RK.Line, Group: RK.Group })
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

  const { Stage, Layer, Rect, Circle, Line, Group } = KC

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-grey-mid">
        <div>
          <h1 className="font-mono text-sm font-bold uppercase tracking-widest text-white">FLOOR PLAN</h1>
          <p className="font-mono text-[10px] text-grey-light uppercase">{plan.name}</p>
        </div>
        {views.length > 1 && (
          <select value={activeView ?? plan.slug} onChange={(e) => switchView(e.target.value)} className="bg-grey-dark border border-grey-mid text-white font-mono text-xs uppercase p-2">
            {views.map((v) => <option key={v.slug} value={v.slug}>{v.name}{v.isDefault ? ' (DEFAULT)' : ''}</option>)}
          </select>
        )}
      </div>

      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
        <Stage ref={stageRef} width={CANVAS_W} height={CANVAS_H} scaleX={scale} scaleY={scale} className="border border-grey-mid">
          <Layer>
            <Rect x={0} y={0} width={plan.roomWidth} height={plan.roomDepth} fill="#1A1A1A" stroke="#4A4A4A" strokeWidth={2} listening={false} />
            {plan.elements.sort((a, b) => a.zIndex - b.zIndex).map((el) => {
              const fill = el.fillColour ?? defaultFill(el.type)
              const stroke = el.section?.colour ?? el.colour ?? '#555'
              const key = el.id

              if (el.shape === 'CIRCLE') {
                const r = el.radius ?? Math.min(el.width, el.depth) / 2
                return <Group key={key} x={el.x} y={el.y} rotation={el.rotation} width={r * 2} height={r * 2} offsetX={r} offsetY={r} onClick={() => setInfoPanel(el)} onTap={() => setInfoPanel(el)}><Circle radius={r} fill={fill} stroke={stroke} strokeWidth={1.5} opacity={el.opacity} /></Group>
              }
              if (el.shape === 'POLYGON' && el.vertices) {
                return <Line key={key} points={el.vertices.flatMap((v) => [v.x, v.y])} x={el.x} y={el.y} rotation={el.rotation} closed fill={fill} stroke={stroke} strokeWidth={1.5} opacity={el.opacity} onClick={() => setInfoPanel(el)} onTap={() => setInfoPanel(el)} />
              }
              return <Rect key={key} x={el.x} y={el.y} width={el.width} height={el.depth} rotation={el.rotation} fill={fill} stroke={stroke} strokeWidth={1.5} opacity={el.opacity} onClick={() => setInfoPanel(el)} onTap={() => setInfoPanel(el)} />
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
