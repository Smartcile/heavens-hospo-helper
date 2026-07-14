'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import {
  PALETTE_ITEMS,
  computeSectionSummary, type PaletteItem, type ElementData,
} from '@/components/admin/floorplan-elements'
import type { SetupItemInput, TableProfileView } from '@hospo-ops/types'
import type { SectionBoundaryP } from '@/components/admin/floorplan-pixi'
import { ElementInventoryPanel } from '@/components/admin/ElementInventoryPanel'
import { SetupInventoryPanel } from '@/components/admin/SetupInventoryPanel'
import { FloorPlanPixiCanvas, type ViewState } from '@/components/admin/floorplan-pixi'
import { FloorplanToolbar } from '@/components/admin/FloorplanToolbar'
import { FloorplanInspector } from '@/components/admin/FloorplanInspector'
import { traceBoothPerimeter } from '@/lib/booth-trace'
import { calculateSetupInventory, unionTablePolygons, computeGroupChairs, computeSetupSectionTotals, type TableProfileWithBom } from '@/lib/floorplan-inventory'
import { defaultEdgeChairs, adjustEdgeChairs, emptyEdgeChairs, type TableEdge } from '@/lib/floorplan-chairs'
import { planAutoSeat, type AutoSeatProfile } from '@/lib/auto-seat'
import { pushToast, ToastContainer } from '@/components/ui/Toast'

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
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [paletteOpen, setPaletteOpen] = useState(true)
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [snap45Enabled, setSnap45Enabled] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [showInvTab, setShowInvTab] = useState(false)
  const [zones, setZones] = useState<SectionZone[]>([])
  const [zoneDrawing, setZoneDrawing] = useState(false)
  const [zoneDrawStart, setZoneDrawStart] = useState<{ x: number; y: number } | null>(null)
  const [zoneDrawRect, setZoneDrawRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [zoneSectionId, setZoneSectionId] = useState(sections[0]?.id ?? '')
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)
  const [selRect, setSelRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [customPresets, setCustomPresets] = useState<PaletteItem[]>([])
  const [presetFormOpen, setPresetFormOpen] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [presetW, setPresetW] = useState(80)
  const [presetD, setPresetD] = useState(80)
  const [presetFill, setPresetFill] = useState('#555')
  const [furnitureItems, setFurnitureItems] = useState<any[]>([])
  const [furnitureCatId, setFurnitureCatId] = useState('')
  const [paletteDefaults, setPaletteDefaults] = useState<Record<string, { width: number; depth: number }>>({})
  const [rightClickItem, setRightClickItem] = useState<string | null>(null)
  const [editDefW, setEditDefW] = useState('80')
  const [editDefD, setEditDefD] = useState('80')
  const [newTableOpen, setNewTableOpen] = useState(false)
  const [newTableName, setNewTableName] = useState('')
  const [newTableW, setNewTableW] = useState('80')
  const [newTableD, setNewTableD] = useState('80')
  const [newTableColour, setNewTableColour] = useState('#555')
  const [newTableChairs, setNewTableChairs] = useState('0')
  const [newTableTotalQty, setNewTableTotalQty] = useState('10')

  const INVENTORY_TYPES = ['TABLE', 'CHAIR', 'BOOTH_BENCH', 'BAR', 'COUNTER', 'SINK', 'STORAGE', 'KITCHEN_EQUIP']

  const containerRef = useRef<HTMLDivElement>(null)
  const nextIdCounter = useRef(1)
  const viewRef = useRef<ViewState>({ baseScale: 1, ox: 0, oy: 0, zoom: 1, panX: 0, panY: 0 })
  const zdStartRef = useRef<{ x: number; y: number } | null>(null)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [showDimensions, setShowDimensions] = useState(false)
  const [boothPainting, setBoothPainting] = useState(false)
  const [boothPaintKey, setBoothPaintKey] = useState(0)
  const boothCellsRef = useRef<Set<string>>(new Set())
  const [textScale, setTextScale] = useState(1)

  // ── Setup layer state ──
  const [setups, setSetups] = useState<{ id: string; name: string; eventDate?: string }[]>([])
  const [activeSetupId, setActiveSetupId] = useState<string | null>(null)
  const [setupItems, setSetupItems] = useState<SetupItemInput[]>([])
  const [setupSelectedIds, setSetupSelectedIds] = useState<string[]>([])
  const [tableProfiles, setTableProfiles] = useState<TableProfileView[]>([])
  const [sectionBoundaries, setSectionBoundaries] = useState<SectionBoundaryP[]>([])
  const [allInventoryItems, setAllInventoryItems] = useState<any[]>([])
  const [shortages, setShortages] = useState<any[] | null>(null)
  const [checkingInventory, setCheckingInventory] = useState(false)

  type HistorySnapshot = { elements: ElementData[]; setupItems: SetupItemInput[]; zones: SectionZone[] }
  const historyRef = useRef<{ past: HistorySnapshot[]; future: HistorySnapshot[] }>({ past: [], future: [] })

  function snapshot(): HistorySnapshot {
    return {
      elements: JSON.parse(JSON.stringify(elements)),
      setupItems: JSON.parse(JSON.stringify(setupItems)),
      zones: JSON.parse(JSON.stringify(zones)),
    }
  }

  function restore(s: HistorySnapshot) {
    setElements(s.elements)
    setSetupItems(s.setupItems)
    setZones(s.zones)
  }

  function pushHistory() {
    historyRef.current.past.push(snapshot())
    historyRef.current.future = []
  }

  function undo() {
    const { past, future } = historyRef.current
    if (past.length === 0) return
    const prev = past.pop()!
    future.push(snapshot())
    restore(prev)
  }

  function redo() {
    const { past, future } = historyRef.current
    if (future.length === 0) return
    const next = future.pop()!
    past.push(snapshot())
    restore(next)
  }

  // ── Setup layer functions ──

  function assignTableNumber(profileId: string, existingItems: SetupItemInput[]): string | null {
    const profile = tableProfiles.find(p => p.id === profileId)
    const pool = (profile as any)?.tableNumbers
    if (!pool || !Array.isArray(pool) || pool.length === 0) return null
    const used = new Set(
      existingItems
        .filter(i => i.tableProfileId === profileId && i.assignedNumber)
        .map(i => i.assignedNumber!)
    )
    const sorted = [...pool].map(String).sort((a, b) => Number(a) - Number(b))
    for (const num of sorted) { if (!used.has(num)) return num }
    return null
  }

  async function handleSetupChange(setupId: string | null) {
    setActiveSetupId(setupId)
    setSetupSelectedIds([])
    if (!setupId) { setSetupItems([]); return }
    const r = await fetch(`/api/admin/floorplan/${plan.id}/setups/${setupId}`)
    if (!r.ok) return
    const data = await r.json()
    const items: SetupItemInput[] = (data.items || []).map((i: any) => ({
      id: i.id,
      tableProfileId: i.tableProfileId,
      x: i.x, y: i.y, rotation: i.rotation ?? 0,
      width: i.tableProfile?.width ?? 80,
      depth: i.tableProfile?.depth ?? 80,
      tableGroupId: i.tableGroupId ?? null,
      assignedNumber: i.assignedNumber ?? null,
      label: i.assignedNumber ?? i.label ?? null,
      chairEdges: i.chairEdges ?? null,
    }))
    setSetupItems(items)
  }

  async function handleNewSetup() {
    const name = prompt('Setup name:')
    if (!name?.trim()) return
    const r = await fetch(`/api/admin/floorplan/${plan.id}/setups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim().toUpperCase() }),
    })
    if (!r.ok) return
    const created = await r.json()
    setSetups(prev => [...prev, created])
    handleSetupChange(created.id)
  }

  function handleGenerateSeating() {
    if (!activeSetupId) return
    const input = prompt('How many covers (party size)?')
    const partySize = parseInt(input ?? '')
    if (!partySize || partySize <= 0) return
    const profiles: AutoSeatProfile[] = tableProfiles.map((tp: any) => ({
      id: tp.id, capacity: tp.capacity ?? tp.chairCount, chairCount: tp.chairCount,
      width: tp.width, depth: tp.depth, tableNumbers: tp.tableNumbers ?? null,
    }))
    const usedNumbers: Record<string, string[]> = {}
    for (const i of setupItems) {
      if (i.assignedNumber) (usedNumbers[i.tableProfileId] ??= []).push(i.assignedNumber)
    }
    const placements = planAutoSeat(partySize, profiles, { usedNumbers })
    if (placements.length === 0) {
      pushToast('No table profiles available to auto-seat.', 'error')
      return
    }
    pushHistory()
    const newItems: SetupItemInput[] = placements.map((pl) => {
      const id = `new_setup_${nextIdCounter.current++}`
      const tp = tableProfiles.find(t => t.id === pl.profileId)
      return {
        id,
        tableProfileId: pl.profileId,
        assignedNumber: pl.assignedNumber,
        x: pl.x, y: pl.y, rotation: 0,
        width: pl.width, depth: pl.depth,
        label: pl.assignedNumber ?? tp?.name ?? 'TABLE',
        sectionId: sectionForPoint(pl.x + pl.width / 2, pl.y + pl.depth / 2),
        chairEdges: defaultEdgeChairs({
          width: pl.width, depth: pl.depth,
          seatingDensity: tp?.seatingDensity ?? null,
          maxHeadChairs: (tp as any)?.maxHeadChairs ?? 1,
          capacity: tp?.chairCount ?? 0,
        }),
      }
    })
    setSetupItems(prev => [...prev, ...newItems])
    pushToast(`Placed ${placements.length} tables for ${partySize} covers.`, 'success')
  }

  async function handleDeleteSetup() {
    if (!activeSetupId || !confirm('Delete this setup?')) return
    await fetch(`/api/admin/floorplan/${plan.id}/setups/${activeSetupId}`, { method: 'DELETE' })
    setSetups(prev => prev.filter(s => s.id !== activeSetupId))
    handleSetupChange(null)
  }

  function handleSetupItemDragEnd(id: string, x: number, y: number) {
    pushHistory()
    setSetupItems(prev => {
      const item = prev.find(i => i.id === id)
      if (!item) return prev
      const dx = x - item.x; const dy = y - item.y
      const place = (it: SetupItemInput, nx: number, ny: number): SetupItemInput => ({
        ...it, x: nx, y: ny, sectionId: sectionForPoint(nx + it.width / 2, ny + it.depth / 2),
      })
      // Move the whole group as a unit when the dragged table is grouped
      if (item.tableGroupId) {
        return prev.map(i =>
          i.id === id ? place(i, x, y)
            : i.tableGroupId === item.tableGroupId ? place(i, i.x + dx, i.y + dy)
              : i)
      }
      return prev.map(i => i.id === id ? place(i, x, y) : i)
    })
  }

  // Auto-join two same-profile tables dragged flush together (Phase 2).
  // Uses a temporary group id; real TableGroup rows are materialised on save.
  function handleSetupItemsJoin(draggedId: string, targetId: string) {
    setSetupItems(prev => {
      const dragged = prev.find(i => i.id === draggedId)
      const target = prev.find(i => i.id === targetId)
      if (!dragged || !target) return prev
      const groupId = target.tableGroupId ?? dragged.tableGroupId ?? `new_group_${nextIdCounter.current++}`
      const draggedOldGroup = dragged.tableGroupId
      return prev.map(i => {
        if (i.id === draggedId || i.id === targetId) return { ...i, tableGroupId: groupId }
        // pull along any members of the dragged table's previous group
        if (draggedOldGroup && i.tableGroupId === draggedOldGroup) return { ...i, tableGroupId: groupId }
        return i
      })
    })
  }

  function handleSetupItemDropToSection(id: string, sectionId: string) {
    setSetupItems(prev => prev.map(i => i.id === id ? { ...i, sectionId } : i))
  }

  function handleInventoryCheck() {
    if (!activeSetupId) return
    setCheckingInventory(true)
    const profilesMap = new Map(
      tableProfiles.map((tp: any) => [
        tp.id,
        {
          id: tp.id, name: tp.name, chairCount: tp.chairCount,
          seatingDensity: tp.seatingDensity, width: tp.width, depth: tp.depth, maxHeadChairs: tp.maxHeadChairs,
          bomItems: (tp.bomItems ?? []).map((b: any) => ({
            inventoryItemId: b.inventoryItemId ?? b.item?.id,
            quantity: b.quantity,
            perChair: b.perChair ?? false,
          })),
        },
      ])
    )
    const invMap = new Map(
      allInventoryItems.map((i: any) => [i.id, { itemId: i.id, name: i.name, available: i.totalQty ?? 0 }])
    )
    const result = calculateSetupInventory(setupItems, profilesMap, invMap)
    setShortages(result)
    setCheckingInventory(false)
  }

  async function handleGroup() {
    if (!activeSetupId) return
    const selected = setupItems.filter(i => setupSelectedIds.includes(i.id))
    const profileIds = new Set(selected.map(i => i.tableProfileId))
    if (profileIds.size > 1) {
      pushToast('All items in a group must have the same table profile.', 'error')
      return
    }
    const r = await fetch(`/api/admin/floorplan/${plan.id}/setups/${activeSetupId}/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: null, itemIds: setupSelectedIds }),
    })
    if (r.ok) {
      const group = await r.json()
      setSetupItems(prev => prev.map(i =>
        setupSelectedIds.includes(i.id) ? { ...i, tableGroupId: group.id } : i
      ))
      setSetupSelectedIds([])
    }
  }

  async function handleUngroup() {
    if (!activeSetupId) return
    const item = setupItems.find(i => i.id === setupSelectedIds[0])
    if (!item?.tableGroupId) return
    await fetch(`/api/admin/floorplan/${plan.id}/setups/${activeSetupId}/groups/${item.tableGroupId}`, { method: 'DELETE' })
    setSetupItems(prev => prev.map(i =>
      i.tableGroupId === item.tableGroupId ? { ...i, tableGroupId: null } : i
    ))
    setSetupSelectedIds([])
  }

  function deleteSetupSelected() {
    if (setupSelectedIds.length === 0) return
    pushHistory()
    const idSet = new Set(setupSelectedIds)
    setSetupItems(prev => prev.filter(i => !idSet.has(i.id)))
    setSetupSelectedIds([])
  }

  function rotateSetupSelected(rotation: number) {
    if (setupSelectedIds.length === 0) return
    pushHistory()
    const idSet = new Set(setupSelectedIds)
    setSetupItems(prev => prev.map(i => idSet.has(i.id) ? { ...i, rotation } : i))
  }

  function handleSetupItemRotate(id: string, rotation: number) {
    pushHistory()
    setSetupItems(prev => prev.map(i => i.id === id ? { ...i, rotation } : i))
  }

  function handleSetupChairEdge(id: string, edge: TableEdge, delta: number) {
    setSetupItems(prev => prev.map(i => {
      if (i.id !== id) return i
      const profile = tableProfiles.find(p => p.id === i.tableProfileId)
      const opts = {
        width: i.width,
        depth: i.depth,
        seatingDensity: profile?.seatingDensity ?? null,
        maxHeadChairs: profile?.maxHeadChairs ?? 1,
        capacity: profile?.chairCount ?? 0,
      }
      const current = i.chairEdges ?? emptyEdgeChairs()
      return { ...i, chairEdges: adjustEdgeChairs(current, edge, delta, opts) }
    }))
  }

  const [rebuildKey, setRebuildKey] = useState(0)
  const [editRoomW, setEditRoomW] = useState(plan.roomWidth.toString())
  const [editRoomD, setEditRoomD] = useState(plan.roomDepth.toString())
  const [editGridUnit, setEditGridUnit] = useState(plan.gridUnit.toString())

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(`/api/admin/floorplan/${plan.id}`)
        let loadedElements: any[] = []
        if (r.ok) {
          const data = await r.json()
          if (data.elements) {
            loadedElements = data.elements
            setElements(loadedElements.map((el: any) => ({
              ...el,
              labelVisible: el.labelVisible ?? true,
              sortOrder: el.sortOrder ?? 0,
              isActive: el.isActive ?? true,
              chairCount: el.chairCount ?? 0,
            })))
            nextIdCounter.current = (data.elements.length || 0) + 1
          }
          if (data.zones) setZones(data.zones)
        }
        const furnRes = await fetch('/api/admin/inventory?furniture=true')
        if (furnRes.ok) {
          const fiData = await furnRes.json()
          setFurnitureItems(Array.isArray(fiData) ? fiData : [])
          if (Array.isArray(fiData) && fiData.length > 0 && !furnitureCatId) setFurnitureCatId(fiData[0].categoryId)
        }
        const catRes = await fetch('/api/admin/inventory/categories')
        if (catRes.ok) { const cats = await catRes.json(); const fc = Array.isArray(cats) ? cats.find((c: any) => c.name === 'FURNITURE') : null; if (fc) setFurnitureCatId(fc.id) }
        const defRes = await fetch('/api/admin/palette-defaults')
        if (defRes.ok) {
          const defs: any[] = await defRes.json()
          if (Array.isArray(defs)) {
            const map: Record<string, { width: number; depth: number }> = {}
            for (const d of defs) map[d.type] = { width: d.width, depth: d.height ?? d.depth }
            setPaletteDefaults(map)
          }
        }
      } catch (e) {
        console.error('FloorPlanEditor load error:', e)
      }
      // Background loads for setup layer
      fetch(`/api/admin/floorplan/${plan.id}/setups`).then(r => { if (r.ok) r.json().then((d: any[]) => setSetups(d)) }).catch(() => {})
      fetch('/api/admin/table-profiles').then(r => { if (r.ok) r.json().then((d: any[]) => setTableProfiles(d)) }).catch(() => {})
      fetch(`/api/admin/floorplan/${plan.id}/section-boundaries`).then(r => { if (r.ok) r.json().then((d: any[]) => setSectionBoundaries(d)) }).catch(() => {})
      fetch('/api/admin/inventory').then(r => { if (r.ok) r.json().then((d: any[]) => setAllInventoryItems(d)) }).catch(() => {})
      setLoading(false)
    }
    load()
  }, [plan.id])

  // ResizeObserver triggers rebuild via rebuildKey
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setRebuildKey((k) => k + 1))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const selected = elements.find((e) => selectedIds.includes(e.id!)) ?? null

  const sectionMap = new Map(sections.map((s) => [s.id, s]))

  function updateElement(id: string, patch: Partial<ElementData>) {
    setElements((prev) => prev.map((e) => e.id === id ? { ...e, ...patch } : e))
  }

  function deleteSelected() {
    if (selectedIds.length === 0) return
    pushHistory()
    const idSet = new Set(selectedIds)
    setElements((prev) => prev.filter((e) => !idSet.has(e.id!)))
    setSelectedIds([])
  }

  function addFromPalette(item: PaletteItem, pos: { x: number; y: number }, furnItem?: any) {
    const id = `new_${nextIdCounter.current++}`
    const gu = plan.gridUnit
    const def = paletteDefaults[item.type]
    const w = furnItem?.elementWidth ?? def?.width ?? item.w
    const d = furnItem?.elementDepth ?? def?.depth ?? item.d
    const fill = furnItem?.defaultColour ?? item.fill
    const label = furnItem?.name ?? nextLabel(item.type, elements)
    const el: ElementData = {
      id,
      type: item.type,
      shape: furnItem?.elementShape ?? (item.circle ? 'CIRCLE' : 'RECTANGLE'),
      label,
      labelVisible: true,
      x: snapEnabled ? snap(pos.x - (item.circle ? 0 : w / 2), gu) : (pos.x - (item.circle ? 0 : w / 2)),
      y: snapEnabled ? snap(pos.y - (item.circle ? 0 : d / 2), gu) : (pos.y - (item.circle ? 0 : d / 2)),
      width: w || gu,
      depth: d || gu,
      radius: item.circle ? (snapEnabled ? snap(Math.min(w, d) / 2, gu) : Math.min(w, d) / 2) : null,
      rotation: 0,
      fillColour: fill,
      opacity: 1,
      zIndex: elements.length + 1,
      sortOrder: elements.length,
      isActive: true,
      style: null,
      chairCount: furnItem?.defaultChairCount ?? 0,
      _furnitureItemId: furnItem?.id ?? undefined,
    }
    pushHistory()
    setElements((prev) => [...prev, el])
    setSelectedIds([id])
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape' && boothPainting) {
      e.preventDefault()
      setBoothPainting(false)
      boothCellsRef.current.clear()
      setBoothPaintKey(k => k + 1)
      return
    }
    if (e.key === 'Delete') {
      if (setupSelectedIds.length > 0) { e.preventDefault(); deleteSetupSelected(); return }
      if (selectedIds.length > 0) { e.preventDefault(); deleteSelected(); return }
      if (zoneDrawing && selectedZoneId) { e.preventDefault(); setZones((prev) => prev.filter((z) => z.id !== selectedZoneId)); setSelectedZoneId(null); return }
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
    const inventoryLinks: { elementId: string; itemId: string; quantity?: number; remove?: boolean }[] = []
    const saveElements = elements.map((el) => {
      const isNew = el.id?.startsWith('new_')
      const clientId = el._clientId ?? el.id ?? ''
      if (el._furnitureItemId) {
        inventoryLinks.push({ elementId: clientId, itemId: el._furnitureItemId as string, quantity: 1 })
      }
      return { ...el, _clientId: clientId, id: isNew ? undefined : el.id }
    })
    const r = await fetch(`/api/admin/floorplan/${plan.id}/elements`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        elements: saveElements,
        zones: zones.length > 0 ? zones : undefined,
        inventoryLinks,
      }),
    })
    if (r.ok) {
      const res = await r.json()
      const saved: { id: string; _clientId: string }[] = res.saved ?? []
      const clientToReal = new Map(saved.map((s) => [s._clientId, s.id]))
      setElements((prev) =>
        prev.map((el) => {
          const realId = clientToReal.get(el._clientId ?? el.id!)
          if (realId && realId !== el.id) return { ...el, id: realId, _clientId: undefined, _furnitureItemId: undefined }
          return { ...el, _clientId: undefined, _furnitureItemId: undefined }
        })
      )
      // Refresh furniture items after save
      const furnRes = await fetch('/api/admin/inventory?furniture=true')
      if (furnRes.ok) {
        const fiData = await furnRes.json()
        setFurnitureItems(Array.isArray(fiData) ? fiData : [])
      }
    }
    // Save setup items (always when a setup is active, so deletions persist)
    if (activeSetupId) {
      try {
        // Collect temp groups (client-side joins not yet materialised as TableGroup rows)
        const tempGroups = new Map<string, string[]>()
        for (const i of setupItems) {
          if (i.tableGroupId?.startsWith('new_group_')) {
            if (!tempGroups.has(i.tableGroupId)) tempGroups.set(i.tableGroupId, [])
            tempGroups.get(i.tableGroupId)!.push(i.id)
          }
        }
        const saveItems = setupItems.map(i => ({
          ...i,
          id: i.id.startsWith('new_setup_') ? undefined : i.id,
          _clientId: i.id,
          assignedNumber: i.assignedNumber ?? null,
          label: i.assignedNumber ?? i.label ?? undefined,
          sectionId: i.sectionId ?? null,
          // Temp group ids aren't real FKs yet — save null, then create the group below
          tableGroupId: i.tableGroupId?.startsWith('new_group_') ? null : (i.tableGroupId ?? null),
        }))
        const r = await fetch(`/api/admin/floorplan/${plan.id}/setups/${activeSetupId}/items`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: saveItems }),
        })
        if (r.ok) {
          const res = await r.json()
          const clientToReal = new Map<string, string>((res.saved ?? []).map((s: any) => [s._clientId, s.id]))
          // Materialise real TableGroups for temp groups now that items have real ids
          const tempToRealGroup = new Map<string, string>()
          for (const [tempId, memberClientIds] of tempGroups) {
            const realIds = memberClientIds.map(cid => clientToReal.get(cid)).filter((v): v is string => !!v)
            if (realIds.length >= 2) {
              const gr = await fetch(`/api/admin/floorplan/${plan.id}/setups/${activeSetupId}/groups`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: null, itemIds: realIds }),
              })
              if (gr.ok) { const g = await gr.json(); tempToRealGroup.set(tempId, g.id) }
            }
          }
          setSetupItems(prev => prev.map(i => {
            const realId = clientToReal.get(i.id) ?? i.id
            let groupId = i.tableGroupId ?? null
            if (groupId && tempToRealGroup.has(groupId)) groupId = tempToRealGroup.get(groupId)!
            else if (groupId?.startsWith('new_group_')) groupId = null
            return { ...i, id: realId, tableGroupId: groupId }
          }))
        }
      } catch {}
    }
    setSaving(false)
  }

  const summary = showSummary ? computeSectionSummary(elements, sections) : null

  const furnitureWithAvailability = useMemo(() => {
    if (!Array.isArray(furnitureItems)) return []
    return furnitureItems.map((fi: any) => {
      const placed = elements.filter((e) => {
        if (e._furnitureItemId === fi.id) return true
        return ((e as any).inventoryItems ?? []).some((inv: any) => inv.itemId === fi.id)
      }).length
      return { ...fi, availableQty: (fi.totalQty ?? 0) - placed }
    })
  }, [furnitureItems, elements])

  // Merged-group outlines + redistributed chairs (rules-based) for grouped setup tables
  const setupGroupRenders = useMemo(() => {
    if (!activeSetupId) return []
    const groups = new Map<string, SetupItemInput[]>()
    for (const i of setupItems) {
      if (!i.tableGroupId) continue
      if (!groups.has(i.tableGroupId)) groups.set(i.tableGroupId, [])
      groups.get(i.tableGroupId)!.push(i)
    }
    const out: { id: string; outline: [number, number][][]; chairs: { x: number; y: number }[] }[] = []
    for (const [gid, members] of groups) {
      if (members.length < 2) continue
      const profile = tableProfiles.find(p => p.id === members[0].tableProfileId)
      const tables = members.map(m => ({ x: m.x, y: m.y, width: m.width, depth: m.depth, rotation: m.rotation ?? 0 }))
      const outline = unionTablePolygons(tables)
      let chairs: { x: number; y: number }[] = []
      if (profile?.seatingDensity && profile.seatingDensity > 0) {
        const headWidth = Math.min(profile.width, profile.depth)
        let headDir: number | undefined
        if (profile.width !== profile.depth) {
          const rb = (members[0].rotation ?? 0) % 180
          headDir = profile.width > profile.depth ? ((rb + 90) % 180 + 180) % 180 : ((rb % 180) + 180) % 180
        }
        const res = computeGroupChairs(tables, profile.seatingDensity, undefined, headWidth, profile.maxHeadChairs, headDir)
        chairs = res.placements.map(p => ({ x: p.x, y: p.y }))
      }
      out.push({ id: gid, outline, chairs })
    }
    return out
  }, [activeSetupId, setupItems, tableProfiles])

  const profilesForCalc = useMemo(() => {
    return new Map<string, TableProfileWithBom>(
      tableProfiles.map((tp: any) => [tp.id, {
        id: tp.id, name: tp.name, chairCount: tp.chairCount,
        seatingDensity: tp.seatingDensity, width: tp.width, depth: tp.depth, maxHeadChairs: tp.maxHeadChairs,
        bomItems: (tp.bomItems ?? []).map((b: any) => ({ inventoryItemId: b.inventoryItemId ?? b.item?.id, quantity: b.quantity, perChair: b.perChair ?? false })),
      }])
    )
  }, [tableProfiles])

  // Live per-section totals keyed by sectionId (for the zone badges + summary)
  const zoneTotals = useMemo(() => {
    if (!activeSetupId) return {}
    const zoneRects = zones.map(z => ({ sectionId: z.sectionId, x: z.x, y: z.y, width: z.width, height: z.height }))
    const totals = computeSetupSectionTotals(setupItems, zoneRects, profilesForCalc)
    const map: Record<string, { tables: number; seats: number }> = {}
    for (const t of totals) if (t.sectionId) map[t.sectionId] = { tables: t.tables, seats: t.seats }
    return map
  }, [activeSetupId, setupItems, zones, profilesForCalc])

  const setupGrand = useMemo(() => {
    if (!activeSetupId) return { tables: 0, seats: 0 }
    const zoneRects = zones.map(z => ({ sectionId: z.sectionId, x: z.x, y: z.y, width: z.width, height: z.height }))
    const totals = computeSetupSectionTotals(setupItems, zoneRects, profilesForCalc)
    return totals.reduce((acc, t) => ({ tables: acc.tables + t.tables, seats: acc.seats + t.seats }), { tables: 0, seats: 0 })
  }, [activeSetupId, setupItems, zones, profilesForCalc])

  function sectionForPoint(cx: number, cy: number): string | null {
    for (const z of zones) {
      if (cx >= z.x && cx <= z.x + z.width && cy >= z.y && cy <= z.y + z.height) return z.sectionId
    }
    return null
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="font-mono text-sm text-grey-light loading-cursor">LOADING</p>
      </div>
    )
  }

  return (
    <div tabIndex={0} onKeyDown={handleKeyDown} className="flex flex-col h-full outline-none">
      <ToastContainer />
      {/* ── TOP BAR ── */}
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-grey-mid bg-black">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="font-mono text-xs uppercase text-grey-light hover:text-white">← BACK</button>
          <h1 className="font-mono text-sm font-bold uppercase tracking-widest text-white">{plan.name}</h1>
          <div className="flex items-center gap-1">
            <input type="number" step="10" value={editRoomW} onChange={(e) => setEditRoomW(e.target.value)}
              className="w-14 bg-grey-dark border border-grey-mid text-white font-mono text-[10px] px-1 py-0.5 text-center outline-none focus:border-white" />
            <span className="font-mono text-[10px] text-grey-light">×</span>
            <input type="number" step="10" value={editRoomD} onChange={(e) => setEditRoomD(e.target.value)}
              className="w-14 bg-grey-dark border border-grey-mid text-white font-mono text-[10px] px-1 py-0.5 text-center outline-none focus:border-white" />
            <span className="font-mono text-[10px] text-grey-light">cm ·</span>
            <input type="number" step="10" value={editGridUnit} onChange={(e) => setEditGridUnit(e.target.value)}
              className="w-14 bg-grey-dark border border-grey-mid text-white font-mono text-[10px] px-1 py-0.5 text-center outline-none focus:border-white" />
            <span className="font-mono text-[10px] text-grey-light">cm grid</span>
            <button onClick={async () => {
              const r = await fetch(`/api/admin/floorplan/${plan.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomWidth: parseFloat(editRoomW) || plan.roomWidth, roomDepth: parseFloat(editRoomD) || plan.roomDepth, gridUnit: parseFloat(editGridUnit) || plan.gridUnit }),
              })
              if (r.ok) setRebuildKey((k) => k + 1)
            }}
              className="font-mono text-[10px] text-success hover:text-white uppercase px-1 py-0.5 border border-success">
              APPLY
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleSave} loading={saving} size="sm">SAVE</Button>
          <button onClick={undo} className="font-mono text-xs uppercase text-grey-light hover:text-white border border-grey-mid px-2 py-1">↶</button>
          <button onClick={redo} className="font-mono text-xs uppercase text-grey-light hover:text-white border border-grey-mid px-2 py-1">↷</button>
        </div>
      </div>

      {/* ── LAYER TOGGLE ── */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-grey-mid bg-grey-dark">
        <div className="flex items-center">
          <button onClick={() => handleSetupChange(null)}
            className={`font-mono text-xs uppercase px-3 py-1 border-l border-t border-b ${!activeSetupId ? 'border-white text-white bg-grey-mid' : 'border-grey-mid text-grey-light hover:border-white'}`}>
            BASE PLAN
          </button>
          <button onClick={() => {
            if (!activeSetupId && setups.length === 0) handleNewSetup()
            else if (!activeSetupId && setups.length > 0) handleSetupChange(setups[0].id)
          }}
            className={`font-mono text-xs uppercase px-3 py-1 border ${activeSetupId ? 'border-white text-white bg-grey-mid' : 'border-grey-mid text-grey-light hover:border-white'}`}>
            TABLE LAYOUT
          </button>
          {activeSetupId && setups.length > 0 && (
            <div className="flex items-center ml-3 gap-1">
              <select
                value={activeSetupId}
                onChange={(e) => handleSetupChange(e.target.value || null)}
                className="bg-grey-dark border border-grey-mid text-white font-mono text-[10px] px-2 py-1 outline-none"
              >
                {setups.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button onClick={handleNewSetup}
                className="font-mono text-[10px] text-grey-light hover:text-white uppercase px-1.5 py-0.5 border border-grey-mid">
                + NEW
              </button>
              <button onClick={handleDeleteSetup}
                className="font-mono text-[10px] text-danger hover:text-white uppercase px-1.5 py-0.5 border border-red-800/50">
                DELETE
              </button>
            </div>
          )}
        </div>
        {activeSetupId && (
          <span className="font-mono text-[10px] uppercase text-success tracking-wider">
            {setupGrand.tables} TBL · {setupGrand.seats} PAX
          </span>
        )}
      </div>

      {/* ── CONTEXT TOOLBAR ── */}
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-grey-mid bg-black flex-wrap">
        <label className="flex items-center gap-1 font-mono text-[10px] text-grey-light cursor-pointer select-none">
          <input type="checkbox" checked={snapEnabled} onChange={() => setSnapEnabled(!snapEnabled)} className="accent-white" />
          GRID
        </label>
        {activeSetupId ? (
          <>
            <button onClick={handleGenerateSeating}
              className="font-mono text-[10px] uppercase px-2 py-1 border border-grey-mid text-grey-light hover:border-accent hover:text-accent">
              ⚡ GENERATE
            </button>
            {setupSelectedIds.length >= 2 && (
              <button onClick={handleGroup}
                className="font-mono text-[10px] uppercase px-2 py-1 border border-grey-mid text-grey-light hover:border-white">
                GROUP
              </button>
            )}
            {setupSelectedIds.length === 1 && (() => {
              const grouped = setupItems.find(i => i.id === setupSelectedIds[0] && i.tableGroupId)
              return grouped ? (
                <button onClick={handleUngroup}
                  className="font-mono text-[10px] uppercase px-2 py-1 border border-red-800/50 text-danger hover:border-red-700">
                  UNGROUP
                </button>
              ) : null
            })()}
            <span className="font-mono text-[9px] text-grey-light ml-1">BASE PLAN LOCKED</span>
          </>
        ) : (
          <>
            <label className="flex items-center gap-1 font-mono text-[10px] text-grey-light cursor-pointer select-none">
              <input type="checkbox" checked={snap45Enabled} onChange={() => setSnap45Enabled(!snap45Enabled)} className="accent-white" />
              45°
            </label>
            <button onClick={() => {
              if (zoneDrawing) { setZoneDrawing(false); setZoneDrawStart(null); setZoneDrawRect(null) }
              else { setZoneDrawing(true); setBoothPainting(false) }
            }}
              className={`font-mono text-[10px] uppercase px-2 py-1 border ${zoneDrawing ? 'border-accent text-accent bg-accent/10' : 'border-grey-mid text-grey-light'} hover:border-accent transition-colors`}>
              SECTIONS {zoneDrawing ? '· ON' : ''}
            </button>
            <button onClick={() => {
              if (boothPainting) { setBoothPainting(false); boothCellsRef.current.clear(); setBoothPaintKey(k => k + 1) }
              else { setBoothPainting(true); setZoneDrawing(false); setSelectedIds([]) }
            }}
              className={`font-mono text-[10px] uppercase px-2 py-1 border ${boothPainting ? 'border-accent text-accent bg-accent/10' : 'border-grey-mid text-grey-light'} hover:border-accent transition-colors`}>
              DRAW BOOTH {boothPainting ? '· ON' : ''}
            </button>
            {boothPainting && boothCellsRef.current.size > 0 && (
              <button onClick={() => {
                const result = traceBoothPerimeter(boothCellsRef.current)
                if (!result) return
                const label = nextLabel('BOOTH_BENCH', elements)
                const id = `new_${nextIdCounter.current++}`
                const el: ElementData = {
                  id, type: 'BOOTH_BENCH', shape: 'POLYGON', label, labelVisible: true,
                  x: result.bx, y: result.by, width: result.bw, depth: result.bd,
                  vertices: result.outerVertices, rotation: 0, fillColour: '#3D3D4D',
                  opacity: 1, zIndex: elements.length + 1, sortOrder: elements.length, isActive: true,
                  style: { cushionVertices: result.cushionVertices }, chairCount: 0,
                }
                pushHistory()
                setElements(prev => [...prev, el])
                setSelectedIds([id])
                boothCellsRef.current.clear()
                setBoothPainting(false)
                setBoothPaintKey(k => k + 1)
              }}
                className="font-mono text-[10px] text-success hover:text-white uppercase px-2 py-1 border border-success">
                SAVE SHAPE ({boothCellsRef.current.size} BLOCKS)
              </button>
            )}
            <button onClick={() => setShowSummary(!showSummary)}
              className={`font-mono text-[10px] uppercase px-2 py-1 border ${showSummary ? 'border-success text-success' : 'border-grey-mid text-grey-light hover:border-success'}`}>
              SUMMARY
            </button>
          </>
        )}
        <span className="flex-1" />
        <div className="flex items-center gap-1">
          <span className="font-mono text-[8px] text-grey-light">TEXT</span>
          <input type="range" min="0.5" max="3" step="0.1" value={textScale} onChange={(e) => setTextScale(parseFloat(e.target.value))}
            className="w-16 accent-white" />
          <span className="font-mono text-[9px] text-grey-light w-5">{textScale.toFixed(1)}×</span>
        </div>
        <FloorplanToolbar zoom={zoomLevel} onZoomChange={(z) => { setZoomLevel(z); viewRef.current.zoom = z; setRebuildKey((k) => k + 1) }}
          showDimensions={showDimensions} onShowDimensionsChange={setShowDimensions} />
        <button onClick={() => setPaletteOpen(!paletteOpen)}
          className={`font-mono text-xs uppercase px-2 py-1 border ${paletteOpen ? 'border-white text-white' : 'border-grey-mid text-grey-light hover:border-white transition-colors'}`}>
          PALETTE
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        {paletteOpen && (
          <div className="w-44 flex-shrink-0 border-r border-grey-mid overflow-y-auto bg-grey-dark p-2 space-y-1">
            {/* ── BASE PLAN PALETTE ── */}
            {!activeSetupId && (
              <>
                {(['FIXTURE', 'FURNITURE'] as const).map((cat) => {
                  const items = [...PALETTE_ITEMS, ...customPresets].filter((i) => i.category === cat)
                  if (items.length === 0) return null
                  return (
                    <div key={cat}>
                      <p className="font-mono text-[10px] text-grey-light uppercase tracking-wider px-1 pb-1 border-b border-grey-mid mt-2 first:mt-0">{cat}</p>
                      {items.map((item) => {
                        const def = paletteDefaults[item.type]
                        const dispW = def?.width ?? item.w; const dispD = def?.depth ?? item.d
                        return (
                          <div key={item.type}>
                            <div
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData('text/plain', item.type)
                                const dragImg = new globalThis.Image()
                                dragImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
                                e.dataTransfer.setDragImage(dragImg, 0, 0)
                              }}
                              onContextMenu={(e) => { e.preventDefault(); setRightClickItem(rightClickItem === item.type ? null : item.type); setEditDefW(dispW.toString()); setEditDefD(dispD.toString()) }}
                              className="flex items-center gap-2 p-1.5 cursor-grab hover:bg-grey-mid transition-colors"
                            >
                              <div className="w-4 h-4 flex-shrink-0 border border-grey-light" style={{ backgroundColor: item.fill }} />
                              <span className="font-mono text-[10px] text-white uppercase truncate">{item.label}</span>
                              <span className="font-mono text-[8px] text-grey-light ml-auto">{dispW}×{dispD}</span>
                            </div>
                            {rightClickItem === item.type && (
                              <div className="flex items-center gap-1 px-1 pb-1">
                                <input type="number" value={editDefW} onChange={(e) => setEditDefW(e.target.value)}
                                  className="w-12 bg-grey-dark border border-grey-mid text-white font-mono text-[8px] px-1 py-0.5 text-center" />
                                <span className="text-grey-light text-[8px]">×</span>
                                <input type="number" value={editDefD} onChange={(e) => setEditDefD(e.target.value)}
                                  className="w-12 bg-grey-dark border border-grey-mid text-white font-mono text-[8px] px-1 py-0.5 text-center" />
                                <button onClick={async () => {
                                  const w = parseFloat(editDefW) || dispW; const d = parseFloat(editDefD) || dispD
                                  await fetch('/api/admin/palette-defaults', {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ items: [{ type: item.type, width: w, depth: d }] }),
                                  })
                                  setPaletteDefaults((prev) => ({ ...prev, [item.type]: { width: w, depth: d } }))
                                  setRightClickItem(null)
                                }}
                                  className="font-mono text-[8px] text-success hover:text-white uppercase">OK</button>
                                <button onClick={() => setRightClickItem(null)}
                                  className="font-mono text-[8px] text-grey-light hover:text-white uppercase">✕</button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
                {furnitureWithAvailability.length > 0 && (
                  <div>
                    <p className="font-mono text-[10px] text-grey-light uppercase tracking-wider px-1 pb-1 border-b border-grey-mid mt-2">INVENTORY</p>
                    {furnitureWithAvailability.map((fi: any) => (
                      <div
                        key={`furn_${fi.id}`}
                        draggable={fi.availableQty > 0}
                        onDragStart={(e) => {
                          if (fi.availableQty <= 0) { e.preventDefault(); return }
                          e.dataTransfer.setData('text/plain', `furn_${fi.id}`)
                          const dragImg = new globalThis.Image()
                          dragImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
                          e.dataTransfer.setDragImage(dragImg, 0, 0)
                        }}
                        className={`flex items-center gap-2 p-1.5 transition-colors ${fi.availableQty > 0 ? 'cursor-grab hover:bg-grey-mid' : 'cursor-not-allowed opacity-40'}`}
                      >
                        <div className="w-4 h-4 flex-shrink-0 border border-grey-light" style={{ backgroundColor: fi.defaultColour ?? '#555' }} />
                        <span className="font-mono text-[10px] text-white truncate">{fi.name}</span>
                        <span className="font-mono text-[8px] text-grey-light ml-auto">{fi.elementWidth}×{fi.elementDepth}</span>
                        <span className={`font-mono text-[8px] ml-1 ${fi.availableQty > 0 ? 'text-accent' : 'text-danger'}`}>
                          {fi.availableQty}/{fi.totalQty ?? 0}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            {/* ── TABLE LAYOUT PALETTE ── */}
            {activeSetupId && tableProfiles.length > 0 && (
              <div>
                <p className="font-mono text-[10px] text-grey-light uppercase tracking-wider px-1 pb-1 border-b border-grey-mid mt-2">TABLE PROFILES</p>
                {tableProfiles.map(tp => {
                  const pool = (tp as any)?.tableNumbers
                  const poolArr: string[] = Array.isArray(pool) ? pool.map(String) : []
                  const used = new Set(
                    setupItems
                      .filter(i => i.tableProfileId === tp.id && i.assignedNumber)
                      .map(i => i.assignedNumber!)
                  )
                  const available = poolArr.filter(n => !used.has(n))
                  const canDrag = poolArr.length === 0 || available.length > 0
                  return (
                    <div key={tp.id} draggable={canDrag}
                      onDragStart={(e) => {
                        if (!canDrag) { e.preventDefault(); pushToast(`All table numbers for ${tp.name} are in use.`, 'error'); return }
                        e.dataTransfer.setData('text/plain', `tp_${tp.id}`)
                        const dragImg = new globalThis.Image()
                        dragImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
                        e.dataTransfer.setDragImage(dragImg, 0, 0)
                      }}
                      className={`flex items-center gap-2 p-1.5 transition-colors ${canDrag ? 'cursor-grab hover:bg-grey-mid' : 'cursor-not-allowed opacity-40'}`}
                    >
                      <div className="w-4 h-4 flex-shrink-0 border border-grey-light" style={{ backgroundColor: tp.colour ?? '#555' }} />
                      <span className="font-mono text-[10px] text-white truncate">{tp.name}</span>
                      <span className="font-mono text-[8px] text-grey-light ml-auto">{tp.width}×{tp.depth}</span>
                      <span className="font-mono text-[8px] text-grey-light">{tp.chairCount}S</span>
                      {poolArr.length > 0 && (
                        <span className={`font-mono text-[8px] ml-1 ${available.length > 0 ? 'text-success' : 'text-danger'}`}>
                          {available.length}/{poolArr.length}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {!activeSetupId && (
              <>
                {(furnitureItems.length > 0 || true) && (
                  <div className="border-t border-grey-mid pt-1 mt-1">
                    {newTableOpen ? (
                      <div className="space-y-1 px-1">
                        <Input label="Name" value={newTableName} onChange={(e) => setNewTableName(e.target.value)} placeholder="TABLE" />
                        <div className="grid grid-cols-2 gap-1">
                          <Input label="W" type="number" value={newTableW} onChange={(e) => setNewTableW(e.target.value)} />
                          <Input label="D" type="number" value={newTableD} onChange={(e) => setNewTableD(e.target.value)} />
                        </div>
                        <Input label="Colour" value={newTableColour} onChange={(e) => setNewTableColour(e.target.value)} placeholder="#555" />
                        <Input label="Chairs" type="number" value={newTableChairs} onChange={(e) => setNewTableChairs(e.target.value)} />
                        <Input label="Stock Qty" type="number" value={newTableTotalQty} onChange={(e) => setNewTableTotalQty(e.target.value)} />
                        <div className="flex gap-1">
                          <button onClick={async () => {
                            const name = (newTableName || `TABLE-${Math.floor(Math.random() * 1000)}`).toUpperCase().trim()
                            if (!name) return
                            let catId = furnitureCatId
                            if (!catId) {
                              const cre = await fetch('/api/admin/inventory/categories')
                              if (cre.ok) { const cats = await cre.json(); const fc = cats.find((c: any) => c.name === 'FURNITURE'); if (fc) { catId = fc.id; setFurnitureCatId(fc.id) } }
                            }
                            if (!catId) return
                            const r = await fetch('/api/admin/inventory', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                name,
                                categoryId: catId,
                                unit: 'EA', defaultParLevel: 0, totalQty: parseInt(newTableTotalQty) || 10,
                                furnitureType: 'TABLE',
                                elementWidth: parseFloat(newTableW) || 80,
                                elementDepth: parseFloat(newTableD) || 80,
                                elementShape: 'RECTANGLE',
                                defaultColour: newTableColour,
                                defaultChairCount: parseInt(newTableChairs) || 0,
                              }),
                            })
                            if (r.ok) {
                              const created = await r.json()
                              setFurnitureItems((prev) => [...prev, created])
                              setNewTableOpen(false); setNewTableName(''); setNewTableW('80'); setNewTableD('80'); setNewTableColour('#555'); setNewTableChairs('0'); setNewTableTotalQty('10')
                            }
                          }}
                            className="font-mono text-[10px] text-success hover:text-white uppercase px-1.5 py-0.5 border border-success flex-1">
                            CREATE
                          </button>
                          <button onClick={() => setNewTableOpen(false)}
                            className="font-mono text-[10px] text-grey-light hover:text-white uppercase px-1.5 py-0.5">
                            CANCEL
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setNewTableOpen(true)}
                        className="font-mono text-[10px] text-grey-light hover:text-white uppercase px-1.5 py-1 w-full text-left">
                        + NEW TABLE
                      </button>
                    )}
                  </div>
                )}
                <div className="border-t border-grey-mid pt-2 mt-2">
                  {presetFormOpen ? (
                    <div className="space-y-1 px-1">
                      <Input label="Name" value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="E.G. TABLE-60X60" />
                      <div className="grid grid-cols-2 gap-1">
                        <Input label="W" type="number" value={presetW.toString()} onChange={(e) => setPresetW(parseInt(e.target.value) || 80)} />
                        <Input label="D" type="number" value={presetD.toString()} onChange={(e) => setPresetD(parseInt(e.target.value) || 80)} />
                      </div>
                      <Input label="Colour" value={presetFill} onChange={(e) => setPresetFill(e.target.value)} placeholder="#555" />
                      <div className="flex gap-1">
                        <button onClick={() => {
                          if (!presetName.trim()) return
                          const p: PaletteItem = { type: presetName.toUpperCase().trim(), label: presetName.toUpperCase().trim(), w: presetW, d: presetD, fill: presetFill, category: 'FURNITURE' }
                          setCustomPresets((prev) => [...prev, p])
                          setPresetName(''); setPresetW(80); setPresetD(80); setPresetFill('#555')
                          setPresetFormOpen(false)
                        }}
                          className="font-mono text-[10px] text-success hover:text-white uppercase px-1.5 py-0.5 border border-success flex-1">
                          ADD
                        </button>
                        <button onClick={() => setPresetFormOpen(false)}
                          className="font-mono text-[10px] text-grey-light hover:text-white uppercase px-1.5 py-0.5">
                          CANCEL
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setPresetFormOpen(true)}
                      className="font-mono text-[10px] text-grey-light hover:text-white uppercase px-1.5 py-1 w-full text-left">
                      + ADD PRESET
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        <div
          ref={containerRef}
          className="flex-1 overflow-hidden bg-black"
          onContextMenu={(e) => e.preventDefault()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const type = e.dataTransfer.getData('text/plain')
            const rect = containerRef.current!.getBoundingClientRect()
            const vs = viewRef.current
            const screenX = e.clientX - rect.left
            const screenY = e.clientY - rect.top
            const x = (screenX - vs.ox - vs.panX) / (vs.baseScale * vs.zoom)
            const y = (screenY - vs.oy - vs.panY) / (vs.baseScale * vs.zoom)
            if (type.startsWith('furn_')) {
              if (!Array.isArray(furnitureItems)) return
              const fi = furnitureItems.find((f: any) => `furn_${f.id}` === type)
              if (!fi) return
              const placed = elements.filter((e) => {
                if (e._furnitureItemId === fi.id) return true
                return ((e as any).inventoryItems ?? []).some((inv: any) => inv.itemId === fi.id)
              }).length
              const available = (fi.totalQty ?? 0) - placed
              if (available <= 0) { pushToast('Out of stock. Please add more to inventory.', 'error'); return }
              const paletteItem: PaletteItem = {
                type: fi.furnitureType ?? 'TABLE',
                label: fi.name,
                w: fi.elementWidth ?? 80,
                d: fi.elementDepth ?? 80,
                fill: fi.defaultColour ?? '#555',
                category: 'FURNITURE',
                circle: fi.elementShape === 'CIRCLE',
              }
              addFromPalette(paletteItem, { x, y }, fi)
              return
            }
            // TableProfile drop (setup mode)
            if (type.startsWith('tp_') && activeSetupId) {
              const tpId = type.replace('tp_', '')
              const tp = tableProfiles.find(p => p.id === tpId)
              if (!tp) return
              const pool = (tp as any)?.tableNumbers
              const poolArr: string[] = Array.isArray(pool) ? pool.map(String) : []
              const assignedNumber = assignTableNumber(tp.id, setupItems)
              if (poolArr.length > 0 && assignedNumber === null) {
                pushToast(`All table numbers for ${tp.name} are assigned.`, 'error')
                return
              }
              const id = `new_setup_${nextIdCounter.current++}`
              const gu = plan.gridUnit
              const itemX = snapEnabled ? snap(x, gu) - tp.width / 2 : x - tp.width / 2
              const itemY = snapEnabled ? snap(y, gu) - tp.depth / 2 : y - tp.depth / 2
              const item: SetupItemInput = {
                id,
                tableProfileId: tp.id,
                assignedNumber,
                x: itemX,
                y: itemY,
                rotation: 0,
                width: tp.width,
                depth: tp.depth,
                sectionId: sectionForPoint(itemX + tp.width / 2, itemY + tp.depth / 2),
                label: assignedNumber ?? tp.name,
                chairEdges: defaultEdgeChairs({
                  width: tp.width, depth: tp.depth,
                  seatingDensity: tp.seatingDensity ?? null,
                  maxHeadChairs: (tp as any).maxHeadChairs ?? 1,
                  capacity: tp.chairCount ?? 0,
                }),
              }
              pushHistory()
              setSetupItems(prev => [...prev, item])
              return
            }
            const item = [...PALETTE_ITEMS, ...customPresets].find((p) => p.type === type)
            if (!item) return
            addFromPalette(item, { x, y })
          }}
        >
          <FloorPlanPixiCanvas
            roomWidth={plan.roomWidth} roomDepth={plan.roomDepth} gridUnit={plan.gridUnit}
            elements={elements} zones={zones}
            selectedIds={selectedIds} snapEnabled={snapEnabled}
            sectionColours={new Map(sections.filter((s) => s.colour).map((s) => [s.id, s.colour!]))}
            sectionNames={new Map(sections.map((s) => [s.id, s.name]))}
            zoneDrawing={zoneDrawing}
            zoneDrawStart={zoneDrawStart}
            zoneDrawRect={zoneDrawRect}
            selectedZoneId={selectedZoneId}
            containerRef={containerRef}
            viewRef={viewRef}
            onElementClick={(id, ctrlKey) => {
              if (!id) { setSelectedIds([]); return }
              if (ctrlKey) {
                const el = elements.find((e) => e.id === id)
                if (el?.type === 'TABLE') {
                  setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
                }
              } else {
                setSelectedIds((prev) => prev.length === 1 && prev[0] === id ? prev : [id])
              }
            }}
            onElementDragEnd={(id, x, y) => { pushHistory(); updateElement(id, { x, y }) }}
            onZoneClick={(id) => setSelectedZoneId(id)}
            onZoneDragEnd={(id, x, y) => setZones((prev) => prev.map((z) => z.id === id ? { ...z, x, y } : z))}
            onZoneResize={(id, x, y, w, h) => setZones((prev) => prev.map((z) => z.id === id ? { ...z, x, y, width: w, height: h } : z))}
            onZoneDrawStart={(x, y) => {
              const gu = plan.gridUnit
              const sx = snap(x, gu); const sy = snap(y, gu)
              zdStartRef.current = { x: sx, y: sy }
              setZoneDrawStart({ x: sx, y: sy }); setZoneDrawRect(null); setSelectedZoneId(null)
            }}
            onZoneDrawMove={(cx, cy) => {
              const s = zdStartRef.current
              if (!s) return
              const gu = plan.gridUnit
              const sx = snap(cx, gu); const sy = snap(cy, gu)
              setZoneDrawRect({ x: Math.min(s.x, sx), y: Math.min(s.y, sy), w: Math.abs(sx - s.x), h: Math.abs(sy - s.y) })
            }}
            onZoneDrawEnd={(cx, cy) => {
              const s = zdStartRef.current
              zdStartRef.current = null
              if (!s) { setZoneDrawRect(null); return }
              const gu = plan.gridUnit
              const sx = snap(cx, gu); const sy = snap(cy, gu)
              const w = Math.abs(sx - s.x); const h = Math.abs(sy - s.y)
              if (w > gu && h > gu) {
                setZones((pz) => [...pz, { id: `zone_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, x: Math.min(s.x, sx), y: Math.min(s.y, sy), width: w, height: h, sectionId: zoneSectionId }])
              }
              setZoneDrawRect(null); setSelectedZoneId(null); setZoneDrawStart(null)
            }}
            textScale={textScale}
            onViewChange={(z) => setZoomLevel(z)}
            selRect={selRect}
            onSelRectStart={(x, y) => { setSelRect({ x, y, w: 0, h: 0 }); setSelectedIds([]) }}
            onSelRectMove={(cx, cy) => setSelRect((prev) => prev ? { ...prev, w: cx - prev.x, h: cy - prev.y } : prev)}
            onSelRectEnd={(cx, cy) => {
              setSelRect((prev) => {
                if (!prev) return prev
                const rx = Math.min(prev.x, cx); const ry = Math.min(prev.y, cy)
                const rw = Math.abs(cx - prev.x); const rh = Math.abs(cy - prev.y)
                if (rw < 5 && rh < 5) return null
                const hits = elements.filter((e) => {
                  const ex = e.x; const ey = e.y; const ew = e.width; const ed = e.depth
                  return ex < rx + rw && ex + ew > rx && ey < ry + rh && ey + ed > ry
                })
                setSelectedIds(hits.map((e) => e.id!))
                // Also select setup items intersecting the rectangle
                if (activeSetupId) {
                  const selected = setupItems.filter(item =>
                    item.x < rx + rw && item.x + item.width > rx &&
                    item.y < ry + rh && item.y + item.depth > ry
                  ).map(i => i.id)
                  setSetupSelectedIds(selected)
                }
                return null
              })
            }}
            rebuildKey={rebuildKey}
            showDimensions={showDimensions}
            boothPainting={boothPainting}
            boothCellsRef={boothCellsRef}
            onBoothCellToggle={() => setBoothPaintKey(k => k + 1)}
            setupItems={activeSetupId ? setupItems.map(i => ({
              ...i,
              colour: tableProfiles.find(tp => tp.id === i.tableProfileId)?.colour ?? '#555',
              chairCount: tableProfiles.find(tp => tp.id === i.tableProfileId)?.chairCount ?? 0,
              chairEdges: i.chairEdges ?? null,
            })) : undefined}
            setupSelectedIds={activeSetupId ? setupSelectedIds : []}
            onSetupItemClick={(id, ctrlKey) => {
              if (!id) { setSetupSelectedIds([]); return }
              setSetupSelectedIds(prev =>
                ctrlKey ? (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
                  : prev.length === 1 && prev[0] === id ? prev : [id]
              )
            }}
            onSetupItemDragEnd={handleSetupItemDragEnd}
            onSetupChairEdge={handleSetupChairEdge}
            onSetupItemRotate={handleSetupItemRotate}
            onSetupItemsJoin={handleSetupItemsJoin}
            setupGroups={activeSetupId ? setupGroupRenders : undefined}
            zoneTotals={activeSetupId ? zoneTotals : undefined}
            setupActive={!!activeSetupId}
            sectionBoundaries={activeSetupId ? sectionBoundaries : undefined}
            onElementDropToSection={activeSetupId ? handleSetupItemDropToSection : undefined}
          />
        </div>

        {/* Right panel — always rendered */}
        <div className="w-56 flex-shrink-0 border-l border-grey-mid overflow-y-auto bg-grey-dark p-3 space-y-3">
          <SetupInventoryPanel
            activeSetupId={activeSetupId}
            shortages={shortages}
            onCheck={handleInventoryCheck}
            checking={checkingInventory}
          />
          {setupSelectedIds.length > 0 ? (() => {
            const sel = setupItems.filter(i => setupSelectedIds.includes(i.id))
            const first = sel[0]
            const profile = first ? tableProfiles.find(p => p.id === first.tableProfileId) : null
            const sectionName = first?.sectionId ? sectionMap.get(first.sectionId)?.name : null
            const edges = first?.chairEdges ?? { top: 0, bottom: 0, left: 0, right: 0 }
            const totalChairs = edges.top + edges.bottom + edges.left + edges.right
            return (
              <>
                {/* ── TABLE IDENTITY ── */}
                <div className="border border-grey-mid p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 flex-shrink-0 border border-grey-mid" style={{ backgroundColor: profile?.colour ?? '#555' }} />
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs font-bold text-white uppercase truncate">
                        {sel.length > 1 ? `${sel.length} TABLES` : (first?.label || profile?.name || 'TABLE')}
                      </p>
                      {profile && (
                        <p className="font-mono text-[9px] text-grey-light">{profile.name} · {profile.chairCount}S CAP</p>
                      )}
                    </div>
                    <button onClick={deleteSetupSelected}
                      className="font-mono text-[10px] text-danger hover:text-white uppercase border border-red-800/50 px-1.5 py-0.5 flex-shrink-0">
                      ×
                    </button>
                  </div>
                  {sel.length === 1 && (
                    <p className="font-mono text-[10px] text-grey-light uppercase pt-1 border-t border-grey-mid">
                      SECTION: {sectionName ?? 'NONE'}
                      {first.tableGroupId && <span className="text-accent ml-1">· GROUPED</span>}
                    </p>
                  )}
                </div>

                {/* ── ROTATION ── */}
                {sel.length === 1 && (
                  <div className="border border-grey-mid p-3 space-y-2">
                    <p className="font-mono text-[10px] text-grey-light uppercase tracking-wider">ROTATION</p>
                    <div className="flex flex-wrap gap-1">
                      {[0, 45, 90, 135, 180, 270].map((angle) => (
                        <button key={angle} onClick={() => rotateSetupSelected(angle)}
                          className={`font-mono text-[10px] px-2 py-1 border ${first && Math.round(first.rotation) === angle ? 'border-white text-white bg-grey-mid' : 'border-grey-mid text-grey-light hover:border-white'} transition-colors`}>
                          {angle}°
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── CHAIRS ── */}
                {sel.length === 1 && !first?.tableGroupId && (
                  <div className="border border-grey-mid p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="font-mono text-[10px] text-grey-light uppercase tracking-wider">CHAIRS ({totalChairs})</p>
                      <button onClick={() => handleSetupChairEdge(first.id, 'top', -edges.top)}
                        className="font-mono text-[9px] text-danger hover:text-white border border-red-800/50 px-1">CLEAR</button>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {(['top', 'bottom', 'left', 'right'] as const).map((edge) => (
                        <div key={edge} className="flex items-center justify-between border border-grey-mid p-1.5">
                          <span className="font-mono text-[10px] text-grey-light uppercase">{edge}</span>
                          <div className="flex items-center gap-0.5">
                            <button onClick={() => handleSetupChairEdge(first.id, edge, -1)}
                              className="font-mono text-[10px] text-grey-light hover:text-white px-1 py-0.5 border border-grey-mid hover:border-white">
                              −
                            </button>
                            <span className="font-mono text-[11px] text-white w-5 text-center">{edges[edge]}</span>
                            <button onClick={() => handleSetupChairEdge(first.id, edge, 1)}
                              className="font-mono text-[10px] text-grey-light hover:text-white px-1 py-0.5 border border-grey-mid hover:border-accent hover:text-accent">
                              +
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {sel.length >= 2 && (
                  <div className="border border-grey-mid p-3">
                    <p className="font-mono text-[10px] text-grey-light">Select GROUP from the toolbar to join these tables.</p>
                  </div>
                )}
              </>
            )
          })() : selectedIds.length > 0 && selected ? (
            <>
              {selectedIds.length > 1 && (
                <div className="border border-grey-mid p-3">
                  <p className="font-mono text-[10px] text-accent uppercase">{selectedIds.length} ELEMENTS SELECTED</p>
                  <button onClick={deleteSelected}
                    className="mt-2 font-mono text-[10px] text-danger hover:text-white uppercase border border-red-800/50 px-2 py-1 w-full">
                    DELETE {selectedIds.length}
                  </button>
                </div>
              )}
              {selectedIds.length === 1 && (
                <>
                  <div className="border border-grey-mid p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 flex-shrink-0 border border-grey-mid" style={{ backgroundColor: selected.fillColour ?? '#666' }} />
                      <div className="min-w-0 flex-1">
                        <input value={selected.type}
                          onChange={(e) => updateElement(selected.id!, { type: e.target.value.toUpperCase() || 'OTHER' })}
                          className="font-mono text-xs font-bold text-white bg-transparent border-0 p-0 outline-none w-full" />
                      </div>
                      <button onClick={deleteSelected}
                        className="font-mono text-[10px] text-danger hover:text-white uppercase border border-red-800/50 px-1.5 py-0.5 flex-shrink-0">
                        ×
                      </button>
                    </div>
                    {selected.sectionId && (
                      <p className="font-mono text-[10px] text-grey-light uppercase pt-1 border-t border-grey-mid">
                        {sectionMap.get(selected.sectionId)?.name ?? selected.sectionId}
                      </p>
                    )}
                  </div>
                  <div className="border border-grey-mid p-3 space-y-2">
                    <p className="font-mono text-[10px] text-grey-light uppercase tracking-wider">SIZE</p>
                    <FloorplanInspector selectedElement={selected} elements={elements}
                      onChange={(patch) => updateElement(selected.id!, patch)} />
                  </div>
                  <div className="border border-grey-mid p-3 space-y-2">
                    <p className="font-mono text-[10px] text-grey-light uppercase tracking-wider">LABEL & STYLE</p>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 flex-shrink-0 border border-grey-mid" style={{ backgroundColor: selected.fillColour ?? '#666' }} />
                      <Input label="Fill" value={selected.fillColour ?? ''}
                        onChange={(e) => updateElement(selected.id!, { fillColour: e.target.value || null })} placeholder="#555" />
                    </div>
                    <Input label="Label" value={selected.label ?? ''}
                      onChange={(e) => updateElement(selected.id!, { label: e.target.value.toUpperCase() || null })} />
                    <label className="flex items-center gap-2 font-mono text-[10px] text-grey-light cursor-pointer select-none">
                      <input type="checkbox" checked={selected.labelVisible !== false}
                        onChange={(e) => updateElement(selected.id!, { labelVisible: e.target.checked })}
                        className="accent-white" />
                      SHOW LABEL
                    </label>
                    {selected.shape === 'RECTANGLE' && (
                      <div>
                        <p className="font-mono text-[10px] text-grey-light uppercase mb-1">Corner Radius</p>
                        <div className="grid grid-cols-4 gap-1">
                          {['TL', 'TR', 'BR', 'BL'].map((label, idx) => {
                            const cr: number[] = ((selected.style as any)?.cornerRadius) ?? [0, 0, 0, 0]
                            return (
                              <Input key={label} label={label} type="number" min="0" max={Math.min(selected.width, selected.depth) / 2}
                                value={cr[idx]?.toString() ?? '0'}
                                onChange={(e) => {
                                  const next = [...cr]
                                  next[idx] = Math.min(parseInt(e.target.value) || 0, Math.min(selected.width, selected.depth) / 2)
                                  updateElement(selected.id!, { style: { ...(selected.style ?? {}), cornerRadius: next } })
                                }} />
                            )
                          })}
                        </div>
                      </div>
                    )}
                    <Input label="Opacity" type="number" min="0" max="1" step="0.1"
                      value={selected.opacity.toString()}
                      onChange={(e) => updateElement(selected.id!, { opacity: Math.min(1, Math.max(0, parseFloat(e.target.value) || 1)) })} />
                    <Input label="Label Scale" type="number" min="0.5" max="3" step="0.1" value={((selected.style as any)?.labelScale ?? 1).toString()}
                      onChange={(e) => updateElement(selected.id!, { style: { ...(selected.style ?? {}), labelScale: Math.max(0.5, Math.min(3, parseFloat(e.target.value) || 1)) } })} />
                  </div>
                  <div className="border border-grey-mid p-3 space-y-2">
                    <p className="font-mono text-[10px] text-grey-light uppercase tracking-wider">ROTATION</p>
                    <div className="flex flex-wrap gap-1">
                      {[0, 45, 90, 135, 180, 270].map((angle) => (
                        <button key={angle} onClick={() => updateElement(selected.id!, { rotation: angle })}
                          className={`font-mono text-[10px] px-2 py-1 border ${Math.round(selected.rotation ?? 0) === angle ? 'border-white text-white bg-grey-mid' : 'border-grey-mid text-grey-light hover:border-white'} transition-colors`}>
                          {angle}°
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="border border-grey-mid p-3 space-y-2">
                    <p className="font-mono text-[10px] text-grey-light uppercase tracking-wider">POSITION</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Input label="X (cm)" type="number" step="10" value={Math.round(selected.x).toString()}
                        onChange={(e) => updateElement(selected.id!, { x: parseFloat(e.target.value) || 0 })}
                        onBlur={() => { if (selected.id) updateElement(selected.id, { x: snap(selected.x, plan.gridUnit) }) }} />
                      <Input label="Y (cm)" type="number" step="10" value={Math.round(selected.y).toString()}
                        onChange={(e) => updateElement(selected.id!, { y: parseFloat(e.target.value) || 0 })}
                        onBlur={() => { if (selected.id) updateElement(selected.id, { y: snap(selected.y, plan.gridUnit) }) }} />
                    </div>
                  </div>
                  {INVENTORY_TYPES.includes(selected.type) && (
                    <div className="border border-grey-mid p-3">
                      <button onClick={() => setShowInvTab(!showInvTab)}
                        className="font-mono text-[10px] text-grey-light hover:text-white uppercase w-full text-left mb-2">
                        {showInvTab ? '▼ INVENTORY' : '▶ INVENTORY'}
                      </button>
                      {showInvTab && selected.id ? (
                        <ElementInventoryPanel elementId={selected.id} floorPlanId={plan.id} />
                      ) : showInvTab ? null : null}
                      <div className="space-y-2">
                        <Select label="Section" value={selected.sectionId ?? ''}
                          onChange={(e) => updateElement(selected.id!, { sectionId: e.target.value || null })}
                          options={sections.map((s) => ({ value: s.id, label: s.name }))} placeholder="NONE" />
                        <Input label="Capacity" type="number" value={selected.capacity?.toString() ?? ''}
                          onChange={(e) => updateElement(selected.id!, { capacity: e.target.value ? parseInt(e.target.value) : null })} />
                      </div>
                    </div>
                  )}
                  {selected.type === 'TABLE' && (
                    <div className="border border-grey-mid p-3 space-y-2">
                      <p className="font-mono text-[10px] text-grey-light uppercase tracking-wider">CHAIRS</p>
                      <Input label="Count" type="number" min="0" value={(selected.chairCount ?? 0).toString()}
                        onChange={(e) => updateElement(selected.id!, { chairCount: parseInt(e.target.value) || 0 })} />
                      <Select label="Style" value={((selected.style as any)?.chairStyle ?? 'bracket') as string}
                        onChange={(e) => updateElement(selected.id!, { style: { ...(selected.style ?? {}), chairStyle: e.target.value } })}
                        options={[{ value: 'round', label: 'ROUND' }, { value: 'bracket', label: 'BRACKET' }]} />
                      <p className="font-mono text-[10px] text-grey-light uppercase">On Sides</p>
                      <div className="grid grid-cols-2 gap-1">
                        {['top', 'bottom', 'left', 'right'].map((side) => {
                          const sides: string[] = ((selected.style as any)?.chairSides) ?? ['top', 'bottom', 'left', 'right']
                          const checked = sides.includes(side)
                          return (
                            <label key={side} className="flex items-center gap-1 font-mono text-[10px] text-grey-light cursor-pointer select-none">
                              <input type="checkbox" checked={checked}
                                onChange={() => {
                                  const next = checked ? sides.filter((s) => s !== side) : [...sides, side]
                                  updateElement(selected.id!, { style: { ...(selected.style ?? {}), chairSides: next.length > 0 ? next : ['top'] } })
                                }}
                                className="accent-white" />
                              {side.toUpperCase()}
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  {selected.type === 'BOOTH_BENCH' && (
                    <div className="border border-grey-mid p-3 space-y-2">
                      <p className="font-mono text-[10px] text-grey-light uppercase tracking-wider">SERVES TABLES</p>
                      {elements.filter((e) => e.type === 'TABLE').map((t) => {
                        const served: string[] = (selected.style as any)?.servedTableIds ?? []
                        const checked = served.includes(t.id!)
                        return (
                          <label key={t.id} className="flex items-center gap-2 font-mono text-[10px] text-grey-light cursor-pointer select-none py-0.5">
                            <input type="checkbox" checked={checked}
                              onChange={() => {
                                const s: string[] = [...served]
                                if (checked) { const idx = s.indexOf(t.id!); if (idx >= 0) s.splice(idx, 1) }
                                else { s.push(t.id!) }
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
                  {selected.style !== undefined && (
                    <button onClick={() => updateElement(selected.id!, { style: null })}
                      className="font-mono text-[10px] text-grey-light hover:text-white uppercase border border-grey-mid px-2 py-1 w-full">
                      RESET STYLE
                    </button>
                  )}
                </>
              )}
            </>
          ) : showSummary ? (
            <>
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
            </>
          ) : zoneDrawing ? (
            <>
              <h2 className="font-mono text-xs font-bold text-white uppercase tracking-wider">SECTION ZONES</h2>
              <p className="font-mono text-[10px] text-grey-light">Drag on canvas to draw or move zones.</p>
              <Select label="Section" value={zoneSectionId}
                onChange={(e) => setZoneSectionId(e.target.value)}
                options={sections.map((s) => ({ value: s.id, label: s.name }))} />
              <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
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
              {selectedZoneId && (() => {
                const z = zones.find((x) => x.id === selectedZoneId)
                if (!z) return null
                return (
                  <div className="border-t border-grey-mid pt-2 space-y-2">
                    <Input label="X (cm)" type="number" step="10" value={Math.round(z.x).toString()}
                      onChange={(e) => setZones((prev) => prev.map((x) => x.id === z.id ? { ...x, x: parseFloat(e.target.value) || 0 } : x))}
                      onBlur={() => setZones((prev) => prev.map((x) => x.id === z.id ? { ...x, x: snap(x.x, plan.gridUnit) } : x))} />
                    <Input label="Y (cm)" type="number" step="10" value={Math.round(z.y).toString()}
                      onChange={(e) => setZones((prev) => prev.map((x) => x.id === z.id ? { ...x, y: parseFloat(e.target.value) || 0 } : x))}
                      onBlur={() => setZones((prev) => prev.map((x) => x.id === z.id ? { ...x, y: snap(x.y, plan.gridUnit) } : x))} />
                    <div className="grid grid-cols-2 gap-2">
                    <Input label="W" type="number" step="10" value={Math.round(z.width).toString()}
                      onChange={(e) => setZones((prev) => prev.map((x) => x.id === z.id ? { ...x, width: Math.max(parseFloat(e.target.value) || plan.gridUnit, plan.gridUnit) } : x))}
                      onBlur={() => setZones((prev) => prev.map((x) => x.id === z.id ? { ...x, width: Math.max(snap(x.width, plan.gridUnit), plan.gridUnit) } : x))} />
                    <Input label="H" type="number" step="10" value={Math.round(z.height).toString()}
                      onChange={(e) => setZones((prev) => prev.map((x) => x.id === z.id ? { ...x, height: Math.max(parseFloat(e.target.value) || plan.gridUnit, plan.gridUnit) } : x))}
                      onBlur={() => setZones((prev) => prev.map((x) => x.id === z.id ? { ...x, height: Math.max(snap(x.height, plan.gridUnit), plan.gridUnit) } : x))} />
                    </div>
                    <Input label="Label Scale" type="number" min="0.5" max="3" step="0.1" value={((z as any).labelScale ?? 1).toString()}
                      onChange={(e) => setZones((prev) => prev.map((x) => x.id === z.id ? { ...x, labelScale: Math.max(0.5, Math.min(3, parseFloat(e.target.value) || 1)) } : x))} />
                    <Select label="Section" value={z.sectionId}
                      onChange={(e) => setZones((prev) => prev.map((x) => x.id === z.id ? { ...x, sectionId: e.target.value } : x))}
                      options={sections.map((s) => ({ value: s.id, label: s.name }))} />
                    <button onClick={() => {
                      setZones((prev) => prev.filter((x) => x.id !== selectedZoneId))
                      setSelectedZoneId(null)
                    }}
                      className="font-mono text-[10px] text-danger hover:text-white uppercase border border-danger px-2 py-1 w-full">
                      DELETE ZONE
                    </button>
                  </div>
                )
              })()}
            </>
          ) : (
            // Layer list (default when nothing selected)
            <>
              <h2 className="font-mono text-xs font-bold text-white uppercase tracking-wider">LAYERS</h2>
              {elements.length === 0 && (
                <p className="font-mono text-[10px] text-grey-light">No elements on this plan.</p>
              )}
              {(() => {
                const grouped: Record<string, ElementData[]> = {}
                for (const el of elements) {
                  if (!grouped[el.type]) grouped[el.type] = []
                  grouped[el.type].push(el)
                }
                return Object.entries(grouped).map(([type, els]) => (
                  <div key={type}>
                    <p className="font-mono text-[10px] text-grey-light uppercase tracking-wider border-b border-grey-mid pb-0.5 mb-0.5">{type} ({els.length})</p>
                    {els.map((el) => (
                      <div key={el.id} onClick={() => setSelectedIds([el.id!])}
                        className="flex items-center gap-2 py-0.5 cursor-pointer hover:bg-grey-mid px-1 rounded-sm">
                        <div className="w-2.5 h-2.5 flex-shrink-0 border border-grey-light" style={{ backgroundColor: el.fillColour ?? '#666' }} />
                        <span className="font-mono text-[10px] text-white truncate flex-1">{el.label || el.type}</span>
                        <span className="font-mono text-[8px] text-grey-light">{Math.round(el.width)}×{Math.round(el.depth)}</span>
                      </div>
                    ))}
                  </div>
                ))
              })()}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
