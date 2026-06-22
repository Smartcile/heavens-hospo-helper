'use client'

import React from 'react'
import type { Vertex } from '@hospo-ops/types'

// ── Theme ──
export interface FloorPlanTheme {
  strokeWallExterior: string
  strokeWallInterior: string
  fillFloorBase: string
  fillSeating: string
  fillTable: string
  strokeFurniture: string
  textLabel: string
  fillWindow: string
}

export const DEFAULT_THEME: FloorPlanTheme = {
  strokeWallExterior: '#333',
  strokeWallInterior: '#555',
  fillFloorBase: '#1A1A1A',
  fillSeating: '#3A3A4A',
  fillTable: '#2A2A3A',
  strokeFurniture: '#666',
  textLabel: '#FFF',
  fillWindow: '#87CEEB',
}

// ── Palette ──
export interface PaletteItem {
  type: string
  label: string
  w: number
  d: number
  fill: string
  category: 'FIXTURE' | 'FURNITURE'
  circle?: boolean
}

export const PALETTE_ITEMS: PaletteItem[] = [
  { type: 'WALL',          label: 'WALL',           w: 200, d: 10,  fill: '#4A4A4A', category: 'FIXTURE' },
  { type: 'DOOR',          label: 'DOOR',           w: 10,  d: 80,  fill: '#6B4226', category: 'FIXTURE' },
  { type: 'WINDOW',        label: 'WINDOW',         w: 10,  d: 60,  fill: '#87CEEB', category: 'FIXTURE' },
  { type: 'CHAIR',         label: 'CHAIR',          w: 30,  d: 30,  fill: '#3A3A4A', category: 'FURNITURE' },
  { type: 'COUNTER',       label: 'COUNTER',        w: 120, d: 40,  fill: '#5C4033', category: 'FIXTURE' },
  { type: 'BAR',           label: 'BAR',            w: 160, d: 50,  fill: '#8B4513', category: 'FIXTURE' },
  { type: 'BOOTH_BENCH',   label: 'BOOTH BENCH',    w: 150, d: 40,  fill: '#3D3D4D', category: 'FIXTURE' },
  { type: 'SINK',          label: 'SINK',           w: 50,  d: 40,  fill: '#B0C4DE', category: 'FIXTURE' },
  { type: 'KITCHEN_EQUIP', label: 'KITCHEN EQUIP',  w: 70,  d: 60,  fill: '#555',    category: 'FIXTURE' },
  { type: 'STORAGE',       label: 'STORAGE',        w: 60,  d: 60,  fill: '#666',    category: 'FIXTURE' },
  { type: 'ENTRY',         label: 'ENTRY',          w: 20,  d: 90,  fill: '#556B2F', category: 'FIXTURE' },
  { type: 'EXIT',          label: 'EXIT',           w: 20,  d: 90,  fill: '#8B0000', category: 'FIXTURE' },
  { type: 'STAIRS',        label: 'STAIRS',         w: 80,  d: 30,  fill: '#808080', category: 'FIXTURE' },
  { type: 'TOILET',        label: 'TOILET',         w: 50,  d: 50,  fill: '#4682B4', category: 'FURNITURE' },
  { type: 'PLANT',         label: 'PLANT',          w: 20,  d: 20,  fill: '#228B22', category: 'FURNITURE', circle: true },
  { type: 'OTHER',         label: 'OTHER',          w: 50,  d: 50,  fill: '#6B6B6B', category: 'FURNITURE' },
]

export function isFixture(type: string) {
  return PALETTE_ITEMS.find((p) => p.type === type)?.category === 'FIXTURE'
}

export function getDefaultFill(type: string, theme?: FloorPlanTheme): string {
  const item = PALETTE_ITEMS.find((p) => p.type === type)
  return item?.fill ?? '#6B6B6B'
}

// ── Shared element data type ──
export interface ElementData {
  id?: string
  type: string
  shape: string
  label?: string | null
  labelVisible?: boolean
  x: number
  y: number
  width: number
  depth: number
  radius?: number | null
  vertices?: Vertex[] | null
  rotation: number
  colour?: string | null
  fillColour?: string | null
  opacity: number
  zIndex: number
  sectionId?: string | null
  capacity?: number | null
  chairCount?: number
  sortOrder: number
  isActive: boolean
  style?: Record<string, unknown> | null
  _furnitureItemId?: string
}

// ── Arc point helper (for door swing) ──
function arcPoints(cx: number, cy: number, r: number, startDeg: number, endDeg: number, steps = 16): number[] {
  const pts: number[] = []
  const startRad = (startDeg * Math.PI) / 180
  const endRad = (endDeg * Math.PI) / 180
  for (let i = 0; i <= steps; i++) {
    const a = startRad + ((endRad - startRad) * i) / steps
    pts.push(cx + r * Math.cos(a), cy - r * Math.sin(a))
  }
  return pts
}

