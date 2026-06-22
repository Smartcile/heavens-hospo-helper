'use client'

import { useRef, useEffect } from 'react'
import * as PIXI from 'pixi.js'
import type { ElementData } from '@/components/admin/floorplan-elements'

interface ZoneP { id: string; x: number; y: number; width: number; height: number; sectionId: string; label?: string }

export interface ViewState {
  baseScale: number; ox: number; oy: number
  zoom: number; panX: number; panY: number
}

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
  viewRef: React.MutableRefObject<ViewState>
  onElementClick: (id: string | null) => void
  onElementDragEnd: (id: string, x: number, y: number) => void
  onZoneClick: (id: string | null) => void
  onZoneDragEnd: (id: string, x: number, y: number) => void
  onZoneDrawStart: (x: number, y: number) => void
  onZoneDrawMove: (x: number, y: number) => void
  onZoneDrawEnd: (x: number, y: number) => void
  onViewChange?: (zoom: number) => void
  stageW: number; stageH: number
}

function gridSnap(v: number, u: number) { return Math.round(v / u) * u }

export function FloorPlanPixiCanvas({
  roomWidth, roomDepth, gridUnit,
  elements, zones, selectedId, snapEnabled,
  sectionColours, zoneDrawing, zoneDrawStart, zoneDrawRect, selectedZoneId,
  containerRef, viewRef,
  onElementClick, onElementDragEnd, onZoneClick, onZoneDragEnd,
  onZoneDrawStart, onZoneDrawMove, onZoneDrawEnd, onViewChange,
  stageW, stageH,
}: PixiCanvasProps) {
  const appRef = useRef<PIXI.Application | null>(null)
  const roomRef = useRef<PIXI.Container | null>(null)
  const stateRef = useRef({ snap: snapEnabled, gu: gridUnit })
  const cbRef = useRef({ onElementClick, onElementDragEnd, onZoneClick, onZoneDragEnd, onZoneDrawStart, onZoneDrawMove, onZoneDrawEnd, onViewChange })
  cbRef.current = { onElementClick, onElementDragEnd, onZoneClick, onZoneDragEnd, onZoneDrawStart, onZoneDrawMove, onZoneDrawEnd, onViewChange }

  // Init app once
  useEffect(() => {
    if (!containerRef.current) return
    const app = new PIXI.Application({
      width: stageW, height: stageH, backgroundColor: 0x000000,
      antialias: true, resolution: window.devicePixelRatio || 1, autoDensity: true,
    })
    containerRef.current.appendChild(app.view as unknown as Node)
    appRef.current = app

    const room = new PIXI.Container()
    roomRef.current = room
    app.stage.addChild(room)

    // Compute initial view state
    const bs = Math.min((stageW - 80) / roomWidth, (stageH - 80) / roomDepth)
    const ox = (stageW - roomWidth * bs) / 2; const oy = (stageH - roomDepth * bs) / 2
    viewRef.current = { baseScale: bs, ox, oy, zoom: 1, panX: 0, panY: 0 }
    room.scale.set(bs); room.position.set(ox, oy)

    // Stage click to deselect
    app.stage.eventMode = 'static'
    app.stage.hitArea = new PIXI.Rectangle(0, 0, stageW, stageH)
    app.stage.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      if (e.target === app.stage) { cbRef.current.onElementClick(null); cbRef.current.onZoneClick(null) }
    })

    // Mouse wheel zoom
    app.stage.on('wheel', (e: PIXI.FederatedWheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      const vs = viewRef.current
      const newZoom = Math.max(0.2, Math.min(5, vs.zoom * delta))
      const worldX = (e.globalX - vs.ox - vs.panX) / (vs.baseScale * vs.zoom)
      const worldY = (e.globalY - vs.oy - vs.panY) / (vs.baseScale * vs.zoom)
      vs.zoom = newZoom
      vs.panX = e.globalX - worldX * vs.baseScale * vs.zoom - vs.ox
      vs.panY = e.globalY - worldY * vs.baseScale * vs.zoom - vs.oy
      room.scale.set(vs.baseScale * vs.zoom); room.position.set(vs.ox + vs.panX, vs.oy + vs.panY)
      cbRef.current.onViewChange?.(newZoom)
    })

    // Middle-click pan
    let panning: { sx: number; sy: number; px: number; py: number } | null = null
    app.stage.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      if (e.button !== 1) return
      e.preventDefault()
      const vs = viewRef.current
      panning = { sx: e.globalX, sy: e.globalY, px: vs.panX, py: vs.panY }
    })
    app.stage.on('globalpointermove', (e: PIXI.FederatedPointerEvent) => {
      if (!panning) return
      const vs = viewRef.current
      vs.panX = panning.px + e.globalX - panning.sx
      vs.panY = panning.py + e.globalY - panning.sy
      room.position.set(vs.ox + vs.panX, vs.oy + vs.panY)
    })
    app.stage.on('pointerup', (e: PIXI.FederatedPointerEvent) => {
      if (e.button !== 1) return
      panning = null
    })

    // Zone drawing on stage
    let zd: { sx: number; sy: number } | null = null
    app.stage.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      if (e.target !== app.stage) return; if (e.button !== 0) return
      if (!cbRef.current.onZoneDrawStart) return
      const vs = viewRef.current
      const cx = (e.globalX - vs.ox - vs.panX) / (vs.baseScale * vs.zoom)
      const cy = (e.globalY - vs.oy - vs.panY) / (vs.baseScale * vs.zoom)
      zd = { sx: e.globalX, sy: e.globalY }
      cbRef.current.onZoneDrawStart(cx, cy)
    })
    app.stage.on('globalpointermove', (e: PIXI.FederatedPointerEvent) => {
      if (!zd) return
      const vs = viewRef.current
      const cx = (e.globalX - vs.ox - vs.panX) / (vs.baseScale * vs.zoom)
      const cy = (e.globalY - vs.oy - vs.panY) / (vs.baseScale * vs.zoom)
      cbRef.current.onZoneDrawMove(cx, cy)
    })
    app.stage.on('pointerup', (e: PIXI.FederatedPointerEvent) => {
      if (!zd) return
      const vs = viewRef.current
      const cx = (e.globalX - vs.ox - vs.panX) / (vs.baseScale * vs.zoom)
      const cy = (e.globalY - vs.oy - vs.panY) / (vs.baseScale * vs.zoom)
      cbRef.current.onZoneDrawEnd(cx, cy)
      zd = null
    })

    return () => { app.destroy(true, { children: true }); appRef.current = null; roomRef.current = null }
  }, [])

  // Rebuild scene
  useEffect(() => {
    const room = roomRef.current
    if (!room) return

    // Update base scale on resize
    const vs = viewRef.current
    vs.baseScale = Math.min((stageW - 80) / roomWidth, (stageH - 80) / roomDepth)
    vs.ox = (stageW - roomWidth * vs.baseScale) / 2; vs.oy = (stageH - roomDepth * vs.baseScale) / 2
    room.scale.set(vs.baseScale * vs.zoom); room.position.set(vs.ox + vs.panX, vs.oy + vs.panY)
    stateRef.current = { snap: snapEnabled, gu: gridUnit }

    room.removeChildren()

    // Background (drawn at 0,0 in cm, scaled by room)
    const bg = new PIXI.Graphics()
    bg.beginFill(0x1A1A1A).lineStyle(2 / (vs.baseScale * vs.zoom || 1), 0x4A4A4A).drawRect(0, 0, roomWidth, roomDepth).endFill()
    bg.eventMode = 'none'
    room.addChild(bg)

    // Grid (drawn in cm)
    const gd = new PIXI.Graphics(); gd.lineStyle(1 / (vs.baseScale * vs.zoom || 1), 0x2E2E2E, 0.3)
    for (let i = 0; i <= roomWidth; i += gridUnit) { gd.moveTo(i, 0); gd.lineTo(i, roomDepth) }
    for (let j = 0; j <= roomDepth; j += gridUnit) { gd.moveTo(0, j); gd.lineTo(roomWidth, j) }
    gd.eventMode = 'none'; room.addChild(gd)

    // Zone draw preview
    if (zoneDrawing && zoneDrawRect) {
      const pr = new PIXI.Graphics()
      pr.lineStyle(1 / (vs.baseScale * vs.zoom || 1), 0xFFFFFF, 0.3); pr.beginFill(0xFFFFFF, 0.05)
      pr.drawRect(zoneDrawRect.x, zoneDrawRect.y, zoneDrawRect.w, zoneDrawRect.h)
      pr.endFill(); pr.eventMode = 'none'; room.addChild(pr)
    }

    // Zones
    zones.forEach((z) => {
      const c = new PIXI.Container(); c.x = z.x; c.y = z.y
      if (zoneDrawing) {
        c.eventMode = 'static'; c.cursor = 'move'
      } else {
        c.eventMode = 'static'; c.cursor = 'default'
      }
      const colour = sectionColours.get(z.sectionId) ?? '#4A4A4A'
      const nc = parseInt(colour.replace('#', ''), 16)
      const g = new PIXI.Graphics()
      const pxScale = vs.baseScale * vs.zoom || 1
      g.lineStyle((z.id === selectedZoneId ? 2 : 1) / pxScale, z.id === selectedZoneId ? 0xFFFFFF : nc, 1)
      g.beginFill(nc, 0.1).drawRect(0, 0, z.width, z.height).endFill()
      c.addChild(g)
      if (zoneDrawing) attachZoneDrag(c, z)
      room.addChild(c)
    })

    // Elements
    ;[...elements].sort((a, b) => a.zIndex - b.zIndex).forEach((el) => {
      const c = new PIXI.Container(); c.x = el.x; c.y = el.y
      c.rotation = (el.rotation ?? 0) * (Math.PI / 180)
      c.eventMode = 'static'; c.cursor = 'pointer'
      const fill = el.fillColour ?? '#6B6B6B'
      const nf = parseInt(fill.replace('#', ''), 16)
      const ns = el.id === selectedId ? 0xFFFFFF : parseInt('#4A4A4A'.replace('#', ''), 16)
      const sw = (el.id === selectedId ? 2 : 1) / (vs.baseScale * vs.zoom || 1)
      const g = new PIXI.Graphics(); g.lineStyle(sw, ns, el.opacity ?? 1); g.beginFill(nf, el.opacity ?? 1)
      if (el.shape === 'CIRCLE') { g.drawCircle(0, 0, el.radius ?? Math.min(el.width, el.depth) / 2) }
      else {
        const w = el.width; const h = el.depth
        const cr: number[] = ((el.style as any)?.cornerRadius) ?? [0, 0, 0, 0]
        const [tl, tr, br, bl] = cr
        if (tl > 0 || tr > 0 || br > 0 || bl > 0) {
          g.moveTo(tl, 0); g.lineTo(w - tr, 0); if (tr > 0) g.arcTo(w, 0, w, tr, tr)
          g.lineTo(w, h - br); if (br > 0) g.arcTo(w, h, w - br, h, br)
          g.lineTo(bl, h); if (bl > 0) g.arcTo(0, h, 0, h - bl, bl)
          g.lineTo(0, tl); if (tl > 0) g.arcTo(0, 0, tl, 0, tl); g.closePath()
        } else { g.drawRect(0, 0, w, h) }
      }
      g.endFill(); c.addChild(g)

      // Label
      if (el.labelVisible !== false && el.label) {
        const pxScale = (vs.baseScale * vs.zoom || 1)
        const fs = Math.max(8, Math.min(el.width, el.depth) * 0.3 * pxScale)
        const t = new PIXI.Text(el.label, { fontSize: fs, fill: 0xCCCCCC, fontFamily: 'monospace', align: 'center' })
        t.anchor.set(0.5); t.x = el.width / 2; t.y = el.depth / 2; t.eventMode = 'none'; c.addChild(t)
      }

      // Visual chairs around tables
      if (el.type === 'TABLE' && (el.chairCount ?? 0) > 0) {
        const cc = el.chairCount ?? 0
        const chairsPerSide = Math.ceil(cc / 4)
        const pxScale = vs.baseScale * vs.zoom || 1
        const chairR = 4 / pxScale
        const chairGap = 2 / pxScale
        const sides = [
          { x1: chairR, y1: -chairR - chairGap, x2: el.width - chairR, y2: -chairR - chairGap },
          { x1: el.width + chairR + chairGap, y1: chairR, x2: el.width + chairR + chairGap, y2: el.depth - chairR },
          { x1: el.width - chairR, y1: el.depth + chairR + chairGap, x2: chairR, y2: el.depth + chairR + chairGap },
          { x1: -chairR - chairGap, y1: el.depth - chairR, x2: -chairR - chairGap, y2: chairR },
        ]
        let placed = 0
        for (const side of sides) {
          const len = Math.sqrt((side.x2 - side.x1) ** 2 + (side.y2 - side.y1) ** 2)
          const spacing = len / Math.max(chairsPerSide, 1)
          if (len < 0.1) continue
          const ux = (side.x2 - side.x1) / len; const uy = (side.y2 - side.y1) / len
          for (let i = 0; i < chairsPerSide && placed < cc; i++) {
            const pxPos = side.x1 + ux * (spacing * 0.5 + spacing * i)
            const pyPos = side.y1 + uy * (spacing * 0.5 + spacing * i)
            const chair = new PIXI.Graphics()
            chair.beginFill(0x3A3A4A).lineStyle(sw, 0x666666).drawCircle(pxPos, pyPos, chairR).endFill()
            chair.eventMode = 'none'; c.addChild(chair)
            placed++
          }
        }
        if (placed > 0 && el.labelVisible !== false && el.label) {
          const capText = new PIXI.Text(`×${cc}`, { fontSize: Math.max(6, Math.min(el.width, el.depth) * 0.18 * pxScale), fill: 0xCCCCCC, fontFamily: 'monospace' })
          capText.anchor.set(0, 0.5); capText.x = el.width / 2 + 2; capText.y = el.depth / 2; capText.eventMode = 'none'; c.addChild(capText)
        }
      }

      attachElementDrag(c, el)
      room.addChild(c)
    })

    // Bench connectors
    elements.filter((e) => e.type === 'BOOTH_BENCH').forEach((bench) => {
      const served: string[] = (bench.style as any)?.servedTableIds ?? []
      served.forEach((tid) => {
        const table = elements.find((e) => e.id === tid); if (!table) return
        const l = new PIXI.Graphics(); l.lineStyle(1.5 / (vs.baseScale * vs.zoom || 1), 0xFFD700, 1)
        const bx = bench.x + bench.width / 2; const by = bench.y + bench.depth / 2
        const tx = table.x + table.width / 2; const ty = table.y + table.depth / 2
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
        const vs = viewRef.current
        let nx = dd.ex + (ev.globalX - dd.sx) / (vs.baseScale * vs.zoom)
        let ny = dd.ey + (ev.globalY - dd.sy) / (vs.baseScale * vs.zoom)
        if (st.snap) { nx = gridSnap(nx, st.gu); ny = gridSnap(ny, st.gu) }
        node.x = nx; node.y = ny
      }
      const onUp = (ev: PIXI.FederatedPointerEvent) => {
        app.stage.off('globalpointermove', onMove); app.stage.off('pointerup', onUp)
        if (!dd) return; const st = stateRef.current
        const vs = viewRef.current
        let rx = dd.ex + (ev.globalX - dd.sx) / (vs.baseScale * vs.zoom)
        let ry = dd.ey + (ev.globalY - dd.sy) / (vs.baseScale * vs.zoom)
        if (st.snap) { rx = gridSnap(rx, st.gu); ry = gridSnap(ry, st.gu) }
        // Clamp to room bounds
        rx = Math.max(0, Math.min(rx, roomWidth - el.width))
        ry = Math.max(0, Math.min(ry, roomDepth - el.depth))
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
        if (!dd) return
        const vs = viewRef.current
        let nx = dd.ex + (ev.globalX - dd.sx) / (vs.baseScale * vs.zoom)
        let ny = dd.ey + (ev.globalY - dd.sy) / (vs.baseScale * vs.zoom)
        nx = gridSnap(nx, stateRef.current.gu); ny = gridSnap(ny, stateRef.current.gu)
        node.x = nx; node.y = ny
      }
      const onUp = (ev: PIXI.FederatedPointerEvent) => {
        app.stage.off('globalpointermove', onMove); app.stage.off('pointerup', onUp)
        if (!dd) return
        const vs = viewRef.current
        let rx = dd.ex + (ev.globalX - dd.sx) / (vs.baseScale * vs.zoom)
        let ry = dd.ey + (ev.globalY - dd.sy) / (vs.baseScale * vs.zoom)
        rx = gridSnap(rx, stateRef.current.gu); ry = gridSnap(ry, stateRef.current.gu)
        cbRef.current.onZoneDragEnd(z.id, rx, ry); dd = null
      }
      app.stage.on('globalpointermove', onMove); app.stage.on('pointerup', onUp)
    })
  }

  return null
}
