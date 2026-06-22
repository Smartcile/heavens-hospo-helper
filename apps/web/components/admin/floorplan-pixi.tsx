'use client'

import { useRef, useEffect } from 'react'
import * as PIXI from 'pixi.js'
import type { ElementData } from '@/components/admin/floorplan-elements'

interface ZoneP { id: string; x: number; y: number; width: number; height: number; sectionId: string; label?: string }

interface PixiCanvasProps {
  roomWidth: number; roomDepth: number; gridUnit: number
  elements: ElementData[]
  zones: ZoneP[]
  selectedId: string | null
  snapEnabled: boolean
  sectionColours: Map<string, string>
  zoneDrawing: boolean
  zoneDrawStart: { x: number; y: number } | null
  zoneDrawRect: { x: number; y: number; w: number; h: number } | null
  selectedZoneId: string | null
  containerRef: React.RefObject<HTMLDivElement | null>
  onElementClick: (id: string | null) => void
  onElementDragEnd: (id: string, x: number, y: number) => void
  onZoneClick: (id: string | null) => void
  onZoneDragEnd: (id: string, x: number, y: number) => void
  onZoneDrawStart: (x: number, y: number) => void
  onZoneDrawMove: (x: number, y: number) => void
  onZoneDrawEnd: (x: number, y: number) => void
  stageW: number; stageH: number
}

function vs(v: number, u: number) { return Math.round(v / u) * u }

