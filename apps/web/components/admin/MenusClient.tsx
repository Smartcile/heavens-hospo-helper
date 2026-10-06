'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { pushToast } from '@/components/ui/Toast'
import { describePaxRange } from '@/lib/menu-rules'
import { getActiveVenueId } from '@/lib/active-venue'
import { MenuItemServesEditor } from '@/components/admin/MenuItemServesEditor'
import { MenuBuilder, type MenuOptionProduct, type MenuOptionStock } from '@/components/admin/MenuBuilder'
import type { MenuShape } from '@/lib/menu-lines'

export function MenusClient({ role, sessionVenueId, defaultVenueId }: { role: string; sessionVenueId: string; defaultVenueId?: string | null }) {
  const venueId = getActiveVenueId(role, sessionVenueId, defaultVenueId)
  const [menus, setMenus] = useState<MenuShape[]>([])
  const [products, setProducts] = useState<MenuOptionProduct[]>([])
  const [inventory, setInventory] = useState<MenuOptionStock[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [tab, setTab] = useState<'menus' | 'categories'>('menus')
  const [wooCategories, setWooCategories] = useState<{ id: string; name: string }[]>([])
  const [categorySearch, setCategorySearch] = useState('')
  const [newCatName, setNewCatName] = useState('')
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [servesItem, setServesItem] = useState<{ id: string; name: string } | null>(null)

  async function load() {
    setLoading(true)
    const venueParam = venueId ? `?venueId=${venueId}` : ''
    const [mRes, oRes, cRes] = await Promise.all([
      fetch(`/api/admin/menus${venueParam}`),
      fetch(`/api/admin/menus/options${venueParam}`),
      fetch(`/api/admin/woocommerce/categories${venueParam}`),
    ])
    if (mRes.ok) setMenus(await mRes.json())
    if (oRes.ok) {
      const data = await oRes.json()
      setProducts(data.products ?? [])
      setInventory(data.inventory ?? [])
    }
    if (cRes.ok) {
      const data = await cRes.json()
      setWooCategories((data.categories ?? []).map((c: { id: number; name: string }) => ({ id: String(c.id), name: c.name })))
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  /** Link a WooCommerce category that has no menu yet: create the menu bound
   *  to that category and attach the category's products to it. */
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
        ...(venueId ? { venueId } : {}),
      }),
    })
    if (!createRes.ok) {
      setSaving(false)
      const err = await createRes.json().catch(() => ({}))
      pushToast((err.error ?? 'LINK FAILED').toUpperCase(), 'error')
      return
    }
    const created = await createRes.json()

    const itemIds = products
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

  /** Create (or match by name) a WooCommerce category on the store. */
  async function createCategory() {
    const trimmed = newCatName.trim().toUpperCase()
    if (!trimmed) return
    setCreatingCategory(true)
    const res = await fetch('/api/admin/woocommerce/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed, ...(venueId ? { venueId } : {}) }),
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

  async function removeMenu(id: string) {
    if (!confirm('DELETE THIS MENU?')) return
    const res = await fetch(`/api/admin/menus/${id}`, { method: 'DELETE' })
    if (res.ok) { pushToast('MENU DELETED', 'success'); setSelectedId(null); load() }
    else pushToast('DELETE FAILED', 'error')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 p-6">
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      </div>
    )
  }

  // WooCommerce categories that have no menu yet — by category id or by name.
  const linkedCatIds = new Set(menus.map((m) => m.wooCategoryId).filter((c): c is string => !!c))
  const linkedCatNames = new Set(menus.map((m) => m.name.toLowerCase()))
  const unlinkedCats = wooCategories.filter(
    (c) => !linkedCatIds.has(c.id) && !linkedCatNames.has(c.name.toLowerCase()),
  )
  const catItemCount = (catId: string) =>
    products.filter((i) => (i.wooCategoryId ?? '').split(',').map((s) => s.trim()).filter(Boolean).includes(catId)).length

  const editingMenu = selectedId && selectedId !== 'new' ? menus.find((m) => m.id === selectedId) ?? null : null

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">MENUS / CATEGORIES</h1>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-grey-light">{menus.length} MENUS</span>
          {tab === 'menus' && selectedId == null && (
            <Button size="sm" variant="ghost" onClick={() => setSelectedId('new')}>+ NEW MENU</Button>
          )}
        </div>
      </div>

      {selectedId == null && (
        <>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTab('menus')}
              className={`font-mono text-xs uppercase px-3 py-1.5 border ${tab === 'menus' ? 'border-white text-white' : 'border-grey-mid text-grey-light hover:text-white'}`}
            >
              MENUS
            </button>
            <button
              onClick={() => setTab('categories')}
              className={`font-mono text-xs uppercase px-3 py-1.5 border ${tab === 'categories' ? 'border-white text-white' : 'border-grey-mid text-grey-light hover:text-white'}`}
            >
              CATEGORIES ({products.length} ITEMS)
            </button>
          </div>
          <p className="font-mono text-xs text-grey-light -mt-2">
            EACH MENU IS A WOOCOMMERCE CATEGORY — CREATED ON THE STORE WHEN SAVED. ADDING AN ITEM SETS ITS CATEGORY; REMOVING ONE UNCATEGORISES IT.
          </p>

          {tab === 'categories' ? (
            <CategoryMenuView items={products} categories={wooCategories} menus={menus} search={categorySearch} onSearch={setCategorySearch} />
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                {menus.length === 0 ? (
                  <div className="border border-grey-mid p-8 text-center">
                    <p className="font-mono text-xs text-grey-light uppercase">NO MENUS YET</p>
                    <p className="font-mono text-xs text-grey-light mt-1">
                      CREATE ONE FOR EACH SERVICE — OR LINK AN EXISTING STORE CATEGORY BELOW
                    </p>
                  </div>
                ) : (
                  menus.map((m) => {
                    const range = describePaxRange(m)
                    return (
                      <button
                        key={m.id}
                        onClick={() => setSelectedId(m.id)}
                        className="w-full text-left border border-grey-mid p-3 hover:bg-grey-mid/10"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs text-white uppercase truncate">{m.name}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            {m.wooCategoryId && (
                              <span className="font-mono text-xs text-gold border border-gold px-1">
                                CAT: {wooCategories.find((c) => c.id === m.wooCategoryId)?.name ?? m.wooCategoryId}
                              </span>
                            )}
                            {range && <span className="font-mono text-xs text-grey-light border border-grey-mid px-1">{range}</span>}
                            <span className={`font-mono text-xs uppercase border px-1 ${m.isActive ? 'text-success border-success' : 'text-grey-light border-grey-mid'}`}>
                              {m.isActive ? 'ACTIVE' : 'OFF'}
                            </span>
                          </div>
                        </div>
                        <p className="font-mono text-xs text-grey-light mt-1">
                          {m.items.length} ITEM{m.items.length === 1 ? '' : 'S'}
                          {m.groups.length > 0 ? ` · ${m.groups.length} GROUP${m.groups.length === 1 ? '' : 'S'}` : ''}
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
                    <p className="font-mono text-xs text-grey-light mt-0.5">
                      THESE EXIST ON YOUR STORE BUT HAVE NO MENU YET — LINK TO CREATE A MENU AND ATTACH ITS ITEMS.
                    </p>
                  </div>
                  {unlinkedCats.map((c) => (
                    <div key={c.id} className="border border-grey-mid p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-mono text-xs text-white uppercase truncate">{c.name}</span>
                        <span className="font-mono text-xs text-grey-light ml-2">{catItemCount(c.id)} ITEM{catItemCount(c.id) === 1 ? '' : 'S'}</span>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => linkCategory(c)} loading={saving}>+ LINK</Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="border border-grey-mid p-3">
                <label className="label">CREATE WOO CATEGORY</label>
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
                <p className="font-mono text-xs text-grey-light mt-1">
                  CREATES THE CATEGORY ON WOOCOMMERCE (OR MATCHES ONE BY NAME). LINK IT AS A MENU ABOVE.
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {selectedId != null && (
        <MenuBuilder
          menu={editingMenu}
          venueId={venueId ?? ''}
          products={products}
          inventory={inventory}
          wooCategories={wooCategories}
          onClose={() => setSelectedId(null)}
          onSaved={() => { setSelectedId(null); load() }}
          onOpenServes={(line) => setServesItem(line)}
        />
      )}

      <Modal
        isOpen={!!servesItem}
        onClose={() => setServesItem(null)}
        title={servesItem ? `ITEM LINK — ${servesItem.name}` : 'ITEM LINK'}
        size="lg"
      >
        {servesItem && (
          <MenuItemServesEditor menuItemId={servesItem.id} menuItemName={servesItem.name} venueId={venueId ?? ''} />
        )}
      </Modal>
    </div>
  )
}

/**
 * Read-only view of the whole menu: every WooCommerce product grouped by its
 * Woo category. Built automatically from the synced products.
 */
function CategoryMenuView({
  items,
  categories,
  menus,
  search,
  onSearch,
}: {
  items: MenuOptionProduct[]
  categories: { id: string; name: string }[]
  menus: MenuShape[]
  search: string
  onSearch: (v: string) => void
}) {
  const catName = (id: string | null) => {
    if (!id) return 'UNCATEGORISED'
    return categories.find((c) => c.id === id)?.name.toUpperCase() ?? `CATEGORY ${id}`
  }

  const filtered = items.filter((i) => !search || i.name.toLowerCase().includes(search.toLowerCase()))

  const groups = new Map<string, MenuOptionProduct[]>()
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
          <p className="font-mono text-xs text-grey-light mt-1">
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
                    <span className="font-mono text-xs text-success border border-success px-1 shrink-0">
                      MENU{syncedMenu.isActive ? '' : ' (OFF)'}{menuRange ? ` · ${menuRange}` : ''}
                    </span>
                  )}
                </div>
                <span className="font-mono text-xs text-grey-light shrink-0">{groupItems.length} ITEM{groupItems.length === 1 ? '' : 'S'}</span>
              </div>
              <div className="divide-y divide-grey-mid">
                {groupItems.map((i) => (
                  <div key={i.id} className="flex items-center gap-3 px-3 py-2">
                    {i.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={i.imageUrl} alt="" className="w-8 h-8 object-cover border border-grey-mid shrink-0" />
                    ) : (
                      <div className="w-8 h-8 border border-grey-mid shrink-0 flex items-center justify-center font-mono text-xs text-grey-light">—</div>
                    )}
                    <span className="font-mono text-xs text-white uppercase truncate flex-1 min-w-0">{i.name}</span>
                    <span className="font-mono text-xs text-grey-light shrink-0">${i.price.toFixed(2)}</span>
                    <span className={`font-mono text-xs uppercase border px-1 shrink-0 ${i.isActive ? 'text-success border-success' : 'text-grey-light border-grey-mid'}`}>
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
