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
  selectedIds: string[]
  snapEnabled: boolean
  sectionColours: Map<string, string>
  sectionNames: Map<string, string>
  zoneDrawing: boolean
  zoneDrawStart: { x: number; y: number } | null
  zoneDrawRect: { x: number; y: number; w: number; h: number } | null
  selectedZoneId: string | null
  containerRef: React.RefObject<HTMLDivElement | null>
  viewRef: React.MutableRefObject<ViewState>
  onElementClick: (id: string | null, ctrlKey?: boolean) => void
  onElementDragEnd: (id: string, x: number, y: number) => void
  onZoneClick: (id: string | null) => void
  onZoneDragEnd: (id: string, x: number, y: number) => void
  onZoneDrawStart: (x: number, y: number) => void
  onZoneDrawMove: (x: number, y: number) => void
  onZoneDrawEnd: (x: number, y: number) => void
  onZoneResize?: (id: string, x: number, y: number, width: number, height: number) => void
  textScale?: number
  selRect?: { x: number; y: number; w: number; h: number } | null
  onSelRectStart?: (x: number, y: number) => void
  onSelRectMove?: (x: number, y: number) => void
  onSelRectEnd?: (x: number, y: number) => void
  onViewChange?: (zoom: number) => void
  rebuildKey?: number
}

function gridSnap(v: number, u: number) { return Math.round(v / u) * u }
function edgeSnap(v: number, size: number, u: number) {
  const left = gridSnap(v, u)
  const right = gridSnap(v + size, u) - size
  return Math.abs(v - left) < Math.abs(v - right) ? left : right
}

function computeView(sw: number, sh: number, rw: number, rd: number, zoom: number, panX: number, panY: number) {
  const baseScale = Math.min((sw - 40) / rw, (sh - 40) / rd)
  const ox = (sw - rw * baseScale) / 2; const oy = (sh - rd * baseScale) / 2
  return { baseScale, ox, oy, zoom, panX, panY }
}

function applyRoomTransform(room: PIXI.Container, vs: ViewState) {
  room.scale.set(vs.baseScale * vs.zoom)
  room.position.set(vs.ox + vs.panX, vs.oy + vs.panY)
}

