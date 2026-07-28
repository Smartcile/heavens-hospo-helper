'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { SearchSelect } from '@/components/ui/SearchSelect'

interface MenuItem {
  id: string; name: string; recipeId: string; price: number
  wooProductId: string | null; wooCategoryId: string | null
  imageUrl: string | null; description: string | null; isActive: boolean
  recipe?: { id: string; name: string }
  sharedFromVenueName?: string
  sharedFromVenueId?: string
  sharedPriceOverride?: number | null
  menuItemVenueId?: string
}

interface RecipeBrief { id: string; name: string }

export function MenuItemsClient() {
  const [items, setItems] = useState<MenuItem[]>([])
  const [recipes, setRecipes] = useState<RecipeBrief[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const [formName, setFormName] = useState('')
  const [formRecipeId, setFormRecipeId] = useState('')
  const [formPrice, setFormPrice] = useState('0')
  const [formWooProductId, setFormWooProductId] = useState('')
  const [formWooCategoryId, setFormWooCategoryId] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formSharedPriceOverride, setFormSharedPriceOverride] = useState('')
  const [selectedIsShared, setSelectedIsShared] = useState(false)

  const [wooCategories, setWooCategories] = useState<{ value: string; label: string }[]>([])
  const [wooCategoriesLoaded, setWooCategoriesLoaded] = useState(false)

  function resetForm() {
    setFormName(''); setFormRecipeId(''); setFormPrice('0')
    setFormWooProductId(''); setFormWooCategoryId(''); setFormDescription('')
    setFormSharedPriceOverride(''); setSelectedIsShared(false)
  }

  function populateForm(m: MenuItem) {
    setFormName(m.name); setFormRecipeId(m.recipeId)
    setFormPrice(String(m.sharedPriceOverride ?? m.price))
    setFormWooProductId(m.wooProductId ?? ''); setFormWooCategoryId(m.wooCategoryId ?? '')
    setFormDescription(m.description ?? '')
    setFormSharedPriceOverride(m.sharedPriceOverride != null ? String(m.sharedPriceOverride) : '')
    setSelectedIsShared(!!m.sharedFromVenueId)
  }

  async function loadWooCategories() {
    if (wooCategoriesLoaded) return
    const res = await fetch('/api/admin/woocommerce/categories')
    if (res.ok) {
      const data = await res.json()
      const cats = data.categories ?? []
      setWooCategories(cats.map((c: { name: string }) => ({ value: c.name, label: c.name })))
    }
    setWooCategoriesLoaded(true)
  }

  async function load() {
    setLoading(true)
    const [mRes, rRes] = await Promise.all([
      fetch('/api/admin/menu-items'),
      fetch('/api/admin/recipes'),
    ])
    if (mRes.ok) setItems(await mRes.json())
    if (rRes.ok) {
      const prs = await rRes.json()
      setRecipes(Array.isArray(prs) ? prs.map((r: any) => ({ id: r.id, name: r.name })) : [])
    }
    setLoading(false)
  }

  useEffect(() => { load(); loadWooCategories() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedId && !isCreating) {
      const m = items.find((x) => x.id === selectedId)
      if (m) populateForm(m)
    }
  }, [selectedId])

  async function handleSave() {
    if (!formName.trim() || !formRecipeId) return

    // For shared items, just update the price override
    if (selectedIsShared && selectedId) {
      const shared = items.find((x) => x.id === selectedId)
      if (shared?.menuItemVenueId) {
        await fetch(`/api/admin/menu-item-venues/${shared.menuItemVenueId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priceOverride: formSharedPriceOverride ? parseFloat(formSharedPriceOverride) : null }),
        })
      }
      setSelectedId(null); resetForm(); load()
      return
    }

    const body = {
      name: formName.trim().toUpperCase(),
      recipeId: formRecipeId,
      price: parseFloat(formPrice) || 0,
      wooProductId: formWooProductId || null,
      wooCategoryId: formWooCategoryId || null,
      description: formDescription || null,
    }
    if (isCreating) {
      const r = await fetch('/api/admin/menu-items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) return
    } else if (selectedId) {
      const r = await fetch(`/api/admin/menu-items/${selectedId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) return
    }
    setSelectedId(null); setIsCreating(false); resetForm(); load()
  }

  async function handleDelete() {
    if (!selectedId) return
    if (!confirm('Delete this menu item?')) return
    await fetch(`/api/admin/menu-items/${selectedId}`, { method: 'DELETE' })
    setSelectedId(null); resetForm(); load()
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p></div>
  }

  return (
    <div className="space-y-4">
      <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">MENU ITEMS</h1>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-3">
          <div className="border border-grey-mid p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-mono text-xs font-bold text-white uppercase">ITEMS ({items.length})</h2>
              <Button size="sm" onClick={() => { setSelectedId(null); setIsCreating(true); resetForm() }}>+ ADD</Button>
            </div>
            <div className="space-y-0.5 max-h-[65vh] overflow-y-auto">
              {items.map((m) => (
                <button key={m.id} onClick={() => { setIsCreating(false); setSelectedId(m.id) }}
                  className={`w-full text-left px-2 py-1.5 font-mono text-xs uppercase border ${selectedId === m.id && !isCreating ? 'border-white text-white' : 'border-transparent text-grey-light hover:border-grey-mid hover:text-white'}`}>
                  <span className="block truncate">
                    {m.name}
                    {m.sharedFromVenueName && (
                      <span className="ml-1 font-mono text-[9px] text-[#60A5FA] normal-case">(SHARED FROM {m.sharedFromVenueName})</span>
                    )}
                  </span>
                  <span className="block text-[10px] text-grey-light normal-case">
                    ${(m.sharedPriceOverride ?? m.price).toFixed(2)} · {m.recipe?.name ?? 'NO RECIPE'}
                  </span>
                </button>
              ))}
              {items.length === 0 && <p className="font-mono text-xs text-grey-light px-2 py-1">No menu items yet.</p>}
            </div>
          </div>
        </div>

        <div className="lg:col-span-9">
          <div className="border border-grey-mid p-4 space-y-4">
            {(!selectedId && !isCreating) ? (
              <p className="font-mono text-xs text-grey-light uppercase">SELECT AN ITEM OR CLICK + ADD</p>
            ) : (
              <>
                <h2 className="font-mono text-xs uppercase text-grey-light tracking-wider">
                  {isCreating ? 'NEW MENU ITEM' : 'PROPERTIES'}
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="font-mono text-xs uppercase text-grey-light block mb-1">NAME</label>
                    <Input value={formName} onChange={(e) => setFormName(e.target.value.toUpperCase())} disabled={selectedIsShared} placeholder="MENU ITEM NAME" />
                  </div>
                  <div>
                    <label className="font-mono text-xs uppercase text-grey-light block mb-1">
                      {selectedIsShared ? 'SOURCE PRICE (READ ONLY)' : 'PRICE'}
                    </label>
                    <Input type="number" step="0.01" value={formPrice} onChange={(e) => setFormPrice(e.target.value)} disabled={selectedIsShared} />
                  </div>
                  {selectedIsShared && (
                    <div>
                      <label className="font-mono text-xs uppercase text-[#60A5FA] block mb-1">PRICE OVERRIDE</label>
                      <Input type="number" step="0.01" value={formSharedPriceOverride} onChange={(e) => setFormSharedPriceOverride(e.target.value)} placeholder="LEAVE BLANK FOR SOURCE PRICE" />
                    </div>
                  )}
                  <div className="md:col-span-2">
                    <label className="font-mono text-xs uppercase text-grey-light block mb-1">ATTACH RECIPE</label>
                    <Select value={formRecipeId} onChange={(e) => setFormRecipeId(e.target.value)} disabled={selectedIsShared}
                      options={recipes.map((r) => ({ value: r.id, label: r.name }))} placeholder="SELECT RECIPE" />
                  </div>
                </div>

                {!selectedIsShared && (
                  <div className="border-t border-grey-mid pt-3">
                    <p className="font-mono text-[10px] text-grey-light uppercase mb-3">WOOCOMMERCE SYNC</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="font-mono text-xs uppercase text-grey-light block mb-1">PRODUCT ID</label>
                        <Input value={formWooProductId} onChange={(e) => setFormWooProductId(e.target.value)} placeholder="AUTO-GENERATED" disabled={true} />
                      </div>
                      <div>
                        <label className="font-mono text-xs uppercase text-grey-light block mb-1">CATEGORY</label>
                        <SearchSelect
                          options={wooCategories}
                          value={formWooCategoryId}
                          onChange={(v) => setFormWooCategoryId(v)}
                          placeholder="SEARCH OR TYPE CATEGORY..."
                        />
                      </div>
                    </div>
                  </div>
                )}

                {!selectedIsShared && (
                  <div>
                    <label className="font-mono text-xs uppercase text-grey-light block mb-1">DESCRIPTION</label>
                    <Input value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="DESCRIPTION" />
                  </div>
                )}

                <div className="border-t border-grey-mid pt-3 flex items-center gap-2">
                  <Button onClick={handleSave} disabled={!formName.trim() || !formRecipeId}>{selectedIsShared ? 'SAVE OVERRIDE' : 'SAVE'}</Button>
                  {!isCreating && !selectedIsShared && <Button variant="danger" size="sm" onClick={handleDelete}>DELETE</Button>}
                  <Button variant="ghost" size="sm" onClick={() => { setSelectedId(null); setIsCreating(false); resetForm() }}>CANCEL</Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
