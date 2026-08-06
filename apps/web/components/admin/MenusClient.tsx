'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { pushToast } from '@/components/ui/Toast'
import { describePaxRange } from '@/lib/menu-rules'

interface MenuItemRef {
  id: string
  name: string
  price: number
  dietaryInfo: string | null
  isActive: boolean
  wooCategoryId: string | null
  imageUrl: string | null
}

interface MenuLink {
  id: string
  menuItemId: string
  minQty: number | null
  maxQty: number | null
  sortOrder: number
  menuItem: MenuItemRef
}

interface Menu {
  id: string
  name: string
  description: string | null
  minPax: number | null
  maxPax: number | null
  isActive: boolean
  items: MenuLink[]
}

/** Local editing shape — quantities stay strings so a cleared box isn't 0. */
interface DraftLine {
  menuItemId: string
  name: string
  minQty: string
  maxQty: string
}

export function MenusClient() {
  const [menus, setMenus] = useState<Menu[]>([])
  const [allItems, setAllItems] = useState<MenuItemRef[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [minPax, setMinPax] = useState('')
  const [maxPax, setMaxPax] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [lines, setLines] = useState<DraftLine[]>([])
  const [itemSearch, setItemSearch] = useState('')
  const [tab, setTab] = useState<'menus' | 'categories'>('menus')
  const [wooCategories, setWooCategories] = useState<{ id: string; name: string }[]>([])
  const [categorySearch, setCategorySearch] = useState('')

  async function load() {
    setLoading(true)
    const [mRes, iRes, cRes] = await Promise.all([
      fetch('/api/admin/menus'),
      fetch('/api/admin/menu-items'),
      fetch('/api/admin/woocommerce/categories'),
    ])
    if (mRes.ok) setMenus(await mRes.json())
    if (iRes.ok) setAllItems(await iRes.json())
    if (cRes.ok) {
      const data = await cRes.json()
      setWooCategories((data.categories ?? []).map((c: { id: number; name: string }) => ({ id: String(c.id), name: c.name })))
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openMenu(m: Menu) {
    setSelectedId(m.id)
    setName(m.name)
    setDescription(m.description ?? '')
    setMinPax(m.minPax?.toString() ?? '')
    setMaxPax(m.maxPax?.toString() ?? '')
    setIsActive(m.isActive)
    setLines(
      m.items.map((l) => ({
        menuItemId: l.menuItemId,
        name: l.menuItem.name,
        minQty: l.minQty?.toString() ?? '',
        maxQty: l.maxQty?.toString() ?? '',
      })),
    )
  }

  function newMenu() {
    setSelectedId('new')
    setName(''); setDescription(''); setMinPax(''); setMaxPax('')
    setIsActive(true); setLines([]); setItemSearch('')
  }

  function closeEditor() {
    setSelectedId(null)
    setItemSearch('')
  }

  function addLine(item: MenuItemRef) {
    if (lines.some((l) => l.menuItemId === item.id)) return
    setLines([...lines, { menuItemId: item.id, name: item.name, minQty: '', maxQty: '' }])
    setItemSearch('')
  }

  function updateLine(menuItemId: string, patch: Partial<DraftLine>) {
    setLines(lines.map((l) => (l.menuItemId === menuItemId ? { ...l, ...patch } : l)))
  }

  async function save() {
    const trimmed = name.toUpperCase().trim()
    if (!trimmed) { pushToast('MENU NAME IS REQUIRED', 'error'); return }

    const min = minPax === '' ? null : parseInt(minPax, 10)
    const max = maxPax === '' ? null : parseInt(maxPax, 10)
    if (min != null && max != null && min > max) {
      pushToast('MIN PAX CANNOT EXCEED MAX PAX', 'error')
      return
    }

    setSaving(true)
    const payload = {
      name: trimmed,
      description: description || null,
      minPax: min,
      maxPax: max,
      isActive,
      items: lines.map((l, i) => ({
        menuItemId: l.menuItemId,
        minQty: l.minQty === '' ? null : parseInt(l.minQty, 10),
        maxQty: l.maxQty === '' ? null : parseInt(l.maxQty, 10),
        sortOrder: i,
      })),
    }

    let res: Response
    if (selectedId === 'new') {
      res = await fetch('/api/admin/menus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      // Creation does not accept items — save the menu, then attach them.
      if (res.ok) {
        const created = await res.json()
        res = await fetch(`/api/admin/menus/${created.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }
    } else {
      res = await fetch(`/api/admin/menus/${selectedId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    }
    setSaving(false)

    if (res.ok) {
      pushToast('MENU SAVED', 'success')
      closeEditor()
      load()
    } else {
      const err = await res.json().catch(() => ({}))
      pushToast((err.error ?? 'SAVE FAILED').toUpperCase(), 'error')
    }
  }

  async function remove(id: string) {
    if (!confirm('DELETE THIS MENU?')) return
    const res = await fetch(`/api/admin/menus/${id}`, { method: 'DELETE' })
    if (res.ok) { pushToast('MENU DELETED', 'success'); closeEditor(); load() }
    else pushToast('DELETE FAILED', 'error')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      </div>
    )
  }

  const available = allItems
    .filter((i) => !lines.some((l) => l.menuItemId === i.id))
    .filter((i) => !itemSearch || i.name.toLowerCase().includes(itemSearch.toLowerCase()))
    .slice(0, 8)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">MENUS</h1>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-grey-light">{menus.length} MENUS</span>
          {tab === 'menus' && (
            <Button size="sm" variant="ghost" onClick={newMenu}>+ NEW MENU</Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setTab('menus')}
          className={`font-mono text-xs uppercase px-3 py-1.5 border ${
            tab === 'menus' ? 'border-white text-white' : 'border-grey-mid text-grey-light hover:text-white'
          }`}
        >
          ORDERING RULES
        </button>
        <button
          onClick={() => setTab('categories')}
          className={`font-mono text-xs uppercase px-3 py-1.5 border ${
            tab === 'categories' ? 'border-white text-white' : 'border-grey-mid text-grey-light hover:text-white'
          }`}
        >
          WOO CATEGORIES ({allItems.length} ITEMS)
        </button>
      </div>

      {tab === 'categories' ? (
        <CategoryMenuView
          items={allItems}
          categories={wooCategories}
          search={categorySearch}
          onSearch={setCategorySearch}
        />
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* List */}
        <div className="space-y-2">
          {menus.length === 0 ? (
            <div className="border border-grey-mid p-8 text-center">
              <p className="font-mono text-xs text-grey-light uppercase">NO MENUS YET</p>
              <p className="font-mono text-[10px] text-grey-light mt-1">
                CREATE ONE FOR EACH SERVICE — E.G. FRIDAY NIGHT BISTRO, EVENT CATERING
              </p>
            </div>
          ) : (
            menus.map((m) => {
              const range = describePaxRange(m)
              return (
                <button
                  key={m.id}
                  onClick={() => openMenu(m)}
                  className={`w-full text-left border p-3 hover:bg-grey-mid/10 ${
                    selectedId === m.id ? 'border-white' : 'border-grey-mid'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-white uppercase truncate">{m.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      {range && (
                        <span className="font-mono text-[9px] text-grey-light border border-grey-mid px-1">
                          {range}
                        </span>
                      )}
                      <span
                        className={`font-mono text-[9px] uppercase border px-1 ${
                          m.isActive ? 'text-success border-success' : 'text-grey-light border-grey-mid'
                        }`}
                      >
                        {m.isActive ? 'ACTIVE' : 'OFF'}
                      </span>
                    </div>
                  </div>
                  <p className="font-mono text-[10px] text-grey-light mt-1">
                    {m.items.length} ITEM{m.items.length === 1 ? '' : 'S'}
                    {m.description ? ` · ${m.description}` : ''}
                  </p>
                </button>
              )
            })
          )}
        </div>

        {/* Editor */}
        {selectedId && (
          <div className="border border-grey-mid p-4 space-y-4 lg:sticky lg:top-6 lg:self-start">
            <div className="flex items-center justify-between">
              <h2 className="font-mono text-xs uppercase text-grey-light tracking-wider">
                {selectedId === 'new' ? 'NEW MENU' : 'EDIT MENU'}
              </h2>
              <button
                onClick={closeEditor}
                className="font-mono text-xs text-grey-light hover:text-white"
              >
                ✕
              </button>
            </div>

            <Input label="NAME" value={name} onChange={(e) => setName(e.target.value)} placeholder="FRIDAY NIGHT BISTRO" />
            <Input label="DESCRIPTION" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="OPTIONAL" />

            <div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="MIN PAX" type="number" value={minPax} onChange={(e) => setMinPax(e.target.value)} placeholder="ANY" />
                <Input label="MAX PAX" type="number" value={maxPax} onChange={(e) => setMaxPax(e.target.value)} placeholder="ANY" />
              </div>
              <p className="font-mono text-[9px] text-grey-light mt-1">
                HEADCOUNT RANGE THIS MENU IS OFFERED FOR. LEAVE BLANK FOR NO LIMIT.
              </p>
            </div>

            <button
              onClick={() => setIsActive(!isActive)}
              className={`font-mono text-xs uppercase px-3 py-1.5 border ${
                isActive ? 'border-success text-success' : 'border-grey-mid text-grey-light'
              }`}
            >
              {isActive ? 'ACTIVE' : 'INACTIVE'}
            </button>

            {/* Items */}
            <div className="border-t border-grey-mid pt-3 space-y-2">
              <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">
                ITEMS ({lines.length})
              </h3>
              <p className="font-mono text-[9px] text-grey-light">
                MIN/MAX APPLY ONLY WHEN THE ITEM IS ORDERED — A MINIMUM DOES NOT FORCE IT ONTO EVERY ORDER.
              </p>

              {lines.length > 0 && (
                <div className="space-y-1">
                  <div className="grid grid-cols-12 gap-2 font-mono text-[9px] uppercase text-grey-light">
                    <div className="col-span-6">ITEM</div>
                    <div className="col-span-2">MIN</div>
                    <div className="col-span-2">MAX</div>
                    <div className="col-span-2"></div>
                  </div>
                  {lines.map((l) => (
                    <div key={l.menuItemId} className="grid grid-cols-12 gap-2 items-center">
                      <span className="col-span-6 font-mono text-xs text-white uppercase truncate">{l.name}</span>
                      <input
                        type="number"
                        value={l.minQty}
                        onChange={(e) => updateLine(l.menuItemId, { minQty: e.target.value })}
                        placeholder="—"
                        className="col-span-2 bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1 outline-none focus:border-white text-right"
                      />
                      <input
                        type="number"
                        value={l.maxQty}
                        onChange={(e) => updateLine(l.menuItemId, { maxQty: e.target.value })}
                        placeholder="—"
                        className="col-span-2 bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1 outline-none focus:border-white text-right"
                      />
                      <button
                        onClick={() => setLines(lines.filter((x) => x.menuItemId !== l.menuItemId))}
                        className="col-span-2 font-mono text-xs text-danger hover:bg-danger hover:text-black border border-danger px-1"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <Input
                label="ADD ITEM"
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                placeholder="SEARCH MENU ITEMS..."
              />
              {itemSearch && (
                <div className="border border-grey-mid divide-y divide-grey-mid max-h-48 overflow-y-auto">
                  {available.length === 0 ? (
                    <p className="font-mono text-[10px] text-grey-light p-2 uppercase">NO MATCHES</p>
                  ) : (
                    available.map((i) => (
                      <button
                        key={i.id}
                        onClick={() => addLine(i)}
                        className="w-full text-left px-2 py-1.5 hover:bg-grey-mid/20 font-mono text-xs text-white uppercase flex justify-between gap-2"
                      >
                        <span className="truncate">{i.name}</span>
                        <span className="text-grey-light shrink-0">${i.price.toFixed(2)}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-grey-mid pt-3 flex items-center gap-2 flex-wrap">
              <Button size="sm" onClick={save} loading={saving}>SAVE MENU</Button>
              {selectedId !== 'new' && (
                <Button size="sm" variant="danger" onClick={() => remove(selectedId)}>DELETE</Button>
              )}
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  )
}

/**
 * Read-only view of the whole menu: every WooCommerce product grouped by its
 * Woo category. Built automatically from the synced menu items — nothing to
 * maintain here.
 */
function CategoryMenuView({
  items,
  categories,
  search,
  onSearch,
}: {
  items: MenuItemRef[]
  categories: { id: string; name: string }[]
  search: string
  onSearch: (v: string) => void
}) {
  const catName = (id: string | null) => {
    if (!id) return 'UNCATEGORISED'
    return categories.find((c) => c.id === id)?.name.toUpperCase() ?? `CATEGORY ${id}`
  }

  const filtered = items.filter(
    (i) => !search || i.name.toLowerCase().includes(search.toLowerCase()),
  )

  const groups = new Map<string, MenuItemRef[]>()
  for (const item of filtered) {
    const key = item.wooCategoryId ?? ''
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(item)
  }

  const ordered = [...groups.entries()].sort((a, b) => {
    const aName = catName(a[0] || null)
    const bName = catName(b[0] || null)
    if (aName === 'UNCATEGORISED') return 1
    if (bName === 'UNCATEGORISED') return -1
    return aName.localeCompare(bName)
  })

  return (
    <div className="space-y-4">
      <Input label="SEARCH ITEMS" value={search} onChange={(e) => onSearch(e.target.value)} placeholder="FIND A DISH..." />

      {ordered.length === 0 ? (
        <div className="border border-grey-mid p-8 text-center">
          <p className="font-mono text-xs text-grey-light uppercase">
            {filtered.length === 0 && items.length > 0 ? 'NO MATCHES' : 'NO ITEMS YET'}
          </p>
          <p className="font-mono text-[10px] text-grey-light mt-1">
            {items.length === 0 ? 'PULL PRODUCTS FROM WOOCOMMERCE — THE MENU BUILDS ITSELF FROM THE CATEGORIES.' : ''}
          </p>
        </div>
      ) : (
        ordered.map(([key, groupItems]) => (
          <div key={key || 'none'} className="border border-grey-mid">
            <div className="px-3 py-2 bg-grey-mid/20 border-b border-grey-mid flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-white uppercase tracking-wider">{catName(key || null)}</span>
              <span className="font-mono text-[10px] text-grey-light">{groupItems.length} ITEM{groupItems.length === 1 ? '' : 'S'}</span>
            </div>
            <div className="divide-y divide-grey-mid">
              {groupItems.map((i) => (
                <div key={i.id} className="flex items-center gap-3 px-3 py-2">
                  {i.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={i.imageUrl} alt="" className="w-8 h-8 object-cover border border-grey-mid shrink-0" />
                  ) : (
                    <div className="w-8 h-8 border border-grey-mid shrink-0 flex items-center justify-center font-mono text-[9px] text-grey-light">—</div>
                  )}
                  <span className="font-mono text-xs text-white uppercase truncate flex-1 min-w-0">{i.name}</span>
                  <span className="font-mono text-xs text-grey-light shrink-0">${i.price.toFixed(2)}</span>
                  <span
                    className={`font-mono text-[9px] uppercase border px-1 shrink-0 ${
                      i.isActive ? 'text-success border-success' : 'text-grey-light border-grey-mid'
                    }`}
                  >
                    {i.isActive ? 'ON' : 'OFF'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