// ── Label width helper ──
function labelText(label: string, showDashes = false): string {
  if (!showDashes) return label
  return `-- ${label} --`
}

// ── Visual renderer (shared between editor and worker) ──
interface RendererProps {
  el: ElementData
  KC: Record<string, React.FC<any>>
  scale: number
  offsetX: number
  offsetY: number
  isSelected: boolean
  theme?: FloorPlanTheme
  sectionColour?: string | null
  showSectionOverlay?: boolean
}

export function FloorPlanElementVisual({
  el, KC, scale, offsetX, offsetY, isSelected, theme = DEFAULT_THEME,
  sectionColour, showSectionOverlay,
}: RendererProps) {
  const { Rect, Circle, Line, Text, Group } = KC

  const kx = offsetX + el.x * scale
  const ky = offsetY + el.y * scale
  const kw = el.width * scale
  const kd = el.depth * scale

  const fill = el.fillColour ?? getDefaultFill(el.type, theme)
  const stroke = isSelected ? '#FFF' : (el.colour ?? theme.strokeFurniture)
  const strokeW = isSelected ? 2 : 1

  const overlayColour = showSectionOverlay && sectionColour ? sectionColour : null

  const labelStr = el.label ?? ''
  const showLabel = el.labelVisible !== false && labelStr.length > 0

  // Shared overlay rect (for section colour)
  function OverlayRect() {
    if (!overlayColour) return null
    return <Rect width={kw} height={kd} fill={overlayColour} opacity={0.25} listening={false} />
  }
  function OverlayCircle(r: number) {
    if (!overlayColour) return null
    return <Circle radius={r} fill={overlayColour} opacity={0.25} listening={false} />
  }
  function OverlayLine(len: number, thick: number) {
    if (!overlayColour) return null
    return <Line points={[-len / 2, 0, len / 2, 0]} stroke={overlayColour} strokeWidth={thick + 4} opacity={0.25} listening={false} />
  }

  // ── CIRCLE shape ──
  if (el.shape === 'CIRCLE') {
    const r = (el.radius ?? Math.min(el.width, el.depth) / 2) * scale
    return (
      <>
        <Circle radius={r} fill={fill} stroke={stroke} strokeWidth={strokeW} opacity={el.opacity} />
        {showLabel && (
          <Text x={0} y={0} text={labelStr} fontSize={Math.max(r * 0.4, 6)} fill={theme.textLabel}
            align="center" verticalAlign="middle" offsetX={labelStr.length * 3} offsetY={4} listening={false} />
        )}
        {OverlayCircle(r)}
      </>
    )
  }

  // ── POLYGON shape ──
  if (el.shape === 'POLYGON' && el.vertices) {
    const { Shape } = KC
    const hasBezier = el.vertices.some((v) => v.cp1x !== undefined || v.cp2x !== undefined)
    if (hasBezier) {
      return (
        <Shape
          sceneFunc={(context: any, shape: any) => {
            const ctx = context._context
            const verts = el.vertices!
            const [sx, sy] = [offsetX + (el.x + verts[0].x) * scale, offsetY + (el.y + verts[0].y) * scale]
            ctx.beginPath()
            ctx.moveTo(sx, sy)
            for (let i = 0; i < verts.length; i++) {
              const j = (i + 1) % verts.length
              const curr = verts[i]
              const next = verts[j]
              const [cx, cy] = [offsetX + (el.x + next.x) * scale, offsetY + (el.y + next.y) * scale]
              if (curr.cp2x !== undefined && curr.cp2y !== undefined && next.cp1x !== undefined && next.cp1y !== undefined) {
                const [cp1x, cp1y] = [offsetX + (el.x + curr.cp2x) * scale, offsetY + (el.y + curr.cp2y) * scale]
                const [cp2x, cp2y] = [offsetX + (el.x + next.cp1x) * scale, offsetY + (el.y + next.cp1y) * scale]
                ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, cx, cy)
              } else if (curr.cp2x !== undefined && curr.cp2y !== undefined) {
                const [cp1x, cp1y] = [offsetX + (el.x + curr.cp2x) * scale, offsetY + (el.y + curr.cp2y) * scale]
                ctx.quadraticCurveTo(cp1x, cp1y, cx, cy)
              } else {
                ctx.lineTo(cx, cy)
              }
            }
            ctx.closePath()
            shape.fill(ctx)
            shape.stroke(ctx)
          }}
          fill={fill} stroke={stroke} strokeWidth={strokeW} opacity={el.opacity}
        />
      )
    }
    const pts = el.vertices.flatMap((v) => [offsetX + (el.x + v.x) * scale, offsetY + (el.y + v.y) * scale])
    return (
      <Line points={pts} closed fill={fill} stroke={stroke} strokeWidth={strokeW} opacity={el.opacity} />
    )
  }

  // ── RECTANGLE shape — type-specific rendering ──
  switch (el.type) {
    case 'WALL':
    case 'ENTRY':
    case 'EXIT': {
      const lineLen = kw
      const lineThick = Math.max(kd, 2)
      const isExit = el.type === 'EXIT'
      const isEntry = el.type === 'ENTRY'
      const lineColour = isExit ? '#8B0000' : isEntry ? '#556B2F' : '#4A4A4A'
      const dash = isExit ? [4, 3] : undefined
      const labelPrefix = isExit ? '==' : '--'
      const labelSuffix = isExit ? '==' : '--'
      const dispLabel = showLabel ? `${labelPrefix} ${labelStr} ${labelSuffix}` : ''

      return (
        <Group x={kx} y={ky} rotation={el.rotation} offsetX={kw / 2} offsetY={kd / 2}>
          <Line points={[-lineLen / 2, 0, lineLen / 2, 0]} stroke={lineColour} strokeWidth={lineThick}
            dash={dash} opacity={el.opacity} />
          {dispLabel && (
            <Text x={0} y={0} text={dispLabel} fontSize={Math.max(lineThick * 0.5, 6)}
              fill={theme.textLabel} align="center" verticalAlign="middle" listening={false}
              offsetX={dispLabel.length * 3} offsetY={4} rotation={-el.rotation} />
          )}
          {OverlayLine(lineLen, lineThick)}
        </Group>
      )
    }

    case 'DOOR': {
      const doorW = Math.max(Math.min(kw, 6), 2)
      const swingR = kd
      return (
        <Group x={kx} y={ky} rotation={el.rotation}>
          <Rect width={doorW} height={kd} fill={fill} stroke={stroke} strokeWidth={strokeW} opacity={el.opacity} />
          <Line points={arcPoints(0, kd, swingR, 90, 0)} stroke={stroke} strokeWidth={0.5} listening={false} />
          <Line points={arcPoints(0, 0, 4, 0, 90)} stroke={stroke} strokeWidth={0.5} listening={false} />
          {OverlayRect()}
        </Group>
      )
    }

    case 'WINDOW': {
      return (
        <Group x={kx} y={ky} rotation={el.rotation}>
          <Rect width={kw} height={kd} fill={theme.fillWindow} stroke={stroke} strokeWidth={strokeW} opacity={el.opacity} />
          {[0, 0.5, 1].map((t) => (
            <Rect key={t} x={kw * t} y={0} width={1} height={kd} fill="#444" listening={false} opacity={t === 0 || t === 1 ? 0 : 1} />
          ))}
          {OverlayRect()}
        </Group>
      )
    }

    case 'TABLE': {
      const legR = Math.max(kw * 0.06, 2)
      const fontSize = Math.max(Math.min(kw, kd) * 0.3, 6)
      return (
        <Group x={kx} y={ky} rotation={el.rotation}>
          <Rect width={kw} height={kd} fill={fill} stroke={stroke} strokeWidth={strokeW} opacity={el.opacity} />
          {[[legR, legR], [kw - legR, legR], [legR, kd - legR], [kw - legR, kd - legR]].map(([cx, cy], i) => (
            <Circle key={i} x={cx} y={cy} radius={legR} fill="#222" listening={false} opacity={el.opacity} />
          ))}
          {showLabel && (
            <Text x={kw / 2} y={kd / 2} text={labelStr} fontSize={fontSize} fill={theme.textLabel}
              align="center" verticalAlign="middle" listening={false}
              offsetX={labelStr.length * fontSize * 0.3} offsetY={fontSize * 0.35} />
          )}
          {OverlayRect()}
        </Group>
      )
    }

    case 'CHAIR': {
      const r = Math.min(kw, kd) / 2
      const backW = Math.max(kw * 0.07, 2)
      const fontSize = Math.max(r * 0.4, 5)
      return (
        <Group x={kx + kw / 2} y={ky + kd / 2}>
          <Circle radius={r} fill={fill} stroke={stroke} strokeWidth={strokeW} opacity={el.opacity} />
          <Rect x={-r} y={-r - backW} width={r * 2} height={backW} fill={fill} stroke={stroke} strokeWidth={strokeW / 2} opacity={el.opacity} listening={false} />
          {showLabel && (
            <Text x={0} y={0} text={labelStr} fontSize={fontSize} fill={theme.textLabel}
              align="center" verticalAlign="middle" listening={false}
              offsetX={labelStr.length * fontSize * 0.3} offsetY={fontSize * 0.35} />
          )}
          {OverlayCircle(r + backW)}
        </Group>
      )
    }

    case 'BOOTH_BENCH': {
      const inset = Math.min(4, kw * 0.05, kd * 0.1)
      const fontSize = Math.max(Math.min(kw, kd) * 0.2, 6)
      return (
        <Group x={kx} y={ky} rotation={el.rotation}>
          <Rect width={kw} height={kd} fill={fill} stroke={stroke} strokeWidth={strokeW} opacity={el.opacity} />
          <Rect x={inset} y={inset} width={Math.max(0, kw - inset * 2)} height={Math.max(0, kd - inset * 2)}
            fill="transparent" stroke={stroke} strokeWidth={0.5} opacity={el.opacity} listening={false} />
          {showLabel && (
            <Text x={kw / 2} y={kd / 2} text={labelStr} fontSize={fontSize} fill={theme.textLabel}
              align="center" verticalAlign="middle" listening={false}
              offsetX={labelStr.length * fontSize * 0.3} offsetY={fontSize * 0.35} />
          )}
          {OverlayRect()}
        </Group>
      )
    }

    case 'SINK': {
      const basinR = Math.min(kw, kd) * 0.3
      return (
        <Group x={kx} y={ky} rotation={el.rotation}>
          <Rect width={kw} height={kd} fill={fill} stroke={stroke} strokeWidth={strokeW} opacity={el.opacity} />
          <Circle x={kw / 2} y={kd / 2} radius={basinR} fill="#FFF" opacity={0.3} listening={false} />
          {OverlayRect()}
        </Group>
      )
    }

    case 'TOILET': {
      const rx = kw / 2
      const ry = kd / 2
      const fontSize = Math.max(rx * 0.35, 5)
      return (
        <Group x={kx + rx} y={ky + ry}>
          <Circle radius={rx} fill={fill} stroke={stroke} strokeWidth={strokeW} opacity={el.opacity} scaleY={ry / rx} />
          {showLabel && (
            <Text x={0} y={0} text={labelStr} fontSize={fontSize} fill={theme.textLabel}
              align="center" verticalAlign="middle" listening={false}
              offsetX={labelStr.length * fontSize * 0.3} offsetY={fontSize * 0.35} />
          )}
          {OverlayCircle(rx)}
        </Group>
      )
    }

    case 'PLANT': {
      const r = Math.min(kw, kd) / 2
      return (
        <Group x={kx + kw / 2} y={ky + kd / 2}>
          <Circle radius={r * 0.9} fill="transparent" stroke={fill} strokeWidth={2} dash={[3, 2]} opacity={el.opacity} />
          <Circle radius={r * 0.4} fill={fill} stroke={stroke} strokeWidth={1} opacity={el.opacity} />
          {OverlayCircle(r * 0.9)}
        </Group>
      )
    }

    case 'STAIRS': {
      const stripes = [0.2, 0.4, 0.6, 0.8]
      return (
        <Group x={kx} y={ky} rotation={el.rotation}>
          <Rect width={kw} height={kd} fill={fill} stroke={stroke} strokeWidth={strokeW} opacity={el.opacity} />
          {stripes.map((t) => (
            <Line key={t} points={[0, kd * t, kw, kd * t]} stroke="#999" strokeWidth={0.5} opacity={el.opacity} listening={false} />
          ))}
          {OverlayRect()}
        </Group>
      )
    }

    case 'STORAGE': {
      return (
        <Group x={kx} y={ky} rotation={el.rotation}>
          <Rect width={kw} height={kd} fill={fill} stroke={stroke} strokeWidth={strokeW} opacity={el.opacity} />
          <Line points={[0, kd / 2, kw, kd / 2]} stroke="#888" strokeWidth={0.5} opacity={el.opacity} listening={false} />
          <Line points={[kw / 2, 0, kw / 2, kd]} stroke="#888" strokeWidth={0.5} opacity={el.opacity} listening={false} />
          {OverlayRect()}
        </Group>
      )
    }

    case 'BAR': {
      const fontSize = Math.max(Math.min(kw, kd) * 0.2, 7)
      return (
        <Group x={kx} y={ky} rotation={el.rotation}>
          <Rect width={kw} height={kd} fill={fill} stroke={stroke} strokeWidth={strokeW} opacity={el.opacity} />
          <Rect x={0} y={0} width={kw} height={Math.max(kd * 0.08, 3)} fill="#BBB" opacity={0.2} listening={false} />
          {showLabel && (
            <Text x={kw / 2} y={kd / 2} text={labelStr} fontSize={fontSize} fill={theme.textLabel}
              align="center" verticalAlign="middle" listening={false}
              offsetX={labelStr.length * fontSize * 0.3} offsetY={fontSize * 0.35} />
          )}
          {OverlayRect()}
        </Group>
      )
    }

    case 'KITCHEN_EQUIP': {
      return (
        <Group x={kx} y={ky} rotation={el.rotation}>
          <Rect width={kw} height={kd} fill={fill} stroke={stroke} strokeWidth={strokeW} opacity={el.opacity} />
          <Rect x={kw * 0.1} y={kd * 0.1} width={kw * 0.8} height={kd * 0.8}
            fill="transparent" stroke="#777" strokeWidth={1} cornerRadius={3} opacity={el.opacity} listening={false} />
          {OverlayRect()}
        </Group>
      )
    }

    case 'COUNTER': {
      const fontSize = Math.max(Math.min(kw, kd) * 0.25, 7)
      return (
        <Group x={kx} y={ky} rotation={el.rotation}>
          <Rect width={kw} height={kd} fill={fill} stroke={stroke} strokeWidth={strokeW} opacity={el.opacity} />
          <Line points={[0, kd, kw, kd]} stroke="rgba(255,255,255,0.15)" strokeWidth={2} opacity={el.opacity} listening={false} />
          {showLabel && (
            <Text x={kw / 2} y={kd / 2} text={labelStr} fontSize={fontSize} fill={theme.textLabel}
              align="center" verticalAlign="middle" listening={false}
              offsetX={labelStr.length * fontSize * 0.3} offsetY={fontSize * 0.35} />
          )}
          {OverlayRect()}
        </Group>
      )
    }

    default: {
      return (
        <>
          <Rect width={kw} height={kd} fill={fill} stroke={stroke} strokeWidth={strokeW} opacity={el.opacity} />
          {showLabel && (
            <Text x={kw / 2} y={kd / 2} text={labelStr}
              fontSize={Math.max(Math.min(kw, kd) * 0.3, 6)} fill={theme.textLabel}
              align="center" verticalAlign="middle" listening={false}
              offsetX={labelStr.length * 3} offsetY={4} />
          )}
          {OverlayRect()}
        </>
      )
    }
  }
}

