'use client'

// The menu builder — groups of items on the left, a live plain-text preview on
// the right. A line is a product (sizes read from MenuItem.variations, shared
// across menus) or a stock item (sizes carried on the line). See MENUS.md.
//
// The item list is a flat, drag-reorderable list grouped under headers: drag a
// row up/down to reorder, or onto a group header to re-file it. Each row shows
// its list prices and COGS against the ex-GST price; EDIT opens a focused popup.

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { pushToast } from '@/components/ui/Toast'
import { MenuPreview } from '@/components/admin/MenuPreview'
import { MenuLineEditor } from '@/components/admin/MenuLineEditor'
import { cleanSizes, variationSizes, formatSizePrice, type MenuShape, type ShapedMenuLine, type MenuLineDraft, type MenuGroupDraft } from '@/lib/menu-lines'
import { priceExGst, grossMarginPct, type CogsResult } from '@/lib/menu-cogs'

export interface MenuOptionProduct {
  id: string
  name: string
  price: number
  wooCategoryId: string | null
  imageUrl: string | null
  dietaryInfo: string | null
  isActive: boolean
  variations: unknown
}

export interface MenuOptionStock {
  id: string
  name: string
  unit: string
  category: { name: string; tab: string | null } | null
}

const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `k${Math.random().toString(36).slice(2)}`)

function toDraftLine(l: ShapedMenuLine, key: string): MenuLineDraft {
  return {
    key,
    id: l.id,
    kind: l.kind,
    menuItemId: l.menuItemId ?? undefined,
    inventoryItemId: l.inventoryItemId ?? undefined,
    groupKey: l.groupId,
    name: l.name,
    price: l.price,
    dietaryInfo: l.dietaryInfo ?? null,
    isActive: l.isActive,
    unit: l.unit,
    sizes: l.sizes,
    sizesDirty: false,
    minQty: l.minQty != null ? String(l.minQty) : '',
    maxQty: l.maxQty != null ? String(l.maxQty) : '',
  }
}

