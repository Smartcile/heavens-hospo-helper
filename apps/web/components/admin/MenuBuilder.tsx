'use client'

// The menu builder — groups of items on the left, a live plain-text preview on
// the right. A line is a product (sizes read from MenuItem.variations, shared
// across menus) or a stock item (sizes carried on the line). See MENUS.md.

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { pushToast } from '@/components/ui/Toast'
import { MenuPreview } from '@/components/admin/MenuPreview'
import { cleanSizes, variationSizes, type MenuShape, type MenuSize, type ShapedMenuLine } from '@/lib/menu-lines'

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

interface GroupDraft {
  key: string
  id?: string
  name: string
}

interface LineDraft {
  key: string
  id?: string
  kind: 'PRODUCT' | 'STOCK'
  menuItemId?: string
  inventoryItemId?: string
  groupKey: string | null
  name: string
  price: number | null
  dietaryInfo: string | null
  isActive: boolean
  unit: string | null
  sizes: MenuSize[]
  sizesDirty: boolean
  minQty: string
  maxQty: string
}

const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `k${Math.random().toString(36).slice(2)}`)

function toDraftLine(l: ShapedMenuLine, key: string): LineDraft {
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
  const [minPax, setMinPax] = useState(menu?.minPax?.toString() ?? '')
  const [maxPax, setMaxPax] = useState(menu?.maxPax?.toString() ?? '')
  const [isActive, setIsActive] = useState(menu?.isActive ?? true)
  const [categoryId, setCategoryId] = useState(menu?.wooCategoryId ?? '')

  const [groups, setGroups] = useState<GroupDraft[]>(() => (menu?.groups ?? []).map((g) => ({ key: g.id, id: g.id, name: g.name })))
  const [lines, setLines] = useState<LineDraft[]>(() => (menu?.items ?? []).map((l) => toDraftLine(l, uid())))

  const [search, setSearch] = useState('')
  const [addGroupKey, setAddGroupKey] = useState<string | null>(groups[0]?.key ?? null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

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

  function addGroup() {
    setGroups((g) => [...g, { key: uid(), name: '' }])
  }
  function patchGroup(key: string, patch: Partial<GroupDraft>) {
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
    const sizes = variationSizes(p.variations)
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
        sizes,
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

  function patchLine(key: string, patch: Partial<LineDraft>) {
    setLines((l) => l.map((x) => (x.key === key ? { ...x, ...patch } : x)))
  }
  function moveLine(i: number, dir: -1 | 1) {
    setLines((l) => {
      const next = [...l]
      const j = i + dir
      if (j < 0 || j >= next.length) return l
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }
  function removeLine(key: string) {
    setLines((l) => l.filter((x) => x.key !== key))
  }
  function toggleExpanded(key: string) {
    setExpanded((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function setSize(lineKey: string, index: number, patch: Partial<MenuSize>) {
    setLines((l) =>
      l.map((x) => {
        if (x.key !== lineKey) return x
        const sizes = x.sizes.map((s, i) => (i === index ? { ...s, ...patch } : s))
        return { ...x, sizes, sizesDirty: true }
      }),
    )
  }
  function addSize(lineKey: string, preset?: string) {
    setLines((l) =>
      l.map((x) => (x.key === lineKey ? { ...x, sizes: [...x.sizes, { label: preset ?? '', price: 0 }], sizesDirty: true } : x)),
    )
  }
  function removeSize(lineKey: string, index: number) {
    setLines((l) =>
      l.map((x) => (x.key === lineKey ? { ...x, sizes: x.sizes.filter((_, i) => i !== index), sizesDirty: true } : x)),
    )
  }

  async function save() {
    const trimmed = name.toUpperCase().trim()
    if (!trimmed) {
      pushToast('MENU NAME IS REQUIRED', 'error')
      return
    }
    const min = minPax === '' ? null : parseInt(minPax, 10)
    const max = maxPax === '' ? null : parseInt(maxPax, 10)
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
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={save} loading={saving}>SAVE MENU</Button>
          </div>
        </div>

        <div className="border border-grey-mid p-4 space-y-3">
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
            <div className="md:col-span-2">
              <Input label="DESCRIPTION" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="OPTIONAL" />
            </div>
            <div>
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
            <div className="grid grid-cols-2 gap-3 md:col-span-1">
              <Input label="MIN PAX" type="number" value={minPax} onChange={(e) => setMinPax(e.target.value)} placeholder="ANY" />
              <Input label="MAX PAX" type="number" value={maxPax} onChange={(e) => setMaxPax(e.target.value)} placeholder="ANY" />
            </div>
          </div>
        </div>

        {/* Groups */}
        <div className="border border-grey-mid p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">GROUPS ({groups.length})</h3>
            <Button size="sm" variant="ghost" onClick={addGroup}>+ ADD GROUP</Button>
          </div>
          {groups.length === 0 && (
            <p className="font-mono text-xs text-grey-light">NO GROUPS — ITEMS APPEAR UNDER THE MENU. ADD GROUPS TO SECTION THE MENU (E.G. TAP BEER, PIZZA).</p>
          )}
          {groups.map((g, i) => (
            <div key={g.key} className="flex items-center gap-2">
              <span className="font-mono text-2xs text-grey-light w-5">{i + 1}</span>
              <Input value={g.name} onChange={(e) => patchGroup(g.key, { name: e.target.value.toUpperCase() })} placeholder="GROUP NAME" />
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => moveGroup(i, -1)} className="font-mono text-xs border border-grey-mid px-1.5 py-1 text-grey-light hover:border-white hover:text-white">↑</button>
                <button onClick={() => moveGroup(i, 1)} className="font-mono text-xs border border-grey-mid px-1.5 py-1 text-grey-light hover:border-white hover:text-white">↓</button>
                <button onClick={() => removeGroup(g.key)} className="font-mono text-xs text-danger border border-danger px-1.5 py-1 hover:bg-danger hover:text-black">✕</button>
              </div>
            </div>
          ))}
        </div>

        {/* Items */}
        <div className="border border-grey-mid p-4 space-y-3">
          <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">ITEMS ({lines.length})</h3>

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

          {lines.length === 0 ? (
            <p className="font-mono text-xs text-grey-light">NO ITEMS YET — SEARCH ABOVE TO ADD A PRODUCT OR STOCK ITEM.</p>
          ) : (
            <div className="space-y-2">
              {lines.map((l, i) => {
                const open = expanded.has(l.key)
                return (
                  <div key={l.key} className="border border-grey-mid">
                    <div className="flex items-center gap-2 p-2 flex-wrap">
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => moveLine(i, -1)} className="font-mono text-xs border border-grey-mid px-1.5 py-1 text-grey-light hover:border-white hover:text-white">↑</button>
                        <button onClick={() => moveLine(i, 1)} className="font-mono text-xs border border-grey-mid px-1.5 py-1 text-grey-light hover:border-white hover:text-white">↓</button>
                      </div>
                      <span className="font-mono text-2xs uppercase border border-grey-mid px-1 text-grey-light shrink-0">
                        {l.kind === 'PRODUCT' ? 'PRODUCT' : 'STOCK'}
                      </span>
                      <span className="font-mono text-xs text-white uppercase truncate flex-1 min-w-0">{l.name}</span>
                      <div className="w-40 shrink-0">
                        <Select
                          value={l.groupKey ?? ''}
                          onChange={(e) => patchLine(l.key, { groupKey: e.target.value || null })}
                          options={groupOptions}
                        />
                      </div>
                      <button
                        onClick={() => toggleExpanded(l.key)}
                        className={`font-mono text-2xs uppercase border px-1.5 py-1 shrink-0 ${l.sizes.length ? 'border-gold text-gold' : 'border-grey-mid text-grey-light hover:border-white hover:text-white'}`}
                      >
                        SIZES{l.sizes.length ? ` (${l.sizes.length})` : ''}
                      </button>
                      {l.kind === 'PRODUCT' && l.menuItemId && (
                        <button
                          onClick={() => onOpenServes({ id: l.menuItemId!, name: l.name })}
                          className="font-mono text-2xs uppercase border border-grey-mid px-1.5 py-1 text-grey-light hover:border-white hover:text-white shrink-0"
                          title="How this product consumes stock (the item link)"
                        >
                          ITEM LINK
                        </button>
                      )}
                      <button
                        onClick={() => patchLine(l.key, { isActive: !l.isActive })}
                        className={`font-mono text-2xs uppercase border px-1.5 py-1 shrink-0 ${l.isActive ? 'border-success text-success' : 'border-grey-mid text-grey-light'}`}
                      >
                        {l.isActive ? 'ON' : 'OFF'}
                      </button>
                      <button onClick={() => removeLine(l.key)} className="font-mono text-xs text-danger border border-danger px-1.5 py-1 hover:bg-danger hover:text-black shrink-0">✕</button>
                    </div>

                    {open && (
                      <div className="border-t border-grey-mid p-2 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-2xs uppercase text-grey-light">
                            {l.kind === 'PRODUCT' ? 'SIZE OPTIONS — SHARED ON THE PRODUCT' : 'SIZE OPTIONS'}
                          </span>
                          <div className="flex items-center gap-1">
                            {['150 ML', '500 ML', '750 ML'].map((p) => (
                              <button key={p} onClick={() => addSize(l.key, p)} className="font-mono text-2xs uppercase border border-grey-mid px-1 py-0.5 text-grey-light hover:border-white hover:text-white">{`+${p}`}</button>
                            ))}
                            <button onClick={() => addSize(l.key)} className="font-mono text-2xs uppercase border border-gold text-gold px-1 py-0.5 hover:bg-gold hover:text-black">+ NEW VOLUME</button>
                          </div>
                        </div>
                        {l.sizes.length === 0 ? (
                          <p className="font-mono text-2xs text-grey-light">NO SIZES — A SINGLE PRICE APPLIES{l.kind === 'STOCK' ? ' (SET UNDER ITEM LINK)' : ''}.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {l.sizes.map((s, si) => (
                              <div key={si} className="flex items-center gap-2">
                                <input
                                  value={s.label}
                                  onChange={(e) => setSize(l.key, si, { label: e.target.value.toUpperCase() })}
                                  placeholder="150 ML / LARGE"
                                  className="flex-1 bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1 outline-hidden focus:border-white placeholder:text-grey-light"
                                />
                                <span className="font-mono text-xs text-grey-light">$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={s.price || ''}
                                  onChange={(e) => setSize(l.key, si, { price: parseFloat(e.target.value) || 0 })}
                                  placeholder="0.00"
                                  className="w-24 bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1 outline-hidden focus:border-white placeholder:text-grey-light text-right"
                                />
                                <button onClick={() => removeSize(l.key, si)} className="font-mono text-xs text-grey-light hover:text-danger">✕</button>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <Input label="MIN" type="number" value={l.minQty} onChange={(e) => patchLine(l.key, { minQty: e.target.value })} placeholder="—" />
                          <Input label="MAX" type="number" value={l.maxQty} onChange={(e) => patchLine(l.key, { maxQty: e.target.value })} placeholder="—" />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
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
    </div>
  )
}
