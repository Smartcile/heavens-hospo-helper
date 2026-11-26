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
import {
  screenToWorld,
  screenDeltaToWorld,
  zoomAroundPoint,
  clampToRoom,
  snapValue,
  findMagneticSnap,
  shouldJoin,
  beginGesture,
  moveGesture,
  endGesture,
  cancelGesture,
  gridSnap,
  IDLE_GESTURE,
  type GestureKind,
  type GestureState,
  type Placement,
  type Point,
} from '@/lib/floorplan-pointer'

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
  /**
   * Commit a dropped element. `sectionId` is the zone it landed in, if any.
   * Omit it on a read-only canvas (the worker floor plan) to disable dragging.
   */
  onElementDragEnd?: (id: string, x: number, y: number, sectionId?: string | null) => void
  onZoneClick: (id: string | null) => void
  onZoneDragEnd: (id: string, x: number, y: number) => void
  /** Called once when a resize handle gesture starts, so the editor can snapshot undo state. */
  onZoneResizeStart?: () => void
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
  /** Commit a dropped placement; `sectionId` is the zone it landed in, if any. */
  onSetupItemDragEnd?: (id: string, x: number, y: number, sectionId?: string | null) => void
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
  onElementClick, onElementDragEnd, onZoneClick, onZoneDragEnd, onZoneResizeStart,
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
  /** Snap preview outline, drawn in room space above every layer. */
  const guideRef = useRef<PIXI.Graphics | null>(null)
  /** The one active pointer gesture — see `beginCanvasGesture`. */
  const gestureRef = useRef<GestureState>(IDLE_GESTURE)
  const gestureHandlersRef = useRef<CanvasGesture | null>(null)
  const stateRef = useRef({ snap: snapEnabled, gu: gridUnit })
  // Keep current room dimensions available to the init-effect handlers (which have [] deps)
  const dimsRef = useRef({ roomWidth, roomDepth, gridUnit })
  dimsRef.current = { roomWidth, roomDepth, gridUnit }
  const cbRef = useRef({ onElementClick, onElementDragEnd, onZoneClick, onZoneDragEnd, onZoneResizeStart, onZoneDrawStart, onZoneDrawMove, onZoneDrawEnd, onZoneResize, onViewChange, zoneDrawing, onSelRectStart, onSelRectMove, onSelRectEnd, showDimensions, onSetupItemClick, onSetupItemDragEnd, onSetupChairEdge, onSetupItemRotate, onSetupItemsJoin, onSetupChairMove, onSetupChairAdd, onSetupChairRemove, onCanvasPlace, armedPlacement, wallDrawing, zonePolyMode, onWallPoint, onZonePolyAdd })
  cbRef.current = { onElementClick, onElementDragEnd, onZoneClick, onZoneDragEnd, onZoneResizeStart, onZoneDrawStart, onZoneDrawMove, onZoneDrawEnd, onZoneResize, onViewChange, zoneDrawing, onSelRectStart, onSelRectMove, onSelRectEnd, showDimensions, onSetupItemClick, onSetupItemDragEnd, onSetupChairEdge, onSetupItemRotate, onSetupItemsJoin, onSetupChairMove, onSetupChairAdd, onSetupChairRemove, onCanvasPlace, armedPlacement, wallDrawing, zonePolyMode, onWallPoint, onZonePolyAdd }

  // ── Gesture ownership ────────────────────────────────────────────────────
  // Every pointer gesture (pan, drag, draw, select, rotate, resize, chair) is
  // owned by this one state machine. Node handlers only nominate a gesture;
  // the stage's single move/up handler drives it. A second pointerdown or an
  // Escape cancels whatever was running, so nothing can stick.
  type CanvasGesture = {
    token: number
    kind: Exclude<GestureKind, 'idle'>
    move: (ev: PIXI.FederatedPointerEvent) => void
    finish: (gesture: GestureState) => void
    cancel: () => void
  }

  function beginCanvasGesture(
    kind: Exclude<GestureKind, 'idle'>,
    ev: PIXI.FederatedPointerEvent,
    handlers: { move: CanvasGesture['move']; finish: CanvasGesture['finish']; cancel?: () => void },
  ) {
    const running = gestureHandlersRef.current
    if (running) {
      gestureHandlersRef.current = null
      clearGuide()
      running.cancel()
    }
    const state = beginGesture(gestureRef.current, kind, ev.globalX, ev.globalY)
    gestureRef.current = state
    gestureHandlersRef.current = { token: state.token, kind, move: handlers.move, finish: handlers.finish, cancel: handlers.cancel ?? (() => {}) }
  }

  function clearGuide() {
    guideRef.current?.clear()
  }

  /** End the active gesture and let it commit (canvas pointerup / pointerupoutside). */
  function finishCanvasGesture() {
    const gesture = gestureHandlersRef.current
    if (!gesture) return
    gestureHandlersRef.current = null
    clearGuide()
    const final = endGesture(gestureRef.current)
    gestureRef.current = final
    gesture.finish(final)
  }

  /** Abort the active gesture and put the scene back (Escape / pointercancel). */
  function cancelCanvasGesture() {
    const gesture = gestureHandlersRef.current
    if (!gesture) return
    gestureHandlersRef.current = null
    clearGuide()
    gesture.cancel()
    gestureRef.current = cancelGesture(gestureRef.current)
  }

  /** World-space movement of the pointer since a drag began. */
  function dragDelta(start: Point, gesture: GestureState): Point {
    const vs = viewRef.current
    return screenDeltaToWorld(vs, gesture.lastX - start.x, gesture.lastY - start.y)
  }

  /**
   * Resolve where a dropped item lands: grid/edge snap only when near a line,
   * then a magnetic flush fit against same-type neighbours. Applied on release
   * only — never during the drag, so the item tracks the pointer 1:1.
   */
  function resolveDrop(
    x: number, y: number, width: number, depth: number, rotation: number,
    targets: Placement[], enabled: boolean,
  ): { x: number; y: number; target: number | null } {
    if (!enabled) return { x, y, target: null }
    const gu = dimsRef.current.gridUnit
    const tolerance = Math.min(gu / 2, 15)
    const snappedX = snapValue(x, width, gu, tolerance)
    const snappedY = snapValue(y, depth, gu, tolerance)
    const snap = findMagneticSnap(
      { x: snappedX, y: snappedY, width, depth, rotation },
      targets,
      snapThreshold,
    )
    if (!snap) return { x: snappedX, y: snappedY, target: null }
    return { x: snap.x, y: snap.y, target: snap.targetIndex }
  }

  /** Outline where the item would land if released now. */
  function showGuide(rect: { x: number; y: number; w: number; h: number } | null) {
    const guide = guideRef.current
    if (!guide) return
    guide.clear()
    if (!rect) return
    const vs = viewRef.current
    const px = vs.baseScale * vs.zoom || 1
    guide.lineStyle(1.5 / px, 0x4488FF, 0.9)
    guide.drawRect(rect.x, rect.y, rect.w, rect.h)
  }

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

    const guide = new PIXI.Graphics()
    guide.eventMode = 'none'
    guideRef.current = guide
    room.addChild(guide)

    const vs = computeView(w, h, roomWidth, roomDepth, 1, 0, 0)
    viewRef.current = vs
    applyRoomTransform(room, vs)

    // ── One pointerdown handler ────────────────────────────────────────────
    // Middle-click pans, left-click draws / places / selects. The three
    // handlers that used to race here are now one dispatch, so a gesture can
    // never be claimed twice.
    app.stage.eventMode = 'static'
    app.stage.hitArea = new PIXI.Rectangle(0, 0, w, h)
    app.stage.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      const cb = cbRef.current

      if (e.button === 1) {
        e.preventDefault()
        const start = { x: e.globalX, y: e.globalY, panX: viewRef.current.panX, panY: viewRef.current.panY }
        beginCanvasGesture('panning', e, {
          move: (ev) => {
            const view = viewRef.current
            view.panX = start.panX + ev.globalX - start.x
            view.panY = start.panY + ev.globalY - start.y
            room.position.set(view.ox + view.panX, view.oy + view.panY)
          },
          finish: () => {},
          cancel: () => {
            const view = viewRef.current
            view.panX = start.panX
            view.panY = start.panY
            room.position.set(view.ox + view.panX, view.oy + view.panY)
          },
        })
        return
      }
      if (e.button !== 0) return
      if (e.target !== app.stage) return

      // The same conversion every other handler uses, pan included.
      const at = screenToWorld(viewRef.current, e.globalX, e.globalY)

      if (cb.wallDrawing && cb.onWallPoint) {
        cb.onWallPoint(at.x, at.y)
        return
      }
      if (cb.zonePolyMode && cb.onZonePolyAdd) {
        cb.onZonePolyAdd(at.x, at.y)
        return
      }
      // A palette tile is armed: this click drops it rather than starting a
      // selection rectangle. Checked first so click-to-place always wins.
      if (cb.armedPlacement && cb.onCanvasPlace) {
        cb.onCanvasPlace(at.x, at.y)
        return
      }

      if (cb.zoneDrawing) {
        if (!cb.onZoneDrawStart) return
        cb.onZoneDrawStart(at.x, at.y)
        beginCanvasGesture('drawing', e, {
          move: (ev) => {
            const p = screenToWorld(viewRef.current, ev.globalX, ev.globalY)
            cbRef.current.onZoneDrawMove(p.x, p.y)
          },
          finish: (gesture) => {
            const p = screenToWorld(viewRef.current, gesture.lastX, gesture.lastY)
            cbRef.current.onZoneDrawEnd(p.x, p.y)
          },
        })
        return
      }

      // Nothing under the pointer: clear selection and start a rubber band.
      cb.onElementClick(null)
      cb.onSetupItemClick?.(null)
      cb.onZoneClick(null)
      cb.onSelRectStart?.(at.x, at.y)
      beginCanvasGesture('selecting', e, {
        move: (ev) => {
          const p = screenToWorld(viewRef.current, ev.globalX, ev.globalY)
          cbRef.current.onSelRectMove?.(p.x, p.y)
        },
        finish: (gesture) => {
          const p = screenToWorld(viewRef.current, gesture.lastX, gesture.lastY)
          cbRef.current.onSelRectEnd?.(p.x, p.y)
        },
      })
    })

    // Mouse wheel zoom, anchored on the pointer so the plan does not drift.
    app.stage.on('wheel', (e: PIXI.FederatedWheelEvent) => {
      e.preventDefault()
      const view = viewRef.current
      const next = zoomAroundPoint(view, view.zoom * (e.deltaY > 0 ? 0.9 : 1.1), e.globalX, e.globalY)
      view.zoom = next.zoom
      view.panX = next.panX
      view.panY = next.panY
      applyRoomTransform(room, view)
      cbRef.current.onViewChange?.(next.zoom)
    })

    // One move/up path for every gesture (node drags included — node handlers
    // stop the pointerdown, but the pointerup still bubbles here).
    app.stage.on('globalpointermove', (e: PIXI.FederatedPointerEvent) => {
      const gesture = gestureHandlersRef.current
      if (!gesture) return
      gestureRef.current = moveGesture(gestureRef.current, e.globalX, e.globalY)
      gesture.move(e)
    })
    app.stage.on('pointerup', finishCanvasGesture)
    app.stage.on('pointerupoutside', finishCanvasGesture)

    // A pointer released outside the canvas, or a lost pointer, must never
    // leave a gesture running.
    const onWindowUp = () => finishCanvasGesture()
    const onWindowCancel = () => cancelCanvasGesture()
    const onKeyDown = (ev: KeyboardEvent) => { if (ev.key === 'Escape') cancelCanvasGesture() }
    window.addEventListener('pointerup', onWindowUp)
    window.addEventListener('pointercancel', onWindowCancel)
    window.addEventListener('blur', onWindowCancel)
    window.addEventListener('keydown', onKeyDown)

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

    return () => {
      ro.disconnect()
      window.removeEventListener('pointerup', onWindowUp)
      window.removeEventListener('pointercancel', onWindowCancel)
      window.removeEventListener('blur', onWindowCancel)
      window.removeEventListener('keydown', onKeyDown)
      gestureHandlersRef.current = null
      gestureRef.current = IDLE_GESTURE
      guideRef.current = null
      app.destroy(true, { children: true })
      appRef.current = null
      roomRef.current = null
    }
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
    // The snap guide survives a rebuild and sits above every layer.
    if (guideRef.current) { guideRef.current.clear(); room.addChild(guideRef.current) }
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
      // Read-only consumers (the worker floor plan) pass no handlers; showing a
      // drag cursor there would promise an interaction that cannot commit.
      const interactive = Boolean(cbRef.current.onSetupItemDragEnd || cbRef.current.onSetupItemClick)
      setupItems.forEach((item) => {
        const c = new PIXI.Container()
        c.x = item.x; c.y = item.y
        c.rotation = (item.rotation ?? 0) * (Math.PI / 180)
        if (ghostMode || !interactive) { c.alpha = ghostMode ? 0.2 : 1; c.eventMode = 'none'; c.cursor = 'default' }
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

  /**
   * The section zone a dropped item's centre lands in, if any.
   *
   * `undefined` means "no boundary matched", so the editor keeps its own
   * zone-based tagging rather than clearing a section the user set.
   */
  function sectionForDrop(x: number, y: number, width: number, depth: number): string | undefined {
    if (!sectionBoundaries || sectionBoundaries.length === 0) return undefined
    const cx = x + width / 2
    const cy = y + depth / 2
    for (const b of sectionBoundaries) {
      const polyPoints = b.shape === 'POLYGON' && b.vertices
        ? b.vertices.map((v: { x: number; y: number }) => ({ x: b.x + v.x, y: b.y + v.y }))
        : b.shape === 'RECTANGLE'
          ? [{ x: b.x, y: b.y }, { x: b.x + (b.width ?? 0), y: b.y }, { x: b.x + (b.width ?? 0), y: b.y + (b.height ?? 0) }, { x: b.x, y: b.y + (b.height ?? 0) }]
          : []
      if (polyPoints.length >= 3 && pointInPolygon(cx, cy, polyPoints)) return b.sectionId
    }
    return undefined
  }

  /**
   * Drag a base-plan fixture.
   *
   * Selection is deferred to pointerup: selecting on pointerdown used to rebuild
   * the scene mid-gesture, detaching the very node being dragged. The node now
   * follows the pointer 1:1 (no snapping, clamped to the room) and the snap is
   * resolved once, on release.
   */
  function attachElementDrag(node: PIXI.Container, el: ElementData) {
    node.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      if (e.button !== 0) return
      const inSectionsMode = cbRef.current.zoneDrawing
      const isFixtureEl = isFixture(el.type)
      if (inSectionsMode && !isFixtureEl) return
      if (!inSectionsMode && isFixtureEl) return
      e.stopPropagation()

      // Read-only canvas (the worker floor plan): click opens the info panel,
      // and there is no drag to commit.
      if (!cbRef.current.onElementDragEnd) {
        cbRef.current.onElementClick(el.id!, e.ctrlKey || e.shiftKey)
        return
      }

      const start = { x: node.x, y: node.y }
      const origin = { x: e.globalX, y: e.globalY }
      const additive = Boolean(e.ctrlKey || e.shiftKey)
      let allowSnap = stateRef.current.snap && !e.altKey
      const targets: Placement[] = isFixtureEl
        ? []
        : elements
            .filter((other) => other.id !== el.id && other.type === el.type)
            .map((other) => ({ x: other.x, y: other.y, width: other.width, depth: other.depth, rotation: other.rotation ?? 0 }))

      beginCanvasGesture('dragging', e, {
        move: (ev) => {
          allowSnap = stateRef.current.snap && !ev.altKey
          const d = dragDelta(origin, gestureRef.current)
          // Clamp every frame: a fast drag never leaves the room and jumps back.
          const nx = clampToRoom(start.x + d.x, el.width, dimsRef.current.roomWidth)
          const ny = clampToRoom(start.y + d.y, el.depth, dimsRef.current.roomDepth)
          node.x = nx
          node.y = ny
          const drop = resolveDrop(nx, ny, el.width, el.depth, el.rotation ?? 0, targets, allowSnap)
          showGuide(allowSnap && (drop.x !== nx || drop.y !== ny)
            ? { x: drop.x, y: drop.y, w: el.width, h: el.depth }
            : null)
        },
        finish: (gesture) => {
          showGuide(null)
          if (!gesture.moved) {
            cbRef.current.onElementClick(el.id!, additive)
            return
          }
          const d = dragDelta(origin, gesture)
          const raw = {
            x: clampToRoom(start.x + d.x, el.width, dimsRef.current.roomWidth),
            y: clampToRoom(start.y + d.y, el.depth, dimsRef.current.roomDepth),
          }
          const drop = resolveDrop(raw.x, raw.y, el.width, el.depth, el.rotation ?? 0, targets, allowSnap)
          const rx = clampToRoom(drop.x, el.width, dimsRef.current.roomWidth)
          const ry = clampToRoom(drop.y, el.depth, dimsRef.current.roomDepth)
          // Select as part of the same commit, so the scene rebuilds only once.
          cbRef.current.onElementClick(el.id!, false)
          cbRef.current.onElementDragEnd?.(el.id!, rx, ry, sectionForDrop(rx, ry, el.width, el.depth))
        },
        cancel: () => {
          node.x = start.x
          node.y = start.y
        },
      })
    })
  }

  /**
   * Drag a chair around its table's outline.
   *
   * The chair follows the pointer during the drag (no state write, so the table
   * is never rebuilt mid-gesture) and is projected onto the nearest point of the
   * outline once, on release. Right-click removes it.
   */
  function attachChairDrag(
    node: PIXI.Container,
    item: SetupItemP,
    chairId: string,
    geom: FurnitureGeometry,
  ) {
    const ring = outlineOf(geom)

    node.on('rightdown', (e: PIXI.FederatedPointerEvent) => {
      e.stopPropagation()
      cbRef.current.onSetupChairRemove?.(item.id, chairId)
    })

    node.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      if (e.button !== 0) return
      e.stopPropagation()
      const parent = node.parent
      const home = { x: node.x, y: node.y }

      beginCanvasGesture('dragging', e, {
        move: (ev) => {
          if (!parent) return
          const local = parent.toLocal(ev.global)
          node.x = local.x
          node.y = local.y
        },
        finish: (gesture) => {
          if (!gesture.moved || !parent) return
          const local = parent.toLocal({ x: gesture.lastX, y: gesture.lastY })
          const hit = projectToPerimeter(ring, local.x, local.y)
          cbRef.current.onSetupChairMove?.(item.id, chairId, hit.t)
        },
        cancel: () => {
          node.x = home.x
          node.y = home.y
        },
      })
    })
  }

  /**
   * Drag a placed table.
   *
   * Six defects came together here (#194): selection on pointerdown detached the
   * node, snapping ran every frame, the drop auto-joined, and clamping only
   * happened at release. Now the placement tracks the pointer 1:1, clamps live,
   * previews its snap in a guide and only joins on a deliberate overlap or with
   * Shift held.
   */
  function attachSetupItemDrag(node: PIXI.Container, item: SetupItemP) {
    if (!cbRef.current.onSetupItemDragEnd) {
      // Read-only canvas (the worker floor plan): a click is all there is.
      node.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
        if (e.button !== 0 || !cbRef.current.onSetupItemClick) return
        e.stopPropagation()
        cbRef.current.onSetupItemClick(item.id, e.ctrlKey || e.shiftKey)
      })
      return
    }

    node.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      if (e.button !== 0) return
      e.stopPropagation()

      const start = { x: node.x, y: node.y }
      const origin = { x: e.globalX, y: e.globalY }
      const additive = Boolean(e.ctrlKey || e.shiftKey)
      let allowSnap = stateRef.current.snap && !e.altKey
      let shiftHeld = Boolean(e.shiftKey)

      // Match on the resolved key, never on tableProfileId alone: after the
      // furniture migration every placement has tableProfileId === null, so
      // comparing those directly would make every table snap/join to every
      // other one regardless of what it actually is.
      const itemKey = item.furnitureItemId ?? item.tableProfileId ?? null
      const candidates = itemKey
        ? (setupItems ?? []).filter(
            (s) => s.id !== item.id && (s.furnitureItemId ?? s.tableProfileId ?? null) === itemKey,
          )
        : []
      const targets: Placement[] = candidates.map((s) => ({
        x: s.x, y: s.y, width: s.width, depth: s.depth, rotation: s.rotation ?? 0,
      }))

      beginCanvasGesture('dragging', e, {
        move: (ev) => {
          allowSnap = stateRef.current.snap && !ev.altKey
          shiftHeld = Boolean(ev.shiftKey)
          const d = dragDelta(origin, gestureRef.current)
          const nx = clampToRoom(start.x + d.x, item.width, dimsRef.current.roomWidth)
          const ny = clampToRoom(start.y + d.y, item.depth, dimsRef.current.roomDepth)
          node.x = nx
          node.y = ny
          const drop = resolveDrop(nx, ny, item.width, item.depth, item.rotation ?? 0, targets, allowSnap)
          showGuide(allowSnap && (drop.x !== nx || drop.y !== ny)
            ? { x: drop.x, y: drop.y, w: item.width, h: item.depth }
            : null)
        },
        finish: (gesture) => {
          showGuide(null)
          if (!gesture.moved) {
            cbRef.current.onSetupItemClick?.(item.id, additive)
            return
          }
          const d = dragDelta(origin, gesture)
          const raw = {
            x: clampToRoom(start.x + d.x, item.width, dimsRef.current.roomWidth),
            y: clampToRoom(start.y + d.y, item.depth, dimsRef.current.roomDepth),
          }
          const drop = resolveDrop(raw.x, raw.y, item.width, item.depth, item.rotation ?? 0, targets, allowSnap)
          const rx = clampToRoom(drop.x, item.width, dimsRef.current.roomWidth)
          const ry = clampToRoom(drop.y, item.depth, dimsRef.current.roomDepth)

          // Join is explicit: a long deliberate overlap, or Shift held. A small
          // accidental nudge against another table snaps flush but stays apart.
          let joinTargetId: string | null = null
          if (drop.target !== null) {
            const target = candidates[drop.target]
            const flush = { x: rx, y: ry, width: item.width, depth: item.depth, rotation: item.rotation ?? 0 }
            const targetPlacement = targets[drop.target]
            if (target && targetPlacement && (!item.tableGroupId || target.tableGroupId !== item.tableGroupId)
              && shouldJoin(flush, targetPlacement, { shiftHeld })) {
              joinTargetId = target.id
            }
          }

          cbRef.current.onSetupItemClick?.(item.id, false)
          cbRef.current.onSetupItemDragEnd?.(item.id, rx, ry, sectionForDrop(rx, ry, item.width, item.depth))
          if (joinTargetId) cbRef.current.onSetupItemsJoin?.(item.id, joinTargetId)
        },
        cancel: () => {
          node.x = start.x
          node.y = start.y
        },
      })
    })
  }

  function attachRotationHandle(handle: PIXI.Graphics, container: PIXI.Container, item: { id: string; rotation: number }) {
    handle.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      if (e.button !== 0) return
      e.stopPropagation()
      const origin = container.getGlobalPosition()
      const startAng = Math.atan2(e.globalY - origin.y, e.globalX - origin.x)
      const startRot = item.rotation ?? 0
      let latest = startRot

      beginCanvasGesture('dragging', e, {
        move: (ev) => {
          const ang = Math.atan2(ev.globalY - origin.y, ev.globalX - origin.x)
          let rotation = startRot + (ang - startAng) * (180 / Math.PI)
          rotation = ((rotation % 360) + 360) % 360
          if (stateRef.current.snap) rotation = Math.round(rotation / 15) * 15
          latest = rotation
          container.rotation = rotation * (Math.PI / 180) // live preview only
        },
        finish: (gesture) => {
          if (!gesture.moved) return
          cbRef.current.onSetupItemRotate?.(item.id, latest) // commit once
        },
        cancel: () => {
          container.rotation = startRot * (Math.PI / 180)
        },
      })
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
    handle.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      if (e.button !== 0) return
      e.stopPropagation()
      const origin = { x: e.globalX, y: e.globalY }
      const start = { x: z.x, y: z.y, width: z.width, height: z.height }
      // Snapshot undo state once, before the first size reaches the editor.
      cbRef.current.onZoneResizeStart?.()

      const resizeTo = (gesture: GestureState) => {
        const gu = stateRef.current.gu || 1
        const d = dragDelta(origin, gesture)
        const dx = gridSnap(d.x, gu)
        const dy = gridSnap(d.y, gu)
        let nx = start.x + dx * cfg.dx_x
        let ny = start.y + dy * cfg.dx_y
        let nw = start.width + dx * cfg.dw
        let nh = start.height + dy * cfg.dh
        if (nw < gu) { if (cfg.dw < 0) nx -= gu - nw; nw = gu }
        if (nh < gu) { if (cfg.dh < 0) ny -= gu - nh; nh = gu }
        cbRef.current.onZoneResize?.(z.id, nx, ny, nw, nh)
      }

      beginCanvasGesture('dragging', e, {
        move: () => resizeTo(gestureRef.current),
        finish: (gesture) => {
          if (!gesture.moved) return
          resizeTo(gesture)
        },
        cancel: () => {
          cbRef.current.onZoneResize?.(z.id, start.x, start.y, start.width, start.height)
        },
      })
    })
  }

  function attachZoneDrag(node: PIXI.Container, z: ZoneP) {
    node.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      if (e.button !== 0) return
      e.stopPropagation()
      const start = { x: node.x, y: node.y }

      beginCanvasGesture('dragging', e, {
        move: () => {
          const gu = stateRef.current.gu || 1
          const d = dragDelta({ x: gestureRef.current.startX, y: gestureRef.current.startY }, gestureRef.current)
          node.x = gridSnap(start.x + d.x, gu)
          node.y = gridSnap(start.y + d.y, gu)
        },
        finish: (gesture) => {
          if (!gesture.moved) {
            cbRef.current.onZoneClick(z.id)
            return
          }
          const gu = stateRef.current.gu || 1
          const d = dragDelta({ x: gesture.startX, y: gesture.startY }, gesture)
          cbRef.current.onZoneDragEnd(z.id, gridSnap(start.x + d.x, gu), gridSnap(start.y + d.y, gu))
        },
        cancel: () => {
          node.x = start.x
          node.y = start.y
        },
      })
    })
  }

  return null
}