export function MenuBuilder({
  menu,
  venueId,
  venueName,
  products,
  inventory,
  wooCategories,
  onClose,
  onSaved,
  onOpenServes,
}: {
  menu: MenuShape | null
  venueId: string
  venueName?: string | null
  products: MenuOptionProduct[]
  inventory: MenuOptionStock[]
  wooCategories: { id: string; name: string }[]
  onClose: () => void
  onSaved: () => void
  onOpenServes: (line: { id: string; name: string }) => void
}) {
  const isNew = !menu
  const [name, setName] = useState(menu?.name ?? '')
  const [description, setDescription] = useState(menu?.description ?? '')
  const [paxEnabled, setPaxEnabled] = useState(!!menu && (menu.minPax != null || menu.maxPax != null))
  const [minPax, setMinPax] = useState(menu?.minPax?.toString() ?? '')
  const [maxPax, setMaxPax] = useState(menu?.maxPax?.toString() ?? '')
  const [isActive, setIsActive] = useState(menu?.isActive ?? true)
  const [categoryId, setCategoryId] = useState(menu?.wooCategoryId ?? '')

  const [groups, setGroups] = useState<MenuGroupDraft[]>(() => (menu?.groups ?? []).map((g) => ({ key: g.id, id: g.id, name: g.name })))
  const [lines, setLines] = useState<MenuLineDraft[]>(() => (menu?.items ?? []).map((l) => toDraftLine(l, uid())))

  const [search, setSearch] = useState('')
  const [addGroupKey, setAddGroupKey] = useState<string | null>(groups[0]?.key ?? null)
  const [saving, setSaving] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [cogs, setCogs] = useState<Record<string, CogsResult | null>>({})

  const groupOptions = [{ value: '', label: 'NO GROUP' }, ...groups.map((g) => ({ value: g.key, label: g.name || 'UNTITLED' }))]

  const results = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return { products: [] as MenuOptionProduct[], inventory: [] as MenuOptionStock[] }
    const addedProduct = new Set(lines.map((l) => l.menuItemId).filter(Boolean))
    const addedStock = new Set(lines.map((l) => l.inventoryItemId).filter(Boolean))
    return {
      products: products.filter((p) => !addedProduct.has(p.id) && p.name.toLowerCase().includes(q)).slice(0, 6),
      inventory: inventory.filter((i) => !addedStock.has(i.id) && i.name.toLowerCase().includes(q)).slice(0, 6),
    }
  }, [search, products, inventory, lines])

  // COGS is fetched lazily for the distinct products in the draft — only when
  // that set changes, not on every keystroke.
  const cogsKey = useMemo(
    () => [...new Set(lines.map((l) => l.menuItemId).filter((x): x is string => !!x))].sort().join(','),
    [lines],
  )
  useEffect(() => {
    const ids = cogsKey ? cogsKey.split(',') : []
    if (ids.length === 0) { setCogs({}); return }
    let alive = true
    fetch('/api/admin/menus/cogs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ menuItemIds: ids, ...(venueId ? { venueId } : {}) }),
    })
      .then((r) => (r.ok ? r.json() : { cogs: {} }))
      .then((d) => { if (alive) setCogs((d.cogs ?? {}) as Record<string, CogsResult | null>) })
      .catch(() => { /* COGS is best-effort */ })
    return () => { alive = false }
  }, [cogsKey, venueId])

  function addGroup() {
    setGroups((g) => [...g, { key: uid(), name: '' }])
  }
  function patchGroup(key: string, patch: Partial<MenuGroupDraft>) {
    setGroups((g) => g.map((x) => (x.key === key ? { ...x, ...patch } : x)))
  }
  function moveGroup(i: number, dir: -1 | 1) {
    setGroups((g) => {
      const next = [...g]
      const j = i + dir
      if (j < 0 || j >= next.length) return g
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }
  function removeGroup(key: string) {
    setGroups((g) => g.filter((x) => x.key !== key))
    setLines((l) => l.map((x) => (x.groupKey === key ? { ...x, groupKey: null } : x)))
  }

  function addProduct(p: MenuOptionProduct) {
    setLines((l) => [
      ...l,
      {
        key: uid(),
        kind: 'PRODUCT',
        menuItemId: p.id,
        groupKey: addGroupKey,
        name: p.name,
        price: p.price,
        dietaryInfo: p.dietaryInfo,
        isActive: p.isActive,
        unit: null,
        sizes: variationSizes(p.variations),
        sizesDirty: false,
        minQty: '',
        maxQty: '',
      },
    ])
    setSearch('')
  }

  function addStock(s: MenuOptionStock) {
    setLines((l) => [
      ...l,
      {
        key: uid(),
        kind: 'STOCK',
        inventoryItemId: s.id,
        groupKey: addGroupKey,
        name: s.name,
        price: null,
        dietaryInfo: null,
        isActive: true,
        unit: s.unit,
        sizes: [],
        sizesDirty: false,
        minQty: '',
        maxQty: '',
      },
    ])
    setSearch('')
  }

  function patchLine(key: string, patch: Partial<MenuLineDraft>) {
    setLines((l) => l.map((x) => (x.key === key ? { ...x, ...patch } : x)))
  }
  function removeLine(key: string) {
    setLines((l) => l.filter((x) => x.key !== key))
  }

  // Drop a line just before/after another — adopting the target's group.
  function dropOnLine(targetKey: string, before: boolean) {
    if (!dragKey || dragKey === targetKey) { setDragKey(null); return }
    setLines((prev) => {
      const from = prev.findIndex((l) => l.key === dragKey)
      const target = prev.find((l) => l.key === targetKey)
      if (from < 0 || !target) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      const movedLine: MenuLineDraft = { ...moved, groupKey: target.groupKey }
      let to = next.findIndex((l) => l.key === targetKey)
      if (!before) to += 1
      next.splice(to, 0, movedLine)
      return next
    })
    setDragKey(null)
  }

  // Drop onto a group header — re-file into that group (appended at the end).
  function dropOnGroup(groupKey: string | null) {
    if (!dragKey) return
    setLines((prev) => {
      const from = prev.findIndex((l) => l.key === dragKey)
      if (from < 0) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.push({ ...moved, groupKey })
      return next
    })
    setDragKey(null)
  }

  async function save() {
    const trimmed = name.toUpperCase().trim()
    if (!trimmed) {
      pushToast('MENU NAME IS REQUIRED', 'error')
      return
    }
    const min = paxEnabled && minPax !== '' ? parseInt(minPax, 10) : null
    const max = paxEnabled && maxPax !== '' ? parseInt(maxPax, 10) : null
    if (min != null && max != null && min > max) {
      pushToast('MIN PAX CANNOT EXCEED MAX PAX', 'error')
      return
    }

    setSaving(true)
    const groupsPayload = groups.map((g, i) => ({ id: g.id, _clientId: g.key, name: g.name.toUpperCase().trim(), sortOrder: i }))
    const itemsPayload = lines.map((l, i) => {
      const group = groups.find((g) => g.key === l.groupKey)
      return {
        id: l.id,
        menuItemId: l.menuItemId,
        inventoryItemId: l.inventoryItemId,
        groupId: group ? group.id ?? group.key : null,
        minQty: l.minQty === '' ? null : l.minQty,
        maxQty: l.maxQty === '' ? null : l.maxQty,
        sizeOptions: l.kind === 'STOCK' ? cleanSizes(l.sizes) : undefined,
        sortOrder: i,
      }
    })

    const payload = {
      name: trimmed,
      description: description || null,
      minPax: min,
      maxPax: max,
      isActive,
      wooCategoryId: categoryId || null,
      ...(venueId ? { venueId } : {}),
      groups: groupsPayload,
      items: itemsPayload,
    }

    let menuId = menu?.id
    let res: Response
    if (isNew) {
      res = await fetch('/api/admin/menus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const created = await res.json()
        menuId = created.id
        res = await fetch(`/api/admin/menus/${created.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }
    } else {
      res = await fetch(`/api/admin/menus/${menuId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    }

    if (!res.ok) {
      setSaving(false)
      const err = await res.json().catch(() => ({}))
      pushToast((err.error ?? 'SAVE FAILED').toUpperCase(), 'error')
      return
    }

    // Product sizes are shared on the product — push any edits made here.
    const dirtyProductLines = lines.filter((l) => l.kind === 'PRODUCT' && l.sizesDirty && l.menuItemId)
    for (const l of dirtyProductLines) {
      await fetch(`/api/admin/menu-items/${l.menuItemId}/sizes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sizes: cleanSizes(l.sizes) }),
      })
    }

    setSaving(false)
    pushToast('MENU SAVED', 'success')
    onSaved()
  }

  const previewLines = lines.map((l, i) => ({
    id: l.key,
    kind: l.kind,
    groupId: l.groupKey,
    name: l.name || 'UNTITLED',
    price: l.price,
    sizes: cleanSizes(l.sizes),
    isActive: l.isActive,
    minQty: l.minQty === '' ? null : parseInt(l.minQty, 10),
    maxQty: l.maxQty === '' ? null : parseInt(l.maxQty, 10),
    sortOrder: i,
    dietaryInfo: l.dietaryInfo,
    unit: l.unit,
  }))

  function priceText(l: MenuLineDraft): string {
    if (l.sizes.length > 0) return l.sizes.map((s) => `${s.label} $${formatSizePrice(s.price)}`).join('  ·  ')
    if (l.price != null) return `$${formatSizePrice(l.price)}`
    return l.unit ?? '—'
  }

  function cogsText(l: MenuLineDraft): string | null {
    if (l.kind !== 'PRODUCT' || !l.menuItemId) return null
    const c = cogs[l.menuItemId]
    if (!c) return null
    const basePrice = l.price ?? l.sizes[0]?.price ?? null
    const margin = basePrice != null ? grossMarginPct(c.cost, priceExGst(basePrice)) : null
    return `COGS ${c.partial ? '~' : ''}$${c.cost.toFixed(2)}${margin != null ? ` · M ${margin.toFixed(0)}%` : ''}`
  }

  const editingLine = editingKey ? lines.find((l) => l.key === editingKey) ?? null : null

  const renderLine = (l: MenuLineDraft) => {
    const cogsLabel = cogsText(l)
    return (
      <div
        key={l.key}
        draggable
        onDragStart={(e) => { setDragKey(l.key); e.dataTransfer.setData('text/plain', l.key); e.dataTransfer.effectAllowed = 'move' }}
        onDragEnd={() => setDragKey(null)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.stopPropagation()
          e.preventDefault()
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
          dropOnLine(l.key, e.clientY < rect.top + rect.height / 2)
        }}
        className={`flex items-center gap-2 border-b border-grey-mid pl-4 pr-1 py-2 cursor-grab active:cursor-grabbing ${dragKey === l.key ? 'opacity-40' : ''}`}
      >
        <span className="font-mono text-sm text-grey-light select-none" aria-hidden>⠿</span>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-sm uppercase text-white truncate">
            {l.name}
            {!l.isActive && <span className="text-grey-light"> · OFF</span>}
          </div>
          <div className="font-mono text-xs text-grey-light truncate">
            {priceText(l)}
            {cogsLabel && <span className="text-gold"> · {cogsLabel}</span>}
          </div>
        </div>
        <button onClick={() => setEditingKey(l.key)} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors shrink-0">EDIT</button>
        <button
          onClick={() => patchLine(l.key, { isActive: !l.isActive })}
          className={`font-mono text-xs uppercase shrink-0 ${l.isActive ? 'text-success' : 'text-grey-light hover:text-white'}`}
        >
          {l.isActive ? 'ON' : 'OFF'}
        </button>
        <button onClick={() => removeLine(l.key)} className="font-mono text-xs text-grey-light hover:text-danger shrink-0 px-1">✕</button>
      </div>
    )
  }

  const ungrouped = lines.filter((l) => !l.groupKey)

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_24rem] gap-4">
      <div className="space-y-4 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={onClose}
            className="font-mono text-xs uppercase border border-grey-mid px-2 py-1 text-grey-light hover:border-white hover:text-white transition-colors"
          >
            ← BACK TO MENUS
          </button>
          <Button size="sm" onClick={save} loading={saving}>SAVE MENU</Button>
        </div>

        {/* Menu details */}
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <Input label="MENU NAME" value={name} onChange={(e) => setName(e.target.value.toUpperCase())} placeholder="BEVERAGE MENU" />
            </div>
            <div>
              <label className="label">STATUS</label>
              <button
                onClick={() => setIsActive(!isActive)}
                className={`w-full font-mono text-xs uppercase px-3 py-2 border ${isActive ? 'border-success text-success' : 'border-grey-mid text-grey-light'}`}
              >
                {isActive ? 'ACTIVE' : 'INACTIVE'}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <Input label="DESCRIPTION" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="OPTIONAL" />
            </div>
            <Select
              label="WOO CATEGORY"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              options={[
                { value: '', label: 'LOCAL ONLY' },
                { value: '__new__', label: 'CREATE NEW (MENU NAME)' },
                ...wooCategories.map((c) => ({ value: c.id, label: c.name.toUpperCase() })),
              ]}
            />
          </div>
          <div className="flex items-end gap-3 flex-wrap">
            <button
              onClick={() => setPaxEnabled((v) => !v)}
              className={`font-mono text-xs uppercase px-3 py-2 border ${paxEnabled ? 'border-info text-info' : 'border-grey-mid text-grey-light hover:border-white hover:text-white'}`}
            >
              PAX RANGE: {paxEnabled ? 'ON' : 'OFF'}
            </button>
            {paxEnabled && (
              <>
                <div className="w-28"><Input label="MIN PAX" type="number" value={minPax} onChange={(e) => setMinPax(e.target.value)} placeholder="ANY" /></div>
                <div className="w-28"><Input label="MAX PAX" type="number" value={maxPax} onChange={(e) => setMaxPax(e.target.value)} placeholder="ANY" /></div>
              </>
            )}
          </div>
        </div>

        {/* Add item */}
        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Input
                label="ADD ITEM"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="SEARCH PRODUCTS OR STOCK ITEMS..."
              />
              {search && (
                <div className="absolute z-20 mt-1 w-full border border-grey-mid bg-grey-dark max-h-72 overflow-y-auto divide-y divide-grey-mid shadow-lg">
                  {results.products.length === 0 && results.inventory.length === 0 ? (
                    <p className="font-mono text-xs text-grey-light p-2 uppercase">NO MATCHES</p>
                  ) : (
                    <>
                      {results.products.length > 0 && (
                        <div>
                          <div className="px-2 py-1 font-mono text-2xs uppercase text-gold bg-grey-dark border-b border-grey-mid">PRODUCTS</div>
                          {results.products.map((p) => (
                            <button key={p.id} onClick={() => addProduct(p)} className="w-full text-left px-2 py-1.5 hover:bg-grey-mid/20 font-mono text-xs text-white uppercase flex justify-between gap-2">
                              <span className="truncate">{p.name}</span>
                              <span className="text-grey-light shrink-0">${p.price.toFixed(2)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {results.inventory.length > 0 && (
                        <div>
                          <div className="px-2 py-1 font-mono text-2xs uppercase text-info bg-grey-dark border-b border-grey-mid">STOCK ITEMS</div>
                          {results.inventory.map((i) => (
                            <button key={i.id} onClick={() => addStock(i)} className="w-full text-left px-2 py-1.5 hover:bg-grey-mid/20 font-mono text-xs text-white uppercase flex justify-between gap-2">
                              <span className="truncate">{i.name}</span>
                              <span className="text-grey-light shrink-0">{i.category?.name ?? i.unit}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="sm:w-48">
              <Select label="ADD TO GROUP" value={addGroupKey ?? ''} onChange={(e) => setAddGroupKey(e.target.value || null)} options={groupOptions} />
            </div>
          </div>
        </div>

        {/* Groups + items */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">ITEMS ({lines.length})</h3>
            <Button size="sm" variant="ghost" onClick={addGroup}>+ ADD GROUP</Button>
          </div>

          {lines.length === 0 && groups.length === 0 && (
            <p className="font-mono text-xs text-grey-light">NO ITEMS YET — SEARCH ABOVE TO ADD A PRODUCT OR STOCK ITEM.</p>
          )}

          {groups.map((g, i) => {
            const groupLines = lines.filter((l) => l.groupKey === g.key)
            return (
              <div
                key={g.key}
                className="pt-2"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); dropOnGroup(g.key) }}
              >
                <div className="flex items-center gap-2 border-b-2 border-gold/60 pb-1">
                  <span className="w-1.5 h-3 bg-gold shrink-0" />
                  <div className="flex-1 min-w-0">
                    <Input value={g.name} onChange={(e) => patchGroup(g.key, { name: e.target.value.toUpperCase() })} placeholder="GROUP NAME" />
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => moveGroup(i, -1)} className="font-mono text-xs border border-grey-mid px-1.5 py-1 text-grey-light hover:border-white hover:text-white">↑</button>
                    <button onClick={() => moveGroup(i, 1)} className="font-mono text-xs border border-grey-mid px-1.5 py-1 text-grey-light hover:border-white hover:text-white">↓</button>
                    <button onClick={() => removeGroup(g.key)} className="font-mono text-xs text-danger border border-danger px-1.5 py-1 hover:bg-danger hover:text-black">✕</button>
                  </div>
                </div>
                {groupLines.length === 0 ? (
                  <p className="font-mono text-xs text-grey-light pl-4 py-2">DRAG ITEMS HERE</p>
                ) : (
                  groupLines.map(renderLine)
                )}
              </div>
            )
          })}

          {ungrouped.length > 0 && (
            <div
              className="pt-2"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); dropOnGroup(null) }}
            >
              <div className="flex items-center gap-2 border-b border-grey-mid pb-1">
                <span className="w-1.5 h-3 bg-grey-mid shrink-0" />
                <span className="font-mono text-xs uppercase tracking-wider text-grey-light">UNGROUPED</span>
              </div>
              {ungrouped.map(renderLine)}
            </div>
          )}
        </div>
      </div>

      {/* Live preview */}
      <div className="xl:sticky xl:top-4 xl:self-start">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">LIVE PREVIEW</h3>
          <span className="font-mono text-2xs uppercase text-grey-light">PLAIN TEXT</span>
        </div>
        <div className="max-h-[80vh] overflow-y-auto">
          <MenuPreview menuName={name} venueName={venueName} groups={groups.map((g) => ({ id: g.id ?? g.key, name: g.name || 'UNTITLED', sortOrder: 0 }))} lines={previewLines} />
        </div>
      </div>

      {editingLine && (
        <MenuLineEditor
          line={editingLine}
          groupOptions={groupOptions}
          cogs={editingLine.menuItemId ? cogs[editingLine.menuItemId] ?? null : null}
          onPatch={patchLine}
          onOpenServes={onOpenServes}
          onClose={() => setEditingKey(null)}
        />
      )}
    </div>
  )
}