export function FloorPlanPixiCanvas({
  roomWidth, roomDepth, gridUnit,
  elements, zones, selectedIds, snapEnabled,
  sectionColours, sectionNames, zoneDrawing, zoneDrawStart, zoneDrawRect, selectedZoneId,
  containerRef, viewRef,
  onElementClick, onElementDragEnd, onZoneClick, onZoneDragEnd,
  onZoneDrawStart, onZoneDrawMove, onZoneDrawEnd, onZoneResize, onViewChange,
  textScale = 1, selRect, onSelRectStart, onSelRectMove, onSelRectEnd,
  rebuildKey,
}: PixiCanvasProps) {
  const appRef = useRef<PIXI.Application | null>(null)
  const roomRef = useRef<PIXI.Container | null>(null)
  const stateRef = useRef({ snap: snapEnabled, gu: gridUnit })
  const cbRef = useRef({ onElementClick, onElementDragEnd, onZoneClick, onZoneDragEnd, onZoneDrawStart, onZoneDrawMove, onZoneDrawEnd, onZoneResize, onViewChange, zoneDrawing, onSelRectStart, onSelRectMove, onSelRectEnd })
  cbRef.current = { onElementClick, onElementDragEnd, onZoneClick, onZoneDragEnd, onZoneDrawStart, onZoneDrawMove, onZoneDrawEnd, onZoneResize, onViewChange, zoneDrawing, onSelRectStart, onSelRectMove, onSelRectEnd }

  // Init app once
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const w = el.clientWidth || 800; const h = el.clientHeight || 600
    const app = new PIXI.Application({
      width: w, height: h, backgroundColor: 0x000000,
      antialias: true, resolution: window.devicePixelRatio || 1, autoDensity: true,
    })
    el.appendChild(app.view as unknown as Node)
    appRef.current = app

    const room = new PIXI.Container()
    roomRef.current = room
    app.stage.addChild(room)

    const vs = computeView(w, h, roomWidth, roomDepth, 1, 0, 0)
    viewRef.current = vs
    applyRoomTransform(room, vs)

    // Stage click to deselect
    app.stage.eventMode = 'static'
    app.stage.hitArea = new PIXI.Rectangle(0, 0, w, h)
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
      applyRoomTransform(room, vs)
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

    // Zone drawing / selection rect on stage
    let zd: { sx: number; sy: number; mode: 'zone' | 'sel' } | null = null
    app.stage.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      if (e.target !== app.stage) return; if (e.button !== 0) return
      const vs = viewRef.current
      const cx = (e.globalX - vs.ox - vs.panX) / (vs.baseScale * vs.zoom)
      const cy = (e.globalY - vs.oy - vs.panY) / (vs.baseScale * vs.zoom)
      if (cbRef.current.zoneDrawing) {
        if (!cbRef.current.onZoneDrawStart) return
        zd = { sx: e.globalX, sy: e.globalY, mode: 'zone' }
        cbRef.current.onZoneDrawStart(cx, cy)
      } else {
        zd = { sx: e.globalX, sy: e.globalY, mode: 'sel' }
        cbRef.current.onSelRectStart?.(cx, cy)
      }
    })
    app.stage.on('globalpointermove', (e: PIXI.FederatedPointerEvent) => {
      if (!zd) return
      const vs = viewRef.current
      const cx = (e.globalX - vs.ox - vs.panX) / (vs.baseScale * vs.zoom)
      const cy = (e.globalY - vs.oy - vs.panY) / (vs.baseScale * vs.zoom)
      if (zd.mode === 'zone') cbRef.current.onZoneDrawMove(cx, cy)
      else cbRef.current.onSelRectMove?.(cx, cy)
    })
    app.stage.on('pointerup', (e: PIXI.FederatedPointerEvent) => {
      if (!zd) return
      const vs = viewRef.current
      const cx = (e.globalX - vs.ox - vs.panX) / (vs.baseScale * vs.zoom)
      const cy = (e.globalY - vs.oy - vs.panY) / (vs.baseScale * vs.zoom)
      if (zd.mode === 'zone') cbRef.current.onZoneDrawEnd(cx, cy)
      else cbRef.current.onSelRectEnd?.(cx, cy)
      zd = null
    })

    // ResizeObserver: auto-resize renderer + recompute view
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (width < 10 || height < 10) return
        app.renderer.resize(Math.round(width), Math.round(height))
        app.stage.hitArea = new PIXI.Rectangle(0, 0, width, height)
        const vs = viewRef.current
        const nv = computeView(width, height, roomWidth, roomDepth, vs.zoom, vs.panX, vs.panY)
        Object.assign(vs, nv)
        applyRoomTransform(room, vs)
      }
    })
    ro.observe(el)

    return () => { ro.disconnect(); app.destroy(true, { children: true }); appRef.current = null; roomRef.current = null }
  }, [])

  // Rebuild scene
  useEffect(() => {
    const app = appRef.current; const room = roomRef.current
    if (!app || !room) return

    const sw = app.screen.width; const sh = app.screen.height
    const vs = viewRef.current
    const nv = computeView(sw, sh, roomWidth, roomDepth, vs.zoom, vs.panX, vs.panY)
    Object.assign(vs, nv)
    applyRoomTransform(room, vs)
    stateRef.current = { snap: snapEnabled, gu: gridUnit }

    room.removeChildren()
    const pxScale = vs.baseScale * vs.zoom || 1

    // Background
    const bg = new PIXI.Graphics()
    bg.beginFill(0x1A1A1A).lineStyle(2 / pxScale, 0x4A4A4A).drawRect(0, 0, roomWidth, roomDepth).endFill()
    bg.eventMode = 'none'
    room.addChild(bg)

    // Grid
    const gd = new PIXI.Graphics(); gd.lineStyle(1 / pxScale, 0x2E2E2E, 0.3)
    for (let i = 0; i <= roomWidth; i += gridUnit) { gd.moveTo(i, 0); gd.lineTo(i, roomDepth) }
    for (let j = 0; j <= roomDepth; j += gridUnit) { gd.moveTo(0, j); gd.lineTo(roomWidth, j) }
    gd.eventMode = 'none'; room.addChild(gd)

    // Zone draw preview
    if (zoneDrawing && zoneDrawRect) {
      const pr = new PIXI.Graphics()
      pr.lineStyle(1 / pxScale, 0xFFFFFF, 0.3); pr.beginFill(0xFFFFFF, 0.05)
      pr.drawRect(zoneDrawRect.x, zoneDrawRect.y, zoneDrawRect.w, zoneDrawRect.h)
      pr.endFill(); pr.eventMode = 'none'; room.addChild(pr)
    }
    // Selection rectangle
    if (!zoneDrawing && selRect) {
      const sr = new PIXI.Graphics()
      sr.lineStyle(1.5 / pxScale, 0x4488FF, 0.6); sr.beginFill(0x4488FF, 0.1)
      sr.drawRect(selRect.x, selRect.y, selRect.w, selRect.h)
      sr.endFill(); sr.eventMode = 'none'; room.addChild(sr)
    }

    // Zones
    zones.forEach((z) => {
      const c = new PIXI.Container(); c.x = z.x; c.y = z.y
      if (zoneDrawing) { c.eventMode = 'static'; c.cursor = 'move' }
      else { c.eventMode = 'static'; c.cursor = 'default' }
      const colour = sectionColours.get(z.sectionId) ?? '#4A4A4A'
      const nc = parseInt(colour.replace('#', ''), 16)
      const g = new PIXI.Graphics()
      const isSelected = z.id === selectedZoneId
      g.lineStyle((isSelected ? 2 : 1) / pxScale, isSelected ? 0xFFFFFF : nc, isSelected ? 0.6 : 0.4)
      g.beginFill(nc, 0.06).drawRect(0, 0, z.width, z.height).endFill()
      c.addChild(g)
      // Watermark (rotated if portrait)
      const secName = sectionNames.get(z.sectionId)
      if (secName) {
        const isPortrait = z.height > z.width * 1.2
        const lblScale = (z as any).labelScale ?? 1
        const fontSize = (isPortrait ? Math.max(z.width, z.height) : Math.min(z.width, z.height)) * 0.25 * textScale * lblScale
        const wm = new PIXI.Text(secName, { fontSize, fill: 0xFFFFFF, fontFamily: 'monospace', align: 'center' })
        wm.anchor.set(0.5); wm.x = z.width / 2; wm.y = z.height / 2; wm.alpha = 0.15; wm.eventMode = 'none'
        if (isPortrait) wm.rotation = -Math.PI / 2
        c.addChild(wm)
      }
      if (zoneDrawing) attachZoneDrag(c, z)
      if (zoneDrawing && isSelected) addZoneResizeHandles(c, z, pxScale)
      room.addChild(c)
    })

    // Build section colour map from zones for element grouping
    const zoneSectionColour = new Map<string, string>()
    zones.forEach((z) => {
      const col = sectionColours.get(z.sectionId)
      if (col) zoneSectionColour.set(z.sectionId, col)
    })

    // Elements
    ;[...elements].sort((a, b) => a.zIndex - b.zIndex).forEach((el) => {
      const c = new PIXI.Container(); c.x = el.x; c.y = el.y
      c.rotation = (el.rotation ?? 0) * (Math.PI / 180)
      c.eventMode = 'static'; c.cursor = 'pointer'
      const fill = el.fillColour ?? '#6B6B6B'
      const nf = parseInt(fill.replace('#', ''), 16)
      const isElSelected = selectedIds.includes(el.id!)
      const ns = isElSelected ? 0xFFFFFF : parseInt('#4A4A4A'.replace('#', ''), 16)
      const sw2 = (isElSelected ? 2 : 1) / pxScale
      const g = new PIXI.Graphics(); g.lineStyle(sw2, ns, el.opacity ?? 1); g.beginFill(nf, el.opacity ?? 1)
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

      // Section grouping overlay
      const secCol = el.sectionId ? zoneSectionColour.get(el.sectionId) : undefined
      if (secCol) {
        const sc = parseInt(secCol.replace('#', ''), 16)
        const ov = new PIXI.Graphics()
        const w = el.shape === 'CIRCLE' ? (el.radius ?? Math.min(el.width, el.depth) / 2) * 2 : el.width
        const h = el.shape === 'CIRCLE' ? w : el.depth
        ov.lineStyle(1.5 / pxScale, sc, 0.3)
        ov.beginFill(sc, 0.08)
        if (el.shape === 'CIRCLE') { ov.drawCircle(w / 2, h / 2, w / 2) }
        else { ov.drawRect(0, 0, w, h) }
        ov.endFill(); ov.eventMode = 'none'; c.addChild(ov)
      }

      // Label (use longer dimension for asymmetric elements)
      if (el.labelVisible !== false && el.label) {
        const minDim = Math.min(el.width, el.depth); const maxDim = Math.max(el.width, el.depth)
        const base = maxDim / minDim > 2 ? maxDim * 0.15 : minDim * 0.3
        const lblScale = ((el.style as any)?.labelScale ?? 1) as number
        const fs = Math.max(8, base * pxScale * textScale * lblScale)
        const t = new PIXI.Text(el.label, { fontSize: fs, fill: 0xCCCCCC, fontFamily: 'monospace', align: 'center' })
        t.anchor.set(0.5); t.x = el.width / 2; t.y = el.depth / 2; t.eventMode = 'none'; c.addChild(t)
      }

      // Visual chairs around tables
      if (el.type === 'TABLE' && (el.chairCount ?? 0) > 0) {
        const cc = el.chairCount ?? 0
        const chairStyle = ((el.style as any)?.chairStyle) ?? 'bracket'
        const chairSides: string[] = ((el.style as any)?.chairSides) ?? ['top', 'bottom', 'left', 'right']
        const sides = chairSides.filter((s) => ['top', 'bottom', 'left', 'right'].includes(s))
        const countPerSide = sides.length > 0 ? Math.ceil(cc / sides.length) : 0
        const chairR = 4 / pxScale; const chairGap = (chairStyle === 'bracket' ? 5 : 2) / pxScale
        const edgeDefs: Record<string, { x1: number; y1: number; x2: number; y2: number }> = {
          top: { x1: chairR, y1: -chairR - chairGap, x2: el.width - chairR, y2: -chairR - chairGap },
          right: { x1: el.width + chairR + chairGap, y1: chairR, x2: el.width + chairR + chairGap, y2: el.depth - chairR },
          bottom: { x1: el.width - chairR, y1: el.depth + chairR + chairGap, x2: chairR, y2: el.depth + chairR + chairGap },
          left: { x1: -chairR - chairGap, y1: el.depth - chairR, x2: -chairR - chairGap, y2: chairR },
        }
        let placed = 0
        for (const side of sides) {
          const sd = edgeDefs[side]
          if (!sd) continue
          const len = Math.sqrt((sd.x2 - sd.x1) ** 2 + (sd.y2 - sd.y1) ** 2)
          if (len < 0.1) continue
          const ux = (sd.x2 - sd.x1) / len; const uy = (sd.y2 - sd.y1) / len
          if (chairStyle === 'bracket') {
            // Bracket [ shape — line along edge + two short arms outward (extra gap)
            const bk = new PIXI.Graphics(); bk.lineStyle(sw2, 0x3A3A4A, 0.8)
            const armLen = chairR * 2.5
            // Use wider gap by offsetting edge positions further from table
            const perpX = side === 'top' || side === 'bottom' ? 0 : (side === 'left' ? 1 : -1)
            const perpY = side === 'top' ? 1 : (side === 'bottom' ? -1 : 0)
            // Main edge line
            bk.moveTo(sd.x1, sd.y1); bk.lineTo(sd.x2, sd.y2)
            // Two arms at ends
            bk.moveTo(sd.x1, sd.y1); bk.lineTo(sd.x1 + perpX * armLen, sd.y1 + perpY * armLen)
            bk.moveTo(sd.x2, sd.y2); bk.lineTo(sd.x2 + perpX * armLen, sd.y2 + perpY * armLen)
            bk.eventMode = 'none'; c.addChild(bk)
            placed += countPerSide
          } else {
            const spacing = len / Math.max(countPerSide, 1)
            for (let i = 0; i < countPerSide && placed < cc; i++) {
              const pxPos = sd.x1 + ux * (spacing * 0.5 + spacing * i)
              const pyPos = sd.y1 + uy * (spacing * 0.5 + spacing * i)
              const chair = new PIXI.Graphics()
              chair.beginFill(0x3A3A4A).lineStyle(sw2, 0x666666).drawCircle(pxPos, pyPos, chairR).endFill()
              chair.eventMode = 'none'; c.addChild(chair)
              placed++
            }
          }
        }
        if (placed > 0 && el.labelVisible !== false && el.label) {
          const capText = new PIXI.Text(`×${cc}`, { fontSize: Math.max(6, Math.min(el.width, el.depth) * 0.18 * pxScale * textScale), fill: 0xCCCCCC, fontFamily: 'monospace' })
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
        const l = new PIXI.Graphics(); l.lineStyle(1.5 / pxScale, 0xFFD700, 1)
        const bx = bench.x + bench.width / 2; const by = bench.y + bench.depth / 2
        const tx = table.x + table.width / 2; const ty = table.y + table.depth / 2
        const ddx = tx - bx; const ddy = ty - by; const dist = Math.sqrt(ddx * ddx + ddy * ddy)
        const ux = ddx / dist; const uy = ddy / dist; let p = 0
        while (p < dist) { const seg = Math.min(5, dist - p); l.moveTo(bx + ux * p, by + uy * p); l.lineTo(bx + ux * (p + seg), by + uy * (p + seg)); p += seg + 3 }
        l.eventMode = 'none'; room.addChild(l)
      })
    })
  }, [elements, zones, selectedIds, selectedZoneId, zoneDrawing, zoneDrawRect, selRect, roomWidth, roomDepth, gridUnit, snapEnabled, rebuildKey])

  function attachElementDrag(node: PIXI.Container, el: ElementData) {
    let dd: { sx: number; sy: number; ex: number; ey: number } | null = null
    node.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      e.stopPropagation()
      cbRef.current.onElementClick(el.id!, e.ctrlKey || e.shiftKey)
      dd = { sx: e.globalX, sy: e.globalY, ex: node.x, ey: node.y }
      const app = appRef.current
      if (!app) return
      const onMove = (ev: PIXI.FederatedPointerEvent) => {
        if (!dd) return; const st = stateRef.current
        const vs = viewRef.current
        let nx = dd.ex + (ev.globalX - dd.sx) / (vs.baseScale * vs.zoom)
        let ny = dd.ey + (ev.globalY - dd.sy) / (vs.baseScale * vs.zoom)
        if (st.snap) { nx = edgeSnap(nx, el.width, st.gu); ny = edgeSnap(ny, el.depth, st.gu) }
        node.x = nx; node.y = ny
      }
      const onUp = (ev: PIXI.FederatedPointerEvent) => {
        app.stage.off('globalpointermove', onMove); app.stage.off('pointerup', onUp)
        if (!dd) return; const st = stateRef.current
        const vs = viewRef.current
        let rx = dd.ex + (ev.globalX - dd.sx) / (vs.baseScale * vs.zoom)
        let ry = dd.ey + (ev.globalY - dd.sy) / (vs.baseScale * vs.zoom)
        if (st.snap) { rx = edgeSnap(rx, el.width, st.gu); ry = edgeSnap(ry, el.depth, st.gu) }
        rx = Math.max(0, Math.min(rx, roomWidth - el.width))
        ry = Math.max(0, Math.min(ry, roomDepth - el.depth))
        cbRef.current.onElementDragEnd(el.id!, rx, ry); dd = null
      }
      app.stage.on('globalpointermove', onMove); app.stage.on('pointerup', onUp)
    })
  }

  function addZoneResizeHandles(node: PIXI.Container, z: ZoneP, pxScale: number) {
    const hs = 6 / pxScale
    const defs = [
      { x: 0, y: 0, cursor: 'nwse-resize', dx_x: 1, dx_y: 1, dw: -1, dh: -1 },
      { x: z.width / 2, y: 0, cursor: 'ns-resize', dx_x: 0, dx_y: 1, dw: 0, dh: -1 },
      { x: z.width, y: 0, cursor: 'nesw-resize', dx_x: 0, dx_y: 1, dw: 1, dh: -1 },
      { x: 0, y: z.height / 2, cursor: 'ew-resize', dx_x: 1, dx_y: 0, dw: -1, dh: 0 },
      { x: z.width, y: z.height / 2, cursor: 'ew-resize', dx_x: 0, dx_y: 0, dw: 1, dh: 0 },
      { x: 0, y: z.height, cursor: 'nesw-resize', dx_x: 1, dx_y: 0, dw: -1, dh: 1 },
      { x: z.width / 2, y: z.height, cursor: 'ns-resize', dx_x: 0, dx_y: 0, dw: 0, dh: 1 },
      { x: z.width, y: z.height, cursor: 'nwse-resize', dx_x: 0, dx_y: 0, dw: 1, dh: 1 },
    ]
    for (const d of defs) {
      const hg = new PIXI.Graphics()
      hg.beginFill(0xFFFFFF).lineStyle(1 / pxScale, 0x000000).drawRect(d.x - hs / 2, d.y - hs / 2, hs, hs).endFill()
      hg.eventMode = 'static'; hg.cursor = d.cursor
      attachResizeHandleDrag(hg, z, d, pxScale)
      node.addChild(hg)
    }
  }

  function attachResizeHandleDrag(handle: PIXI.Graphics, z: ZoneP, cfg: { dx_x: number; dx_y: number; dw: number; dh: number }, pxScale: number) {
    let dd: { sx: number; sy: number; zx: number; zy: number; zw: number; zh: number } | null = null
    const gu = stateRef.current.gu
    handle.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      e.stopPropagation()
      dd = { sx: e.globalX, sy: e.globalY, zx: z.x, zy: z.y, zw: z.width, zh: z.height }
      const app = appRef.current
      if (!app) return
      const onMove = (ev: PIXI.FederatedPointerEvent) => {
        if (!dd) return
        const vs = viewRef.current
        let dx = (ev.globalX - dd.sx) / (vs.baseScale * vs.zoom)
        let dy = (ev.globalY - dd.sy) / (vs.baseScale * vs.zoom)
        dx = gridSnap(dx, gu); dy = gridSnap(dy, gu)
        let nx = dd.zx + dx * cfg.dx_x
        let ny = dd.zy + dy * cfg.dx_y
        let nw = dd.zw + dx * cfg.dw
        let nh = dd.zh + dy * cfg.dh
        if (nw < gu) { if (cfg.dw < 0) nx -= gu - nw; nw = gu }
        if (nh < gu) { if (cfg.dh < 0) ny -= gu - nh; nh = gu }
        cbRef.current.onZoneResize?.(z.id, nx, ny, nw, nh)
      }
      const onUp = (ev: PIXI.FederatedPointerEvent) => {
        app.stage.off('globalpointermove', onMove); app.stage.off('pointerup', onUp)
        if (!dd) return
        const vs = viewRef.current
        let dx = (ev.globalX - dd.sx) / (vs.baseScale * vs.zoom)
        let dy = (ev.globalY - dd.sy) / (vs.baseScale * vs.zoom)
        dx = gridSnap(dx, gu); dy = gridSnap(dy, gu)
        let nx = dd.zx + dx * cfg.dx_x
        let ny = dd.zy + dy * cfg.dx_y
        let nw = dd.zw + dx * cfg.dw
        let nh = dd.zh + dy * cfg.dh
        if (nw < gu) { if (cfg.dw < 0) nx -= gu - nw; nw = gu }
        if (nh < gu) { if (cfg.dh < 0) ny -= gu - nh; nh = gu }
        cbRef.current.onZoneResize?.(z.id, nx, ny, nw, nh)
        dd = null
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
