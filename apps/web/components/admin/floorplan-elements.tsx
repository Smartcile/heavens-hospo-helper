'use client'

import type { Vertex } from '@hospo-ops/types'

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
  _clientId?: string
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