export function FloorPlanPixiCanvas({
  roomWidth, roomDepth, gridUnit,
  elements, zones, selectedId, snapEnabled,
  sectionColours, zoneDrawing, zoneDrawStart, zoneDrawRect, selectedZoneId,
  containerRef,
  onElementClick, onElementDragEnd, onZoneClick, onZoneDragEnd,
  onZoneDrawStart, onZoneDrawMove, onZoneDrawEnd,
  stageW, stageH,
}: PixiCanvasProps) {
  const appRef = useRef<PIXI.Application | null>(null)
  const roomRef = useRef<PIXI.Container | null>(null)
  const stateRef = useRef({ scale: 0, ox: 0, oy: 0, snap: snapEnabled, gu: gridUnit })
  const cbRef = useRef({ onElementClick, onElementDragEnd, onZoneClick, onZoneDragEnd, onZoneDrawStart, onZoneDrawMove, onZoneDrawEnd })
  cbRef.current = { onElementClick, onElementDragEnd, onZoneClick, onZoneDragEnd, onZoneDrawStart, onZoneDrawMove, onZoneDrawEnd }

  // Init app once
  useEffect(() => {
    if (!containerRef.current) return
    const s = Math.min((stageW - 80) / roomWidth, (stageH - 80) / roomDepth)
    const ox = (stageW - roomWidth * s) / 2; const oy = (stageH - roomDepth * s) / 2
    stateRef.current = { scale: s, ox, oy, snap: snapEnabled, gu: gridUnit }

    const app = new PIXI.Application({
      width: stageW, height: stageH, backgroundColor: 0x000000,
      antialias: true, resolution: window.devicePixelRatio || 1, autoDensity: true,
    })
    containerRef.current.appendChild(app.view as unknown as Node)
    appRef.current = app

    const room = new PIXI.Container(); room.x = ox; room.y = oy
    roomRef.current = room; app.stage.addChild(room)

    // Stage click to deselect
    app.stage.eventMode = 'static'
    app.stage.hitArea = new PIXI.Rectangle(0, 0, stageW, stageH)
    app.stage.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      if (e.target === app.stage) { cbRef.current.onElementClick(null); cbRef.current.onZoneClick(null) }
    })

    // Zone drawing on stage
    let zd: { sx: number; sy: number } | null = null
    app.stage.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      if (e.target !== app.stage) return
      if (!cbRef.current.onZoneDrawStart) return
      const st = stateRef.current
      const cx = (e.globalX - st.ox) / st.scale; const cy = (e.globalY - st.oy) / st.scale
      zd = { sx: e.globalX, sy: e.globalY }
      cbRef.current.onZoneDrawStart(cx, cy)
    })
    app.stage.on('globalpointermove', (e: PIXI.FederatedPointerEvent) => {
      if (!zd) return
      const st = stateRef.current
      const cx = (e.globalX - st.ox) / st.scale; const cy = (e.globalY - st.oy) / st.scale
      cbRef.current.onZoneDrawMove(cx, cy)
    })
    app.stage.on('pointerup', (e: PIXI.FederatedPointerEvent) => {
      if (!zd) return
      const st = stateRef.current
      const cx = (e.globalX - st.ox) / st.scale; const cy = (e.globalY - st.oy) / st.scale
      cbRef.current.onZoneDrawEnd(cx, cy)
      zd = null
    })

    return () => { app.destroy(true, { children: true }); appRef.current = null; roomRef.current = null }
  }, [])

  // Rebuild scene
  useEffect(() => {
    const room = roomRef.current
    if (!room) return
    const s = Math.min((stageW - 80) / roomWidth, (stageH - 80) / roomDepth)
    const ox = (stageW - roomWidth * s) / 2; const oy = (stageH - roomDepth * s) / 2
    stateRef.current = { scale: s, ox, oy, snap: snapEnabled, gu: gridUnit }
    room.x = ox; room.y = oy
    room.removeChildren()
    const cm = (v: number) => v * s; const pc = (v: number) => v / s

    // Background
    const bg = new PIXI.Graphics()
    bg.beginFill(0x1A1A1A).lineStyle(2, 0x4A4A4A).drawRect(0, 0, cm(roomWidth), cm(roomDepth)).endFill(); bg.eventMode = 'none'
    room.addChild(bg)

    // Grid
    const gd = new PIXI.Graphics(); gd.lineStyle(1, 0x2E2E2E, 0.3)
    for (let i = 0; i <= roomWidth; i += gridUnit) { gd.moveTo(cm(i), 0); gd.lineTo(cm(i), cm(roomDepth)) }
    for (let j = 0; j <= roomDepth; j += gridUnit) { gd.moveTo(0, cm(j)); gd.lineTo(cm(roomWidth), cm(j)) }
    gd.eventMode = 'none'; room.addChild(gd)

    // Zone draw preview
    if (zoneDrawing && zoneDrawRect) {
      const pr = new PIXI.Graphics()
      pr.lineStyle(1, 0xFFFFFF, 0.3); pr.beginFill(0xFFFFFF, 0.05)
      pr.drawRect(cm(zoneDrawRect.x), cm(zoneDrawRect.y), cm(zoneDrawRect.w), cm(zoneDrawRect.h))
      pr.endFill(); pr.eventMode = 'none'; room.addChild(pr)
    }

    // Zones
    zones.forEach((z) => {
      const c = new PIXI.Container(); c.x = cm(z.x); c.y = cm(z.y)
      c.eventMode = 'static'; c.cursor = zoneDrawing ? 'move' : 'pointer'
      const colour = sectionColours.get(z.sectionId) ?? '#4A4A4A'
      const nc = parseInt(colour.replace('#', ''), 16)
      const g = new PIXI.Graphics()
      g.lineStyle(z.id === selectedZoneId ? 2 : 1, z.id === selectedZoneId ? 0xFFFFFF : nc, 1)
      g.beginFill(nc, 0.1).drawRect(0, 0, cm(z.width), cm(z.height)).endFill()
      c.addChild(g); attachZoneDrag(c, z); room.addChild(c)
    })

    // Elements
    ;[...elements].sort((a, b) => a.zIndex - b.zIndex).forEach((el) => {
      const c = new PIXI.Container(); c.x = cm(el.x); c.y = cm(el.y)
      c.rotation = (el.rotation ?? 0) * (Math.PI / 180)
      c.eventMode = 'static'; c.cursor = 'pointer'
      const fill = el.fillColour ?? '#6B6B6B'
      const nf = parseInt(fill.replace('#', ''), 16)
      const ns = el.id === selectedId ? 0xFFFFFF : parseInt('#4A4A4A'.replace('#', ''), 16)
      const sw = el.id === selectedId ? 2 : 1
      const g = new PIXI.Graphics(); g.lineStyle(sw, ns, el.opacity ?? 1); g.beginFill(nf, el.opacity ?? 1)
      if (el.shape === 'CIRCLE') { g.drawCircle(0, 0, cm(el.radius ?? Math.min(el.width, el.depth) / 2)) }
      else {
        const w = cm(el.width); const h = cm(el.depth)
        const cr: number[] = ((el.style as any)?.cornerRadius) ?? [0, 0, 0, 0]
        const [tl, tr, br, bl] = cr.map((v) => cm(v))
        if (tl > 0 || tr > 0 || br > 0 || bl > 0) {
          g.moveTo(tl, 0); g.lineTo(w - tr, 0); if (tr > 0) g.arcTo(w, 0, w, tr, tr)
          g.lineTo(w, h - br); if (br > 0) g.arcTo(w, h, w - br, h, br)
          g.lineTo(bl, h); if (bl > 0) g.arcTo(0, h, 0, h - bl, bl)
          g.lineTo(0, tl); if (tl > 0) g.arcTo(0, 0, tl, 0, tl); g.closePath()
        } else { g.drawRect(0, 0, w, h) }
      }
      g.endFill(); c.addChild(g)
      if (el.labelVisible !== false && el.label) {
        const t = new PIXI.Text(el.label, { fontSize: Math.max(8, cm(Math.min(el.width, el.depth)) * 0.3), fill: 0xCCCCCC, fontFamily: 'monospace', align: 'center' })
        t.anchor.set(0.5); t.x = cm(el.width / 2); t.y = cm(el.depth / 2); t.eventMode = 'none'; c.addChild(t)
      }
      attachElementDrag(c, el); room.addChild(c)
    })

    // Bench connectors
    elements.filter((e) => e.type === 'BOOTH_BENCH').forEach((bench) => {
      const served: string[] = (bench.style as any)?.servedTableIds ?? []
      served.forEach((tid) => {
        const table = elements.find((e) => e.id === tid); if (!table) return
        const l = new PIXI.Graphics(); l.lineStyle(1.5, 0xFFD700, 1)
        const bx = cm(bench.x + bench.width / 2); const by = cm(bench.y + bench.depth / 2)
        const tx = cm(table.x + table.width / 2); const ty = cm(table.y + table.depth / 2)
        const ddx = tx - bx; const ddy = ty - by; const dist = Math.sqrt(ddx * ddx + ddy * ddy)
        const ux = ddx / dist; const uy = ddy / dist; let p = 0
        while (p < dist) { const seg = Math.min(5, dist - p); l.moveTo(bx + ux * p, by + uy * p); l.lineTo(bx + ux * (p + seg), by + uy * (p + seg)); p += seg + 3 }
        l.eventMode = 'none'; room.addChild(l)
      })
    })
  }, [elements, zones, selectedId, selectedZoneId, zoneDrawing, zoneDrawRect, roomWidth, roomDepth, gridUnit, snapEnabled, stageW, stageH])

  function attachElementDrag(node: PIXI.Container, el: ElementData) {
    let dd: { sx: number; sy: number; ex: number; ey: number } | null = null
    node.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      e.stopPropagation()
      cbRef.current.onElementClick(el.id!)
      dd = { sx: e.globalX, sy: e.globalY, ex: node.x, ey: node.y }
      const app = appRef.current
      if (!app) return
      const onMove = (ev: PIXI.FederatedPointerEvent) => {
        if (!dd) return; const st = stateRef.current
        let nx = dd.ex + ev.globalX - dd.sx; let ny = dd.ey + ev.globalY - dd.sy
        if (st.snap) { nx = vs(nx / st.scale, st.gu) * st.scale; ny = vs(ny / st.scale, st.gu) * st.scale }
        node.x = nx; node.y = ny
      }
      const onUp = (ev: PIXI.FederatedPointerEvent) => {
        app.stage.off('globalpointermove', onMove); app.stage.off('pointerup', onUp)
        if (!dd) return; const st = stateRef.current
        let nx = dd.ex + ev.globalX - dd.sx; let ny = dd.ey + ev.globalY - dd.sy
        const rx = st.snap ? vs(nx / st.scale, st.gu) : (nx / st.scale)
        const ry = st.snap ? vs(ny / st.scale, st.gu) : (ny / st.scale)
        cbRef.current.onElementDragEnd(el.id!, rx, ry); dd = null
      }
      app.stage.on('globalpointermove', onMove); app.stage.on('pointerup', onUp)
    })
  }

  function attachZoneDrag(node: PIXI.Container, z: ZoneP) {
    let dd: { sx: number; sy: number; ex: number; ey: number } | null = null
    node.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      e.stopPropagation()
      cbRef.current.onZoneClick(z.id)
      dd = { sx: e.globalX, sy: e.globalY, ex: node.x, ey: node.y }
      const app = appRef.current
      if (!app) return
      const onMove = (ev: PIXI.FederatedPointerEvent) => {
        if (!dd) return; node.x = dd.ex + ev.globalX - dd.sx; node.y = dd.ey + ev.globalY - dd.sy
      }
      const onUp = (ev: PIXI.FederatedPointerEvent) => {
        app.stage.off('globalpointermove', onMove); app.stage.off('pointerup', onUp)
        if (!dd) return; const st = stateRef.current
        let nx = dd.ex + ev.globalX - dd.sx; let ny = dd.ey + ev.globalY - dd.sy
        const rx = st.snap ? vs(nx / st.scale, st.gu) : (nx / st.scale)
        const ry = st.snap ? vs(ny / st.scale, st.gu) : (ny / st.scale)
        cbRef.current.onZoneDragEnd(z.id, rx, ry); dd = null
      }
      app.stage.on('globalpointermove', onMove); app.stage.on('pointerup', onUp)
    })
  }

  return null
}