// ── Section summary ──
export interface SectionSummaryEntry {
  sectionName: string
  sectionColour: string | null
  byType: Record<string, { count: number; totalCapacity: number }>
  itemCount: number
  totalCapacity: number
}

export function computeSectionSummary(elements: ElementData[], sections: { id: string; name: string; colour: string | null }[]): {
  entries: SectionSummaryEntry[]
  grandTotal: { byType: Record<string, { count: number; totalCapacity: number }>; itemCount: number; totalCapacity: number }
} {
  const sectionMap = new Map(sections.map((s) => [s.id, s]))
  const unassigned = { id: '__unassigned__', name: 'UNASSIGNED', colour: null }
  const entries: SectionSummaryEntry[] = []
  const grandByType: Record<string, { count: number; totalCapacity: number }> = {}
  let grandItems = 0
  let grandCap = 0

  const grouped = new Map<string, ElementData[]>()
  for (const el of elements) {
    const key = el.sectionId ?? '__unassigned__'
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(el)
  }

  for (const [secId, els] of grouped) {
    const sec = secId === '__unassigned__' ? unassigned : sectionMap.get(secId)
    const entry: SectionSummaryEntry = {
      sectionName: sec?.name ?? 'UNKNOWN',
      sectionColour: sec?.colour ?? null,
      byType: {},
      itemCount: 0,
      totalCapacity: 0,
    }
    for (const el of els) {
      if (!entry.byType[el.type]) entry.byType[el.type] = { count: 0, totalCapacity: 0 }
      entry.byType[el.type].count++
      entry.byType[el.type].totalCapacity += el.capacity ?? 0
      entry.itemCount++
      entry.totalCapacity += el.capacity ?? 0

      if (!grandByType[el.type]) grandByType[el.type] = { count: 0, totalCapacity: 0 }
      grandByType[el.type].count++
      grandByType[el.type].totalCapacity += el.capacity ?? 0
      grandItems++
      grandCap += el.capacity ?? 0
    }
    entries.push(entry)
  }

  return {
    entries,
    grandTotal: { byType: grandByType, itemCount: grandItems, totalCapacity: grandCap },
  }
}
