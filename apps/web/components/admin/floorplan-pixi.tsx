'use client'

import { useRef, useEffect } from 'react'
import * as PIXI from 'pixi.js'
import { isFixture, type ElementData } from '@/components/admin/floorplan-elements'
import { pointInPolygon } from '@/lib/floorplan-inventory'
import {
  outlineOf,
  chairWorldPlacements,
  projectToPerimeter,
  type FurnitureGeometry,
} from '@/lib/furniture'

interface ZoneP { id: string; x: number; y: number; width: number; height: number; sectionId: string; label?: string }

export interface ViewState {
  baseScale: number; ox: number; oy: number
  zoom: number; panX: number; panY: number
}

export interface SectionBoundaryP {
  id: string; shape: string; x: number; y: number
  width?: number | null; height?: number | null
  vertices?: { x: number; y: number }[] | null
  sectionId: string; sectionName?: string
}

/**
 * A placed piece of furniture as the canvas needs it. Geometry is denormalised
 * onto the placement so the renderer never has to look anything up mid-draw.
 */
export interface SetupItemP {
  id: string
  /** @deprecated Pre-migration rows only. */
  tableProfileId?: string | null
  furnitureItemId?: string | null
  x: number
  y: number
  rotation: number
  width: number
  depth: number
  /** "RECTANGLE" | "CIRCLE" | "POLYGON" */
  shape?: string | null
  vertices?: { x: number; y: number }[] | null
  label?: string | null
  colour?: string
  chairCount?: number
  tableGroupId?: string | null
  /** @deprecated Superseded by `chairs`. */
  chairEdges?: { top: number; bottom: number; left: number; right: number } | null
  chairs?: { id: string; t: number; offset?: number }[] | null
  /** Real chair dimensions in cm, so seats draw to scale. */
  chairWidth?: number
  chairDepth?: number
}

