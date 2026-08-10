'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
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
  wooCategoryId: string | null
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
  const [formCategoryId, setFormCategoryId] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([])
  const [itemSearch, setItemSearch] = useState('')
  const [tab, setTab] = useState<'menus' | 'categories'>('menus')
  const [wooCategories, setWooCategories] = useState<{ id: string; name: string }[]>([])
  const [categorySearch, setCategorySearch] = useState('')
  const [newCatName, setNewCatName] = useState('')
  const [creatingCategory, setCreatingCategory] = useState(false)

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
    setFormCategoryId(m.wooCategoryId ?? '')
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
    setIsActive(true); setFormCategoryId(''); setLines([]); setItemSearch('')
  }

  /** Link a WooCommerce category that has no menu yet: create the menu bound
   *  to that category and attach the category's items to it. */
  async function linkCategory(cat: { id: string; name: string }) {
    setSaving(true)
    const createRes = await fetch('/api/admin/menus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: cat.name.toUpperCase().trim(),
        description: null,
        minPax: null,
        maxPax: null,
        isActive: true,
        wooCategoryId: cat.id,
      }),
    })
    if (!createRes.ok) {
      setSaving(false)
      const err = await createRes.json().catch(() => ({}))
      pushToast((err.error ?? 'LINK FAILED').toUpperCase(), 'error')
      return
    }
    const created = await createRes.json()

    const itemIds = allItems
      .filter((i) => (i.wooCategoryId ?? '').split(',').map((s) => s.trim()).filter(Boolean).includes(cat.id))
      .map((i) => i.id)

    if (itemIds.length > 0) {
      const putRes = await fetch(`/api/admin/menus/${created.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: itemIds.map((menuItemId, i) => ({ menuItemId, minQty: null, maxQty: null, sortOrder: i })),
        }),
      })
      if (!putRes.ok) {
        setSaving(false)
        pushToast('MENU CREATED — ITEMS FAILED TO ATTACH', 'error')
        await load()
        return
      }
    }
    setSaving(false)
    pushToast(`LINKED "${cat.name.toUpperCase()}" — ${itemIds.length} ITEMS`, 'success')
    await load()
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
      wooCategoryId: formCategoryId || null,
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

  /** Create (or match by name) a WooCommerce category on the store. It then
   *  appears under UNLINKED WOO CATEGORIES where it can be linked as a menu. */
  async function createCategory() {
    const trimmed = newCatName.trim().toUpperCase()
    if (!trimmed) return
    setCreatingCategory(true)
    const res = await fetch('/api/admin/woocommerce/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    })
    setCreatingCategory(false)
    if (res.ok) {
      const data = await res.json()
      setNewCatName('')
      pushToast(`CATEGORY "${data.name}" CREATED`, 'success')
      await load()
    } else {
      const err = await res.json().catch(() => ({}))
      pushToast((err.error ?? 'CATEGORY CREATE FAILED').toUpperCase(), 'error')
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
      <div className="flex items-center justify-center h-64 p-6">
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      </div>
    )
  }

  const available = allItems
    .filter((i) => !lines.some((l) => l.menuItemId === i.id))
    .filter((i) => !itemSearch || i.name.toLowerCase().includes(itemSearch.toLowerCase()))
    .slice(0, 8)

  // WooCommerce categories that have no menu yet — by category id or by name
  // (a menu created before the sync feature may carry no id but the name).
  const linkedCatIds = new Set(menus.map((m) => m.wooCategoryId).filter((c): c is string => !!c))
  const linkedCatNames = new Set(menus.map((m) => m.name.toLowerCase()))
  const unlinkedCats = wooCategories.filter(
    (c) => !linkedCatIds.has(c.id) && !linkedCatNames.has(c.name.toLowerCase()),
  )
  const catItemCount = (catId: string) =>
    allItems.filter((i) => (i.wooCategoryId ?? '').split(',').map((s) => s.trim()).filter(Boolean).includes(catId)).length

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">MENUS / CATEGORIES</h1>
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
          MENUS
        </button>
        <button
          onClick={() => setTab('categories')}
          className={`font-mono text-xs uppercase px-3 py-1.5 border ${
            tab === 'categories' ? 'border-white text-white' : 'border-grey-mid text-grey-light hover:text-white'
          }`}
        >
          CATEGORIES ({allItems.length} ITEMS)
        </button>
      </div>
      <p className="font-mono text-[10px] text-grey-light -mt-2">
        EACH MENU IS A WOOCOMMERCE CATEGORY — CREATED ON THE STORE WHEN SAVED. ADDING AN ITEM SETS ITS CATEGORY; REMOVING ONE UNCATEGORISES IT.
      </p>

      {tab === 'categories' ? (
        <CategoryMenuView
          items={allItems}
          categories={wooCategories}
          menus={menus}
          search={categorySearch}
          onSearch={setCategorySearch}
        />
      ) : (
      <div className="space-y-4">
        <div className="space-y-2">
          {menus.length === 0 ? (
            <div className="border border-grey-mid p-8 text-center">
              <p className="font-mono text-xs text-grey-light uppercase">NO MENUS YET</p>
              <p className="font-mono text-[10px] text-grey-light mt-1">
                CREATE ONE FOR EACH SERVICE — OR LINK AN EXISTING STORE CATEGORY BELOW
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
                    {m.wooCategoryId && (
                      <span className="font-mono text-[9px] text-[#c4a530] border border-[#c4a530] px-1">
                        CAT: {wooCategories.find((c) => c.id === m.wooCategoryId)?.name ?? m.wooCategoryId}
                      </span>
                    )}
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

        {unlinkedCats.length > 0 && (
          <div className="space-y-2">
            <div>
              <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">
                UNLINKED WOO CATEGORIES ({unlinkedCats.length})
              </h3>
              <p className="font-mono text-[9px] text-grey-light mt-0.5">
                THESE EXIST ON YOUR STORE BUT HAVE NO MENU YET — LINK TO CREATE A MENU AND ATTACH ITS ITEMS.
              </p>
            </div>
            {unlinkedCats.map((c) => (
              <div key={c.id} className="border border-grey-mid p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-mono text-xs text-white uppercase truncate">{c.name}</span>
                  <span className="font-mono text-[10px] text-grey-light ml-2">{catItemCount(c.id)} ITEM{catItemCount(c.id) === 1 ? '' : 'S'}</span>
                </div>
                <Button size="sm" variant="ghost" onClick={() => linkCategory(c)} loading={saving}>+ LINK</Button>
              </div>
            ))}
          </div>
        )}

        <div className="border border-grey-mid p-3">
          <label className="font-mono text-xs uppercase text-grey-light block mb-1">CREATE WOO CATEGORY</label>
          <div className="flex items-center gap-2">
            <Input
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value.toUpperCase())}
              placeholder="NEW CATEGORY NAME..."
              className="flex-1"
            />
            <Button size="sm" onClick={createCategory} loading={creatingCategory} disabled={!newCatName.trim()}>
              CREATE
            </Button>
          </div>
          <p className="font-mono text-[9px] text-grey-light mt-1">
            CREATES THE CATEGORY ON WOOCOMMERCE (OR MATCHES ONE BY NAME). LINK IT AS A MENU ABOVE.
          </p>
        </div>
      </div>
      )}

    <Modal
      isOpen={selectedId != null}
      onClose={closeEditor}
      title={selectedId === 'new' ? 'NEW MENU' : 'EDIT MENU'}
      size="lg"
    >
      <div className="space-y-4">
        <Input label="NAME" value={name} onChange={(e) => setName(e.target.value)} placeholder="FRIDAY NIGHT BISTRO" />
        <Input label="DESCRIPTION" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="OPTIONAL" />

        <div>
          <Select
            label="LINK TO WOO CATEGORY"
            value={formCategoryId}
            onChange={(e) => setFormCategoryId(e.target.value)}
            options={[
              { value: '', label: 'NO CATEGORY — LOCAL ONLY' },
              { value: '__new__', label: 'CREATE NEW CATEGORY (USES MENU NAME)' },
              ...wooCategories.map((c) => ({ value: c.id, label: c.name.toUpperCase() })),
            ]}
          />
          <p className="font-mono text-[9px] text-grey-light mt-1">
            LOCAL ONLY NEVER TOUCHES THE STORE. CREATE NEW CATEGORY MAKES A WOOCOMMERCE CATEGORY NAMED AFTER THIS MENU. MULTIPLE MENUS CAN LINK TO THE SAME CATEGORY.
          </p>
        </div>

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
          {selectedId && selectedId !== 'new' && (
            <Button size="sm" variant="danger" onClick={() => remove(selectedId)}>DELETE</Button>
          )}
        </div>
      </div>
    </Modal>
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
  menus,
  search,
  onSearch,
}: {
  items: MenuItemRef[]
  categories: { id: string; name: string }[]
  menus: Menu[]
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
        ordered.map(([key, groupItems]) => {
          const syncedMenu = key ? menus.find((m) => m.wooCategoryId === key) : undefined
          const menuRange = syncedMenu ? describePaxRange(syncedMenu) : null
          return (
            <div key={key || 'none'} className="border border-grey-mid">
              <div className="px-3 py-2 bg-grey-mid/20 border-b border-grey-mid flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-xs font-bold text-white uppercase tracking-wider truncate">{catName(key || null)}</span>
                  {syncedMenu && (
                    <span className="font-mono text-[9px] text-success border border-success px-1 shrink-0">
                      MENU{syncedMenu.isActive ? '' : ' (OFF)'}{menuRange ? ` · ${menuRange}` : ''}
                    </span>
                  )}
                </div>
                <span className="font-mono text-[10px] text-grey-light shrink-0">{groupItems.length} ITEM{groupItems.length === 1 ? '' : 'S'}</span>
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
          )
        })
      )}
    </div>
  )
}