interface PixiCanvasProps {
  roomWidth: number; roomDepth: number; gridUnit: number
  elements: ElementData[]
  zones: ZoneP[]
  selectedIds: string[]
  snapEnabled: boolean
  snapThreshold?: number
  sectionColours: Map<string, string>
  sectionNames: Map<string, string>
  sectionBoundaries?: SectionBoundaryP[]
  zoneDrawing: boolean
  zoneDrawStart: { x: number; y: number } | null
  zoneDrawRect: { x: number; y: number; w: number; h: number } | null
  selectedZoneId: string | null
  containerRef: React.RefObject<HTMLDivElement | null>
  viewRef: React.MutableRefObject<ViewState>
  onElementClick: (id: string | null, ctrlKey?: boolean) => void
  onElementDragEnd: (id: string, x: number, y: number) => void
  onElementDropToSection?: (id: string, sectionId: string) => void
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
  showDimensions?: boolean
  rebuildKey?: number
  // Setup layer — one placed piece of furniture
  setupItems?: SetupItemP[]
  setupSelectedIds?: string[]
  onSetupItemClick?: (id: string | null, ctrlKey?: boolean) => void
  onSetupItemDragEnd?: (id: string, x: number, y: number) => void
  onSetupChairEdge?: (id: string, edge: 'top' | 'bottom' | 'left' | 'right', delta: number) => void
  onSetupItemRotate?: (id: string, rotation: number) => void
  onSetupItemsJoin?: (draggedId: string, targetId: string) => void
  /** Drag a chair around its furniture's outline; `t` is 0..1 around the perimeter. */
  onSetupChairMove?: (itemId: string, chairId: string, t: number) => void
  /** Click the outline to add a chair, or a chair to remove it. */
  onSetupChairAdd?: (itemId: string, t: number) => void
  onSetupChairRemove?: (itemId: string, chairId: string) => void
  /** A palette tile is armed — the next canvas click drops it. */
  armedPlacement?: boolean
  onCanvasPlace?: (x: number, y: number) => void
  ghostMode?: boolean
  wallDrawing?: boolean
  wallPoints?: { x: number; y: number }[]
  onWallPoint?: (x: number, y: number) => void
  zonePolyMode?: boolean
  zonePolyPoints?: { x: number; y: number }[]
  onZonePolyAdd?: (x: number, y: number) => void
  // Precomputed merged-group outlines + redistributed chairs (room coords)
  setupGroups?: { id: string; outline: [number, number][][]; chairs: { x: number; y: number }[] }[]
  // Live per-section totals, keyed by sectionId → shown as a badge on each zone
  zoneTotals?: Record<string, { tables: number; seats: number }>
  // When a setup is active, dim + lock the base plan (walls/fixtures/zones)
  setupActive?: boolean
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
  snapThreshold = 15,
  sectionColours, sectionNames, sectionBoundaries, zoneDrawing, zoneDrawStart, zoneDrawRect, selectedZoneId,
  containerRef, viewRef,
  onElementClick, onElementDragEnd, onElementDropToSection, onZoneClick, onZoneDragEnd,
  onZoneDrawStart, onZoneDrawMove, onZoneDrawEnd, onZoneResize, onViewChange,
  textScale = 1, selRect, onSelRectStart, onSelRectMove, onSelRectEnd,
  rebuildKey, showDimensions = false,
  setupItems, setupSelectedIds, onSetupItemClick, onSetupItemDragEnd, onSetupChairEdge, onSetupItemRotate, onSetupItemsJoin, setupGroups, zoneTotals, setupActive = false, ghostMode = false,
  onSetupChairMove, onSetupChairAdd, onSetupChairRemove, armedPlacement = false, onCanvasPlace,
  wallDrawing, wallPoints, onWallPoint,
  zonePolyMode, zonePolyPoints, onZonePolyAdd,
}: PixiCanvasProps) {
  const appRef = useRef<PIXI.Application | null>(null)
  const roomRef = useRef<PIXI.Container | null>(null)
  const baseRef = useRef<PIXI.Container | null>(null)
  const setupRef = useRef<PIXI.Container | null>(null)
  const boundaryRef = useRef<PIXI.Container | null>(null)
  const stateRef = useRef({ snap: snapEnabled, gu: gridUnit })
  // Keep current room dimensions available to the init-effect handlers (which have [] deps)
  const dimsRef = useRef({ roomWidth, roomDepth, gridUnit })
  dimsRef.current = { roomWidth, roomDepth, gridUnit }
  const cbRef = useRef({ onElementClick, onElementDragEnd, onElementDropToSection, onZoneClick, onZoneDragEnd, onZoneDrawStart, onZoneDrawMove, onZoneDrawEnd, onZoneResize, onViewChange, zoneDrawing, onSelRectStart, onSelRectMove, onSelRectEnd, showDimensions, onSetupItemClick, onSetupItemDragEnd, onSetupChairEdge, onSetupItemRotate, onSetupItemsJoin, onSetupChairMove, onSetupChairAdd, onSetupChairRemove, onCanvasPlace, armedPlacement })
  cbRef.current = { onElementClick, onElementDragEnd, onElementDropToSection, onZoneClick, onZoneDragEnd, onZoneDrawStart, onZoneDrawMove, onZoneDrawEnd, onZoneResize, onViewChange, zoneDrawing, onSelRectStart, onSelRectMove, onSelRectEnd, showDimensions, onSetupItemClick, onSetupItemDragEnd, onSetupChairEdge, onSetupItemRotate, onSetupItemsJoin, onSetupChairMove, onSetupChairAdd, onSetupChairRemove, onCanvasPlace, armedPlacement }

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

    const baseLayer = new PIXI.Container()
    baseRef.current = baseLayer
    room.addChild(baseLayer)

    const boundaryLayer = new PIXI.Container()
    boundaryRef.current = boundaryLayer
    room.addChild(boundaryLayer)

    const setupLayer = new PIXI.Container()
    setupRef.current = setupLayer
    room.addChild(setupLayer)

    const vs = computeView(w, h, roomWidth, roomDepth, 1, 0, 0)
    viewRef.current = vs
    applyRoomTransform(room, vs)

    // Stage click to deselect
    app.stage.eventMode = 'static'
    app.stage.hitArea = new PIXI.Rectangle(0, 0, w, h)
    app.stage.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
        if (e.target === app.stage) { 
        if (wallDrawing && onWallPoint) {
          const vs = viewRef.current
          const wx = (e.globalX - vs.ox) / (vs.baseScale * vs.zoom)
          const wy = (e.globalY - vs.oy) / (vs.baseScale * vs.zoom)
          onWallPoint(wx, wy)
          return
        }
        if (zonePolyMode && onZonePolyAdd) {
          const vs = viewRef.current
          const px = (e.globalX - vs.ox) / (vs.baseScale * vs.zoom)
          const py = (e.globalY - vs.oy) / (vs.baseScale * vs.zoom)
          onZonePolyAdd(px, py)
          return
        }
        cbRef.current.onElementClick(null); cbRef.current.onSetupItemClick?.(null); cbRef.current.onZoneClick(null) 
      }
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
      if (e.button !== 0) return
      if (e.target !== app.stage) return
      const vs = viewRef.current
      const cx = (e.globalX - vs.ox - vs.panX) / (vs.baseScale * vs.zoom)
      const cy = (e.globalY - vs.oy - vs.panY) / (vs.baseScale * vs.zoom)
      // A palette tile is armed: this click drops it rather than starting a
      // selection rectangle. Checked first so click-to-place always wins.
      if (cbRef.current.armedPlacement && cbRef.current.onCanvasPlace) {
        cbRef.current.onCanvasPlace(cx, cy)
        return
      }
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
        const nv = computeView(width, height, dimsRef.current.roomWidth, dimsRef.current.roomDepth, vs.zoom, vs.panX, vs.panY)
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
    const baseLayer = baseRef.current; const setupLayer = setupRef.current
    const boundaryLayer = boundaryRef.current
    if (!app || !room) return

    const sw = app.screen.width; const sh = app.screen.height
    const vs = viewRef.current
    const nv = computeView(sw, sh, roomWidth, roomDepth, vs.zoom, vs.panX, vs.panY)
    Object.assign(vs, nv)
    applyRoomTransform(room, vs)
    stateRef.current = { snap: snapEnabled, gu: gridUnit }

    room.removeChildren()
    if (baseLayer) { baseLayer.removeChildren(); room.addChild(baseLayer) }
    if (boundaryLayer) { boundaryLayer.removeChildren(); room.addChild(boundaryLayer) }
    if (setupLayer) { setupLayer.removeChildren(); room.addChild(setupLayer) }
    // Two-layer lock: dim + disable the base plan while a setup is active
    if (baseLayer) { baseLayer.alpha = setupActive ? 0.5 : 1; baseLayer.eventMode = setupActive ? 'none' : 'auto' }
    const pxScale = vs.baseScale * vs.zoom || 1

    // Background
    const bg = new PIXI.Graphics()
    bg.beginFill(0x1A1A1A).lineStyle(2 / pxScale, 0x4A4A4A).drawRect(0, 0, roomWidth, roomDepth).endFill()
    bg.eventMode = 'none'
    baseLayer?.addChild(bg)

    // Grid
    const gd = new PIXI.Graphics(); gd.lineStyle(1 / pxScale, 0x2E2E2E, 0.3)
    for (let i = 0; i <= roomWidth; i += gridUnit) { gd.moveTo(i, 0); gd.lineTo(i, roomDepth) }
    for (let j = 0; j <= roomDepth; j += gridUnit) { gd.moveTo(0, j); gd.lineTo(roomWidth, j) }
    gd.eventMode = 'none'; baseLayer?.addChild(gd)

    // Zone draw preview
    if (zoneDrawing && zoneDrawRect) {
      const pr = new PIXI.Graphics()
      pr.lineStyle(1 / pxScale, 0xFFFFFF, 0.3); pr.beginFill(0xFFFFFF, 0.05)
      pr.drawRect(zoneDrawRect.x, zoneDrawRect.y, zoneDrawRect.w, zoneDrawRect.h)
      pr.endFill(); pr.eventMode = 'none'; baseLayer?.addChild(pr)
    }
    // Zone polygon preview
    if (zonePolyMode && zonePolyPoints && zonePolyPoints.length >= 2) {
      const pg = new PIXI.Graphics()
      pg.lineStyle(1.5 / pxScale, 0xFFFFFF, 0.5); pg.beginFill(0xFFFFFF, 0.05)
      pg.moveTo(zonePolyPoints[0].x, zonePolyPoints[0].y)
      for (let i = 1; i < zonePolyPoints.length; i++) pg.lineTo(zonePolyPoints[i].x, zonePolyPoints[i].y)
      pg.lineTo(zonePolyPoints[0].x, zonePolyPoints[0].y)
      pg.endFill(); pg.eventMode = 'none'; baseLayer?.addChild(pg)
      zonePolyPoints.forEach((p) => {
        const dot = new PIXI.Graphics(); dot.beginFill(0xFFFFFF).drawCircle(0, 0, 3 / pxScale).endFill()
        dot.x = p.x; dot.y = p.y; dot.eventMode = 'none'; baseLayer?.addChild(dot)
      })
    }
    // Selection rectangle
    if (!zoneDrawing && selRect) {
      const sr = new PIXI.Graphics()
      sr.lineStyle(1.5 / pxScale, 0x4488FF, 0.6); sr.beginFill(0x4488FF, 0.1)
      sr.drawRect(selRect.x, selRect.y, selRect.w, selRect.h)
      sr.endFill(); sr.eventMode = 'none'; baseLayer?.addChild(sr)
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
      if ((z as any).vertices && Array.isArray((z as any).vertices) && (z as any).vertices.length >= 3) {
        const verts = (z as any).vertices
        g.beginFill(nc, 0.06); g.moveTo(verts[0].x, verts[0].y)
        for (let i = 1; i < verts.length; i++) g.lineTo(verts[i].x, verts[i].y)
        g.closePath(); g.endFill()
      } else {
        g.beginFill(nc, 0.06).drawRect(0, 0, z.width, z.height).endFill()
      }
      c.addChild(g)
      // Watermark (rotated if portrait)
      const secName = sectionNames.get(z.sectionId)
      if (secName) {
        const isPortrait = z.height > z.width * 1.2
        const lblScale = (z as any).labelScale ?? 1
        const rawSize = (isPortrait ? Math.max(z.width, z.height) : Math.min(z.width, z.height)) * 0.25 * textScale * lblScale
        const fontSize = Math.max(12, Math.min(rawSize, 24 * textScale))
        const wm = new PIXI.Text(secName, { fontSize, fill: 0xFFFFFF, fontFamily: 'monospace', align: 'center' })
        wm.anchor.set(0.5); wm.x = z.width / 2; wm.y = z.height / 2; wm.alpha = 0.15; wm.eventMode = 'none'
        if (isPortrait) wm.rotation = -Math.PI / 2
        c.addChild(wm)
      }
      // Live totals badge
      const zt = zoneTotals?.[z.sectionId]
      if (zt && (zt.tables > 0 || zt.seats > 0)) {
        const badge = new PIXI.Text(`${zt.tables} TBL · ${zt.seats} PAX`, {
          fontSize: Math.max(12, Math.min(z.width, z.height) * 0.06) * textScale,
          fill: 0xFFFFFF, fontFamily: 'monospace',
        })
        badge.x = 6; badge.y = 6; badge.alpha = 1; badge.eventMode = 'none'
        c.addChild(badge)
      }
      if (zoneDrawing) attachZoneDrag(c, z)
      if (zoneDrawing && isSelected) addZoneResizeHandles(c, z, pxScale)
      baseLayer?.addChild(c)
    })

    // Section boundaries
    if (sectionBoundaries && boundaryLayer) {
      sectionBoundaries.forEach((b) => {
        const g = new PIXI.Graphics()
        const colour = sectionColours.get(b.sectionId) ?? '#4A4A4A'
        const nc = parseInt(colour.replace('#', ''), 16)
        g.lineStyle(1.5 / pxScale, nc, 0.35)
        g.beginFill(nc, 0.04)
        if (b.shape === 'CIRCLE') {
          g.drawCircle(b.x, b.y, b.width ?? 50)
        } else if (b.shape === 'POLYGON' && b.vertices) {
          g.moveTo(b.x + b.vertices[0].x, b.y + b.vertices[0].y)
          for (let i = 1; i < b.vertices.length; i++) {
            g.lineTo(b.x + b.vertices[i].x, b.y + b.vertices[i].y)
          }
          g.closePath()
        } else {
          g.drawRect(b.x, b.y, b.width ?? 100, b.height ?? 100)
        }
        g.endFill()
        g.eventMode = 'none'
        boundaryLayer.addChild(g)

        if (b.sectionName) {
          const bw = b.width ?? 100; const bh = b.height ?? 100
          const fs = Math.min(bw, bh) * 0.2 * textScale
          const lbl = new PIXI.Text(b.sectionName, {
            fontSize: Math.max(8, fs), fill: nc, fontFamily: 'monospace', align: 'center',
          })
          lbl.anchor.set(0.5); lbl.x = b.x + bw / 2; lbl.y = b.y + bh / 2
          lbl.alpha = 0.18; lbl.eventMode = 'none'
          boundaryLayer.addChild(lbl)
        }
      })
    }

    // Build section colour map from zones for element grouping
    const zoneSectionColour = new Map<string, string>()
    zones.forEach((z) => {
      const col = sectionColours.get(z.sectionId)
      if (col) zoneSectionColour.set(z.sectionId, col)
    })

    // Elements (fixtures below, furniture above)
    ;[...elements].sort((a, b) => {
      const aF = isFixture(a.type), bF = isFixture(b.type)
      if (aF && !bF) return -1
      if (!aF && bF) return 1
      return a.zIndex - b.zIndex
    }).forEach((el) => {
      const c = new PIXI.Container(); c.x = el.x; c.y = el.y
      c.rotation = (el.rotation ?? 0) * (Math.PI / 180)
      c.eventMode = 'static'; c.cursor = 'pointer'
      c.on('pointerover', () => { if (!selectedIds.includes(el.id!)) c.alpha = 0.75 })
      c.on('pointerout', () => { c.alpha = 1 })
      const fill = el.fillColour ?? '#6B6B6B'
      const nf = parseInt(fill.replace('#', ''), 16)
      const isElSelected = selectedIds.includes(el.id!)
      const ns = isElSelected ? 0xFFFFFF : parseInt('#4A4A4A'.replace('#', ''), 16)
      const sw2 = (isElSelected ? 2 : 1) / pxScale
      const isPolygon = el.shape === 'POLYGON' && el.vertices && el.vertices.length > 2
      const g = new PIXI.Graphics(); g.lineStyle(sw2, ns, el.opacity ?? 1); g.beginFill(nf, el.opacity ?? 1)
      if (isPolygon) {
        const verts = el.vertices!
        g.moveTo(verts[0].x, verts[0].y)
        for (let i = 1; i < verts.length; i++) g.lineTo(verts[i].x, verts[i].y)
        g.closePath(); g.endFill(); c.addChild(g)
        const cv: { x: number; y: number }[] = (el.style as any)?.cushionVertices
        if (cv && cv.length > 2) {
          const cg = new PIXI.Graphics()
          cg.lineStyle(sw2, ns, 0.5)
          cg.moveTo(cv[0].x, cv[0].y)
          for (let i = 1; i < cv.length; i++) cg.lineTo(cv[i].x, cv[i].y)
          cg.closePath(); cg.eventMode = 'none'; c.addChild(cg)
        }
      } else if (el.shape === 'CIRCLE') {
        g.drawCircle(0, 0, el.radius ?? Math.min(el.width, el.depth) / 2); g.endFill(); c.addChild(g)
      } else {
        const w = el.width; const h = el.depth
        const cr: number[] = ((el.style as any)?.cornerRadius) ?? [0, 0, 0, 0]
        const [tl, tr, br, bl] = cr
        if (tl > 0 || tr > 0 || br > 0 || bl > 0) {
          g.moveTo(tl, 0); g.lineTo(w - tr, 0); if (tr > 0) g.arcTo(w, 0, w, tr, tr)
          g.lineTo(w, h - br); if (br > 0) g.arcTo(w, h, w - br, h, br)
          g.lineTo(bl, h); if (bl > 0) g.arcTo(0, h, 0, h - bl, bl)
          g.lineTo(0, tl); if (tl > 0) g.arcTo(0, 0, tl, 0, tl); g.closePath()
        } else { g.drawRect(0, 0, w, h) }
        g.endFill(); c.addChild(g)
      }

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

      // Label (skip for polygon — drawn at centroid above)
      if (!isPolygon && el.labelVisible !== false && el.label) {
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
        const chairR = 4 / pxScale
        const chairGap = 2 / pxScale
        const bracketGap = (5 - 4) / pxScale // 5cm total from table edge to bracket line, minus chairR inset
        const gap = chairStyle === 'bracket' ? bracketGap : chairGap
        const edgeDefs: Record<string, { x1: number; y1: number; x2: number; y2: number }> = {
          top: { x1: chairR, y1: -chairR - gap, x2: el.width - chairR, y2: -chairR - gap },
          right: { x1: el.width + chairR + gap, y1: chairR, x2: el.width + chairR + gap, y2: el.depth - chairR },
          bottom: { x1: el.width - chairR, y1: el.depth + chairR + gap, x2: chairR, y2: el.depth + chairR + gap },
          left: { x1: -chairR - gap, y1: el.depth - chairR, x2: -chairR - gap, y2: chairR },
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

      // Dimension overlay for selected elements
      const showDim = cbRef.current.showDimensions
      if (isElSelected && showDim && el.shape !== 'CIRCLE') {
        const dimGap = 10 / pxScale
        const dimLine = new PIXI.Graphics()
        dimLine.lineStyle(0.5 / pxScale, 0x4488FF, 0.5)
        // Width dimension line (below element)
        const wMidY = el.depth + dimGap
        dimLine.moveTo(0, wMidY)
        dimLine.lineTo(el.width / 2 - 16 / pxScale, wMidY)
        dimLine.moveTo(el.width / 2 + 16 / pxScale, wMidY)
        dimLine.lineTo(el.width, wMidY)
        // Width end ticks
        dimLine.moveTo(0, wMidY - 4 / pxScale)
        dimLine.lineTo(0, wMidY + 4 / pxScale)
        dimLine.moveTo(el.width, wMidY - 4 / pxScale)
        dimLine.lineTo(el.width, wMidY + 4 / pxScale)
        // Depth dimension line (right of element)
        const dMidX = el.width + dimGap
        dimLine.moveTo(dMidX, 0)
        dimLine.lineTo(dMidX, el.depth / 2 - 16 / pxScale)
        dimLine.moveTo(dMidX, el.depth / 2 + 16 / pxScale)
        dimLine.lineTo(dMidX, el.depth)
        // Depth end ticks
        dimLine.moveTo(dMidX - 4 / pxScale, 0)
        dimLine.lineTo(dMidX + 4 / pxScale, 0)
        dimLine.moveTo(dMidX - 4 / pxScale, el.depth)
        dimLine.lineTo(dMidX + 4 / pxScale, el.depth)
        dimLine.eventMode = 'none'
        c.addChild(dimLine)
        // Width label
        const wLabel = new PIXI.Text(`${el.width}`, {
          fontSize: Math.max(8, 10 * pxScale * textScale), fill: 0x4488FF, fontFamily: 'monospace',
        })
        wLabel.anchor.set(0.5)
        wLabel.x = el.width / 2
        wLabel.y = wMidY
        wLabel.eventMode = 'none'
        c.addChild(wLabel)
        // Depth label
        const dLabel = new PIXI.Text(`${el.depth}`, {
          fontSize: Math.max(8, 10 * pxScale * textScale), fill: 0x4488FF, fontFamily: 'monospace',
        })
        dLabel.anchor.set(0.5)
        dLabel.x = dMidX
        dLabel.y = el.depth / 2
        dLabel.eventMode = 'none'
        c.addChild(dLabel)
      }

      attachElementDrag(c, el)
      const isFixtureEl = isFixture(el.type)
      if (isFixtureEl) { baseLayer?.addChild(c) } else { setupLayer?.addChild(c) }
    })

    // Door swing arcs / sliding arrows
    elements.filter((e) => e.type === 'DOOR').forEach((door) => {
      const isSliding = ((door.style as any)?.doorType) === 'SLIDING'
      const g = new PIXI.Graphics()
      const cx = door.x + door.width / 2
      const cy = door.y + door.depth / 2
      const r = Math.max(door.width, door.depth) * 1.2
      if (isSliding) {
        // Sliding door — draw arrow along the door's depth axis
        g.lineStyle(2 / pxScale, 0x6B4226, 0.7)
        const half = door.depth / 2
        g.moveTo(cx, cy - half); g.lineTo(cx, cy + half)
        const ah = 6 / pxScale
        g.moveTo(cx - ah, cy - half + ah); g.lineTo(cx, cy - half); g.lineTo(cx + ah, cy - half + ah)
        g.moveTo(cx - ah, cy + half - ah); g.lineTo(cx, cy + half); g.lineTo(cx + ah, cy + half - ah)
      } else {
        // Swing door — quarter circle arc
        g.lineStyle(1.5 / pxScale, 0x6B4226, 0.5)
        g.arc(cx, cy, r, 0, Math.PI / 2)
      }
      g.eventMode = 'none'
      const layer = isFixture(door.type) ? baseLayer : setupLayer
      if (layer) layer.addChild(g)
    })

    // Bench connectors (rectangular and polygon booths)
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
        l.eventMode = 'none'; setupLayer?.addChild(l)
      })
    })

    // Merged group outlines + redistributed chairs (room coords)
    if (setupGroups && setupLayer) {
      setupGroups.forEach((grp) => {
        const og = new PIXI.Graphics()
        og.lineStyle(2 / pxScale, 0xFFD700, 0.7)
        grp.outline.forEach((ring) => {
          if (ring.length < 2) return
          og.moveTo(ring[0][0], ring[0][1])
          for (let i = 1; i < ring.length; i++) og.lineTo(ring[i][0], ring[i][1])
          og.closePath()
        })
        og.eventMode = 'none'; setupLayer.addChild(og)
        const cg = new PIXI.Graphics()
        cg.beginFill(0x3A3A4A).lineStyle(0.75 / pxScale, 0x888888)
        grp.chairs.forEach((ch) => cg.drawCircle(ch.x, ch.y, 6))
        cg.endFill(); cg.eventMode = 'none'; setupLayer.addChild(cg)
      })
    }

    // Setup items
    if (setupItems && setupLayer) {
      setupItems.forEach((item) => {
        const c = new PIXI.Container()
        c.x = item.x; c.y = item.y
        c.rotation = (item.rotation ?? 0) * (Math.PI / 180)
        if (ghostMode) { c.alpha = 0.2; c.eventMode = 'none'; c.cursor = 'default' }
        else { c.eventMode = 'static'; c.cursor = 'pointer' }
        c.on('pointerover', () => { if (!setupSelectedIds?.includes(item.id)) c.alpha = 0.75 })
        c.on('pointerout', () => { c.alpha = 1 })

        const fill = parseInt((item.colour ?? '#555').replace('#', ''), 16)
        const isSel = setupSelectedIds?.includes(item.id)

        // Draw the furniture's real outline — a rectangle, a circle, or the
        // freeform shape drawn in the furniture editor. Everything reduces to
        // one closed ring so there is a single drawing path.
        const geom = {
          shape: (item.shape as 'RECTANGLE' | 'CIRCLE' | 'POLYGON') ?? 'RECTANGLE',
          width: item.width,
          depth: item.depth,
          vertices: item.vertices ?? null,
        }
        const ring = outlineOf(geom)

        const g = new PIXI.Graphics()
        g.lineStyle((isSel ? 2 : 1) / pxScale, isSel ? 0xFFFFFF : 0x666666, 0.9)
        g.beginFill(fill, 0.7)
        g.drawPolygon(ring.flatMap((v) => [v.x, v.y]))
        g.endFill()
        c.addChild(g)

        // (Grouped items get a single merged outline drawn above, in room coords)

        // Label (assigned number or profile name)
        if (item.label) {
          const fs = Math.max(8, Math.min(item.width, item.depth) * 0.25 * pxScale * textScale)
          const lbl = new PIXI.Text(item.label, {
            fontSize: fs, fill: 0xFFFFFF, fontFamily: 'monospace', align: 'center',
          })
          lbl.anchor.set(0.5); lbl.x = item.width / 2; lbl.y = item.depth / 2
          lbl.eventMode = 'none'; c.addChild(lbl)
        }

        // Chairs — positioned around the outline and individually draggable.
        // Grouped tables get one merged chair run drawn elsewhere, so skip them.
        const chairs = item.chairs ?? []
        const singleSel = isSel && (setupSelectedIds?.length ?? 0) === 1 && !item.tableGroupId
        const chairW = item.chairWidth ?? 45
        const chairD = item.chairDepth ?? 45

        if (chairs.length > 0 && !item.tableGroupId && !ghostMode) {
          // Chair positions are computed in the item's own local space, so the
          // container's rotation carries them without extra maths here.
          const placements = chairWorldPlacements(
            geom,
            { x: 0, y: 0, rotation: 0 },
            chairs,
            Math.max(4, chairD / 2),
          )

          placements.forEach((p) => {
            const chairG = new PIXI.Graphics()
            chairG.beginFill(0x3A3A4A, 0.95).lineStyle(0.75 / pxScale, 0xA0A0A0, 0.9)
            // Drawn to the real chair's footprint, centred on its seat point.
            chairG.drawRoundedRect(-chairW / 2, -chairD / 2, chairW, chairD, Math.min(chairW, chairD) * 0.2)
            chairG.endFill()
            // A short bar on the table side reads as the chair back.
            chairG.beginFill(0xA0A0A0, 0.8)
            chairG.drawRect(-chairW / 2, chairD / 2 - chairD * 0.12, chairW, chairD * 0.12)
            chairG.endFill()

            chairG.x = p.x
            chairG.y = p.y
            chairG.rotation = ((p.rotation - 90) * Math.PI) / 180

            if (singleSel) {
              chairG.eventMode = 'static'
              chairG.cursor = 'grab'
              attachChairDrag(chairG, item, p.id, geom)
            } else {
              chairG.eventMode = 'none'
            }
            c.addChild(chairG)
          })
        }

        // Clicking the outline of a selected table seats someone there.
        if (singleSel && cbRef.current.onSetupChairAdd) {
          const hit = new PIXI.Graphics()
          hit.lineStyle(10 / pxScale, 0x4488FF, 0.001) // invisible but hittable
          hit.drawPolygon(ring.flatMap((v) => [v.x, v.y]))
          hit.eventMode = 'static'
          hit.cursor = 'copy'
          hit.on('pointertap', (e: PIXI.FederatedPointerEvent) => {
            e.stopPropagation()
            const local = c.toLocal(e.global)
            cbRef.current.onSetupChairAdd?.(item.id, projectToPerimeter(ring, local.x, local.y).t)
          })
          c.addChild(hit)
        }

        // Chair total badge
        const cc = chairs.length > 0 ? chairs.length : (item.chairCount ?? 0)
        if (cc > 0 && item.label) {
          const badge = new PIXI.Text(`×${cc}`, {
            fontSize: Math.max(7, Math.min(item.width, item.depth) * 0.14 * pxScale * textScale),
            fill: 0xCCCCCC, fontFamily: 'monospace',
          })
          badge.anchor.set(0, 0.5); badge.x = item.width / 2 + 3; badge.y = item.depth / 2
          badge.eventMode = 'none'; c.addChild(badge)
        }

        attachSetupItemDrag(c, item)

        // Rotation handle when singly selected. The old per-edge +/− chair tabs
        // are gone: chairs are dragged around the outline directly now, which
        // works on shapes that have no "top" or "left" edge to label.
        if (singleSel) {
          // Rotation handle
          const rotOff = 34
          const stem = new PIXI.Graphics()
          stem.lineStyle(1 / pxScale, 0x4488FF, 0.8)
          stem.moveTo(item.width / 2, 0); stem.lineTo(item.width / 2, -rotOff)
          stem.eventMode = 'none'; c.addChild(stem)
          const handle = new PIXI.Graphics()
          handle.beginFill(0x4488FF, 0.9).lineStyle(1 / pxScale, 0xFFFFFF, 0.9)
          handle.drawCircle(item.width / 2, -rotOff, 7).endFill()
          handle.eventMode = 'static'; handle.cursor = 'grab'
          attachRotationHandle(handle, c, item)
          c.addChild(handle)
        }

        setupLayer.addChild(c)
      })
    }
  }, [elements, zones, selectedIds, selectedZoneId, zoneDrawing, zoneDrawRect, selRect, roomWidth, roomDepth, gridUnit, snapEnabled, rebuildKey, showDimensions, setupItems, setupSelectedIds, setupGroups, zoneTotals, setupActive, textScale])

  function magneticSnap(
    item: { x: number; y: number; width: number; depth: number; rotation: number },
    targets: { x: number; y: number; width: number; depth: number; rotation: number }[],
    threshold: number,
  ): { x: number; y: number; rotation: number; targetIndex: number } | null {
    if (targets.length === 0 || threshold <= 0) return null
    const degToRad = Math.PI / 180

    function corners(t: typeof item): [number, number][] {
      const hw = t.width / 2; const hd = t.depth / 2
      const cx = t.x + hw; const cy = t.y + hd
      const cr = Math.cos(t.rotation * degToRad); const sr = Math.sin(t.rotation * degToRad)
      const local: [number, number][] = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]
      return local.map(([lx, ly]) => [cx + lx * cr - ly * sr, cy + lx * sr + ly * cr] as [number, number])
    }

    const itemCorners = corners(item)
    const itemEdges = itemCorners.map((_, i) => {
      const j = (i + 1) % 4
      const [x1, y1] = itemCorners[i]
      const [x2, y2] = itemCorners[j]
      const dx = x2 - x1; const dy = y2 - y1
      const len = Math.sqrt(dx * dx + dy * dy)
      return { x1, y1, x2, y2, len, ux: dx / len, uy: dy / len,
        nx: -dy / len, ny: dx / len, midX: (x1 + x2) / 2, midY: (y1 + y2) / 2 }
    })

    let bestDist = threshold
    let best: { x: number; y: number; rotation: number; targetIndex: number } | null = null

    for (let targetIndex = 0; targetIndex < targets.length; targetIndex++) {
      const target = targets[targetIndex]
      const tc = corners(target)
      for (let ti = 0; ti < 4; ti++) {
        const tj = (ti + 1) % 4
        const [tx1, ty1] = tc[ti]; const [tx2, ty2] = tc[tj]
        const tdx = tx2 - tx1; const tdy = ty2 - ty1
        const tlen = Math.sqrt(tdx * tdx + tdy * tdy)
        const tux = tdx / tlen; const tuy = tdy / tlen

        for (const ie of itemEdges) {
          const dot = Math.abs(ie.ux * tux + ie.uy * tuy)
          if (dot < 0.996) continue // ~5deg tolerance

          const dmx = (tx1 + tx2) / 2 - ie.midX
          const dmy = (ty1 + ty2) / 2 - ie.midY
          const dist = Math.sqrt(dmx * dmx + dmy * dmy)
          if (dist >= bestDist) continue

          // Facing: normals should point toward each other
          const facingDot = (ie.nx * dmx + ie.ny * dmy)
          if (facingDot <= 0) continue // item normal points away from target edge

          // Overlap check
          const projMin = Math.min(tx1 * ie.ux + ty1 * ie.uy, tx2 * ie.ux + ty2 * ie.uy)
          const projMax = Math.max(tx1 * ie.ux + ty1 * ie.uy, tx2 * ie.ux + ty2 * ie.uy)
          const itemMin = ie.x1 * ie.ux + ie.y1 * ie.uy
          const itemMax = itemMin + ie.len
          if (itemMax <= projMin || projMax <= itemMin) continue

          bestDist = dist
          best = { x: item.x + dmx, y: item.y + dmy, rotation: target.rotation, targetIndex }
        }
      }
    }
    return best
  }

  function attachElementDrag(node: PIXI.Container, el: ElementData) {
    let dd: { sx: number; sy: number; ex: number; ey: number } | null = null
    node.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      e.stopPropagation()
      const inSectionsMode = cbRef.current.zoneDrawing
      const isFixtureEl = isFixture(el.type)
      if (inSectionsMode && !isFixtureEl) return
      if (!inSectionsMode && isFixtureEl) return
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
        // Magnetic snap against same-type furniture
        if (!isFixture(el.type)) {
          const others = elements.filter((e) => e.id !== el.id && e.type === el.type)
            .map((e) => ({ x: e.x, y: e.y, width: e.width, depth: e.depth, rotation: e.rotation ?? 0 }))
          const snap = magneticSnap({ x: rx, y: ry, width: el.width, depth: el.depth, rotation: el.rotation ?? 0 }, others, snapThreshold)
          if (snap) {
            rx = Math.max(0, Math.min(snap.x, roomWidth - el.width))
            ry = Math.max(0, Math.min(snap.y, roomDepth - el.depth))
          }
        }
        // Section detection on drop
        if (!isFixture(el.type) && sectionBoundaries && sectionBoundaries.length > 0) {
          const cx = rx + el.width / 2; const cy = ry + el.depth / 2
          for (const b of sectionBoundaries) {
            const polyPoints = b.shape === 'POLYGON' && b.vertices
              ? b.vertices.map((v) => ({ x: b.x + v.x, y: b.y + v.y }))
              : b.shape === 'RECTANGLE'
                ? [{ x: b.x, y: b.y }, { x: b.x + (b.width ?? 0), y: b.y }, { x: b.x + (b.width ?? 0), y: b.y + (b.height ?? 0) }, { x: b.x, y: b.y + (b.height ?? 0) }]
                : []
            if (polyPoints.length >= 3 && pointInPolygon(cx, cy, polyPoints)) {
              cbRef.current.onElementDropToSection?.(el.id!, b.sectionId)
              break
            }
          }
        }
        cbRef.current.onElementDragEnd(el.id!, rx, ry); dd = null
      }
      app.stage.on('globalpointermove', onMove); app.stage.on('pointerup', onUp)
    })
  }

  /**
   * Drag a chair around its table's outline.
   *
   * The pointer is converted into the table's own local space and projected
   * onto the nearest point of the outline, so the chair slides along the edge
   * instead of floating free — and it follows a curve just as happily as a
   * straight side. Right-click removes the chair.
   */
  function attachChairDrag(
    node: PIXI.Container,
    item: SetupItemP,
    chairId: string,
    geom: FurnitureGeometry,
  ) {
    const ring = outlineOf(geom)
    let dragging = false

    node.on('rightdown', (e: PIXI.FederatedPointerEvent) => {
      e.stopPropagation()
      cbRef.current.onSetupChairRemove?.(item.id, chairId)
    })

    node.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      if (e.button === 2) return
      e.stopPropagation()
      dragging = true
      const app = appRef.current
      if (!app) return

      const parent = node.parent

      const onMove = (ev: PIXI.FederatedPointerEvent) => {
        if (!dragging || !parent) return
        const local = parent.toLocal(ev.global)
        const hit = projectToPerimeter(ring, local.x, local.y)
        cbRef.current.onSetupChairMove?.(item.id, chairId, hit.t)
      }

      const onUp = () => {
        dragging = false
        app.stage.off('globalpointermove', onMove)
        app.stage.off('pointerup', onUp)
        app.stage.off('pointerupoutside', onUp)
      }

      app.stage.on('globalpointermove', onMove)
      app.stage.on('pointerup', onUp)
      app.stage.on('pointerupoutside', onUp)
    })
  }

  function attachSetupItemDrag(node: PIXI.Container, item: SetupItemP) {
    let dd: { sx: number; sy: number; ex: number; ey: number } | null = null
    node.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      e.stopPropagation()
      cbRef.current.onSetupItemClick?.(item.id, e.ctrlKey || e.shiftKey)
      dd = { sx: e.globalX, sy: e.globalY, ex: node.x, ey: node.y }
      const app = appRef.current
      if (!app) return
      const onMove = (ev: PIXI.FederatedPointerEvent) => {
        if (!dd) return; const st = stateRef.current
        const vs = viewRef.current
        let nx = dd.ex + (ev.globalX - dd.sx) / (vs.baseScale * vs.zoom)
        let ny = dd.ey + (ev.globalY - dd.sy) / (vs.baseScale * vs.zoom)
        if (st.snap) { nx = edgeSnap(nx, item.width, st.gu); ny = edgeSnap(ny, item.depth, st.gu) }
        node.x = nx; node.y = ny
      }
      const onUp = (ev: PIXI.FederatedPointerEvent) => {
        app.stage.off('globalpointermove', onMove); app.stage.off('pointerup', onUp)
        if (!dd) return; const st = stateRef.current
        const vs = viewRef.current
        let rx = dd.ex + (ev.globalX - dd.sx) / (vs.baseScale * vs.zoom)
        let ry = dd.ey + (ev.globalY - dd.sy) / (vs.baseScale * vs.zoom)
        if (st.snap) { rx = edgeSnap(rx, item.width, st.gu); ry = edgeSnap(ry, item.depth, st.gu) }
        rx = Math.max(0, Math.min(rx, roomWidth - item.width))
        ry = Math.max(0, Math.min(ry, roomDepth - item.depth))
        // Magnetic snap + auto-join against tables of the same furniture.
        //
        // Match on the resolved key, never on tableProfileId alone: after the
        // furniture migration every placement has tableProfileId === null, so
        // comparing those directly would make every table on the plan snap and
        // join to every other one regardless of what it actually is.
        let joinTargetId: string | null = null
        const itemKey = item.furnitureItemId ?? item.tableProfileId ?? null
        const candidates = itemKey
          ? (setupItems ?? []).filter(
              (s) => s.id !== item.id && (s.furnitureItemId ?? s.tableProfileId ?? null) === itemKey,
            )
          : []
        const snap = magneticSnap(
          { x: rx, y: ry, width: item.width, depth: item.depth, rotation: item.rotation ?? 0 },
          candidates.map((s) => ({ x: s.x, y: s.y, width: s.width, depth: s.depth, rotation: s.rotation ?? 0 })),
          snapThreshold,
        )
        if (snap) {
          rx = Math.max(0, Math.min(snap.x, roomWidth - item.width))
          ry = Math.max(0, Math.min(snap.y, roomDepth - item.depth))
          const target = candidates[snap.targetIndex]
          // Join only if not already in the same group
          if (target && (!item.tableGroupId || target.tableGroupId !== item.tableGroupId)) joinTargetId = target.id
        }
        // Section detection
        if (sectionBoundaries && sectionBoundaries.length > 0) {
          const cx = rx + item.width / 2; const cy = ry + item.depth / 2
          for (const b of sectionBoundaries) {
            const polyPoints = b.shape === 'POLYGON' && b.vertices
              ? b.vertices.map((v: { x: number; y: number }) => ({ x: b.x + v.x, y: b.y + v.y }))
              : b.shape === 'RECTANGLE'
                ? [{ x: b.x, y: b.y }, { x: b.x + (b.width ?? 0), y: b.y }, { x: b.x + (b.width ?? 0), y: b.y + (b.height ?? 0) }, { x: b.x, y: b.y + (b.height ?? 0) }]
                : []
            if (polyPoints.length >= 3 && pointInPolygon(cx, cy, polyPoints)) {
              // Section detected - tagged via onElementDropToSection (same callback works for setup items)
              cbRef.current.onElementDropToSection?.(item.id, b.sectionId)
              break
            }
          }
        }
        cbRef.current.onSetupItemDragEnd?.(item.id, rx, ry)
        if (joinTargetId) cbRef.current.onSetupItemsJoin?.(item.id, joinTargetId)
        dd = null
      }
      app.stage.on('globalpointermove', onMove); app.stage.on('pointerup', onUp)
    })
  }

  function attachRotationHandle(handle: PIXI.Graphics, container: PIXI.Container, item: { id: string; rotation: number }) {
    let rd: { startAng: number; startRot: number; px: number; py: number } | null = null
    handle.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      e.stopPropagation()
      const app = appRef.current
      if (!app) return
      const P = container.getGlobalPosition()
      rd = { startAng: Math.atan2(e.globalY - P.y, e.globalX - P.x), startRot: item.rotation ?? 0, px: P.x, py: P.y }
      let latest = item.rotation ?? 0
      const onMove = (ev: PIXI.FederatedPointerEvent) => {
        if (!rd) return
        const ang = Math.atan2(ev.globalY - rd.py, ev.globalX - rd.px)
        let rot = rd.startRot + (ang - rd.startAng) * (180 / Math.PI)
        rot = ((rot % 360) + 360) % 360
        if (stateRef.current.snap) rot = Math.round(rot / 15) * 15
        latest = rot
        container.rotation = rot * (Math.PI / 180) // live visual feedback
      }
      const onUp = () => {
        app.stage.off('globalpointermove', onMove); app.stage.off('pointerup', onUp)
        if (!rd) return
        rd = null
        cbRef.current.onSetupItemRotate?.(item.id, latest) // commit once
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
    let moved = false
    node.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      e.stopPropagation()
      dd = { sx: e.globalX, sy: e.globalY, ex: node.x, ey: node.y }
      moved = false
      const app = appRef.current
      if (!app) return
      const onMove = (ev: PIXI.FederatedPointerEvent) => {
        if (!dd) return
        moved = true
        const vs = viewRef.current
        let nx = dd.ex + (ev.globalX - dd.sx) / (vs.baseScale * vs.zoom)
        let ny = dd.ey + (ev.globalY - dd.sy) / (vs.baseScale * vs.zoom)
        nx = gridSnap(nx, stateRef.current.gu); ny = gridSnap(ny, stateRef.current.gu)
        node.x = nx; node.y = ny
      }
      const onUp = (ev: PIXI.FederatedPointerEvent) => {
        app.stage.off('globalpointermove', onMove); app.stage.off('pointerup', onUp)
        if (!moved) { cbRef.current.onZoneClick(z.id) }
        if (!dd) return
        if (moved) {
          const vs = viewRef.current
          let rx = dd.ex + (ev.globalX - dd.sx) / (vs.baseScale * vs.zoom)
          let ry = dd.ey + (ev.globalY - dd.sy) / (vs.baseScale * vs.zoom)
          rx = gridSnap(rx, stateRef.current.gu); ry = gridSnap(ry, stateRef.current.gu)
          cbRef.current.onZoneDragEnd(z.id, rx, ry)
        }
        dd = null
      }
      app.stage.on('globalpointermove', onMove); app.stage.on('pointerup', onUp)
    })
  }

  return null
}
