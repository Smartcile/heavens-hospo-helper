'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { SearchSelect } from '@/components/ui/SearchSelect'
import { ListBox, ListRow } from '@/components/ui/ListBox'
import { Modal } from '@/components/ui/Modal'
import { computeRecipeAllergens, type AllergenSource } from '@/lib/allergens'

interface Recipe {
  id: string; name: string; yieldQty: number; yieldUnitId: string; instructions: string | null
  prepTime: number | null; version: number; isActive: boolean
  yieldUnit?: { id: string; name: string }
  lineItems?: LineItem[]
  menuItem?: { id: string; price: number; wooProductId: string | null; wooCategoryId: string | null; imageUrl: string | null; shortDescription: string | null; isVariable: boolean; variations: { name: string; price: number }[] | null; dietaryInfo: string | null } | null
}

interface LineItem {
  id?: string; _clientId?: string
  qty: number; uomId: string
  inventoryItemId?: string | null; childRecipeId?: string | null
  inventoryItemName?: string; inventoryItemUnit?: string
  childRecipeName?: string
  allergyInfo?: string | null
}

interface Uom { id: string; name: string; baseUnit: string; conversionRatio: number }
interface InvItem { id: string; name: string; unit: string; allergyInfo?: string | null; category?: { id: string; name: string; tab: string | null } }
interface RecipeBrief { id: string; name: string }

interface OrphanMenuItem {
  id: string; name: string; price: number; wooProductId: string | null; wooCategoryId: string | null; imageUrl: string | null; shortDescription: string | null; isVariable: boolean; variations: { name: string; price: number }[] | null; dietaryInfo: string | null
}

  function generateId() { return crypto.randomUUID() }

export function RecipesClient() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [orphanItems, setOrphanItems] = useState<OrphanMenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [recipeSearch, setRecipeSearch] = useState('')

  const [formName, setFormName] = useState('')
  const [formYieldQty, setFormYieldQty] = useState('1')
  const [formYieldUnitId, setFormYieldUnitId] = useState('')
  const [formInstructions, setFormInstructions] = useState('')
  const [formPrepTime, setFormPrepTime] = useState('')

  // Menu item link
  const [linkToMenu, setLinkToMenu] = useState(false)
  const [formPrice, setFormPrice] = useState('0')
  const [formWooProductId, setFormWooProductId] = useState('')
  const [formWooCategories, setFormWooCategories] = useState<string[]>([])
  const [wooCatInput, setWooCatInput] = useState('')
  const [wooCatSuggestions, setWooCatSuggestions] = useState<string[]>([])
  const [wooCatShowDropdown, setWooCatShowDropdown] = useState(false)
  const [formExistingMenuItemId, setFormExistingMenuItemId] = useState<string | null>(null)
  const [formDietaryInfo, setFormDietaryInfo] = useState<string[]>([])
  const [allergenPopout, setAllergenPopout] = useState<{ allergen: string; source: string } | null>(null)

  // Image upload for linked Woo product
  const [formImageUrl, setFormImageUrl] = useState<string | null>(null)
  const [imageUploading, setImageUploading] = useState(false)
  const imageFileRef = useRef<HTMLInputElement | null>(null)
  const [formShortDescription, setFormShortDescription] = useState('')
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  // Add ingredient modal
  const [showAddIngredient, setShowAddIngredient] = useState(false)
  const [newIngredientName, setNewIngredientName] = useState('')
  const [newIngredientUomId, setNewIngredientUomId] = useState('')
  const [newIngredientCatId, setNewIngredientCatId] = useState('')
  const [addingIngredient, setAddingIngredient] = useState(false)

  // Variable product variations
  const [formIsVariable, setFormIsVariable] = useState(false)
  const [formVariations, setFormVariations] = useState<{ name: string; price: number }[]>([])

  const ALLERGENS = ['ALMOND','BARLEY','BRAZIL NUT','CASHEW','CRUSTACEAN','EGG','FISH','GLUTEN','HAZELNUT','LUPIN','MACADAMIA','MILK','MOLLUSC','OATS','PEANUT','PECAN','PINE NUT','PISTACHIO','RYE','SESAME','SOY','SULPHITES','WALNUT','WHEAT']
  const ALLERGEN_GROUPS: { label: string; items: string[] }[] = [
    { label: 'DAIRY', items: ['MILK'] },
    { label: 'EGGS', items: ['EGG'] },
    { label: 'NUTS & SEEDS', items: ['ALMOND','BRAZIL NUT','CASHEW','HAZELNUT','LUPIN','MACADAMIA','PEANUT','PECAN','PINE NUT','PISTACHIO','WALNUT'] },
    { label: 'GRAINS', items: ['BARLEY','GLUTEN','OATS','RYE','WHEAT'] },
    { label: 'SEAFOOD', items: ['CRUSTACEAN','FISH','MOLLUSC'] },
    { label: 'OTHER', items: ['SESAME','SOY','SULPHITES'] },
  ]

  const [uoms, setUoms] = useState<Uom[]>([])
  const [inventoryItems, setInventoryItems] = useState<InvItem[]>([])
  const [allRecipes, setAllRecipes] = useState<RecipeBrief[]>([])
  const [wooCategories, setWooCategories] = useState<{ id: string; name: string }[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string; tab: string | null }[]>([])

  const [lineItems, setLineItems] = useState<LineItem[]>([])
  const [newItemType, setNewItemType] = useState<'inventory' | 'recipe'>('inventory')
  const [newItemId, setNewItemId] = useState('')
  const [newItemQty, setNewItemQty] = useState('1')
  const [newItemUomId, setNewItemUomId] = useState('')

  // Ingredient edit popup (edits a line item in place — nothing removed from the list)
  const [editingLineId, setEditingLineId] = useState<string | null>(null)
  const [editLineQty, setEditLineQty] = useState('1')
  const [editLineUomId, setEditLineUomId] = useState('')

  async function uploadImage(file: File) {
    setImageUploading(true)
    const form = new FormData()
    form.append('file', file)
    const r = await fetch('/api/admin/upload', { method: 'POST', body: form })
    setImageUploading(false)
    if (r.ok) {
      const data = await r.json()
      setFormImageUrl(data.url)
    }
  }

  async function handleAddIngredient() {
    if (!newIngredientName.trim() || !newIngredientUomId || !newIngredientCatId) return
    setAddingIngredient(true)
    const r = await fetch('/api/admin/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newIngredientName.trim().toUpperCase(),
        uomId: newIngredientUomId,
        categoryId: newIngredientCatId,
        totalQty: 0,
      }),
    })
    if (r.ok) {
      const created = await r.json()
      setShowAddIngredient(false)
      setNewIngredientName(''); setNewIngredientUomId(''); setNewIngredientCatId('')
      // Refresh inventory items and select the new one
      const iRes = await fetch('/api/admin/inventory')
      if (iRes.ok) { const data = await iRes.json(); setInventoryItems(Array.isArray(data) ? data : []) }
      setNewItemId(created.id)
      setNewItemType('inventory')
      if (uoms.length > 0) {
        const u = uoms.find((um) => um.id === newIngredientUomId)
        if (u) setNewItemUomId(u.id)
      }
    }
    setAddingIngredient(false)
  }

  function addVariation() { setFormVariations(prev => [...prev, { name: '', price: 0 }]) }
  function updateVariation(i: number, field: 'name' | 'price', value: string) {
    setFormVariations(prev => prev.map((v, j) => j === i ? { ...v, [field]: field === 'price' ? (parseFloat(value) || 0) : value } : v))
  }
  function removeVariation(i: number) { setFormVariations(prev => prev.filter((_, j) => j !== i)) }

  const filteredWooCats = useMemo(() => {
    if (!wooCatInput.trim()) return []
    const q = wooCatInput.toUpperCase()
    return wooCategories.filter((c) => c.name.includes(q) && !formWooCategories.includes(c.id)).slice(0, 8)
  }, [wooCatInput, wooCategories, formWooCategories])

  function resetForm() {
    setFormName(''); setFormYieldQty('1'); setFormYieldUnitId('')
    setFormInstructions(''); setFormPrepTime(''); setLineItems([])
    setNewItemId(''); setNewItemQty('1'); setNewItemUomId('')
    setLinkToMenu(false); setFormPrice('0'); setFormWooProductId(''); setFormWooCategories([]); setWooCatInput('')
    setFormDietaryInfo([]); setFormImageUrl(null); setFormShortDescription('')
    setFormIsVariable(false); setFormVariations([])
    setFormExistingMenuItemId(null)
  }

  function populateForm(r: Recipe) {
    setFormName(r.name); setFormYieldQty(String(r.yieldQty))
    setFormYieldUnitId(r.yieldUnitId); setFormInstructions(r.instructions ?? ''); setFormPrepTime(r.prepTime != null ? String(r.prepTime) : '')
    setLineItems((r.lineItems ?? []).map((li: any) => ({
      id: li.id,
      qty: li.qty, uomId: li.uomId,
      inventoryItemId: li.inventoryItemId, childRecipeId: li.childRecipeId,
      inventoryItemName: li.inventoryItem?.name, inventoryItemUnit: li.inventoryItem?.unit,
      childRecipeName: li.childRecipe?.name,
      allergyInfo: li.inventoryItem?.allergyInfo ?? null,
    })))
    if (r.menuItem) {
      setLinkToMenu(true)
      setFormPrice(String(r.menuItem.price))
      setFormWooProductId(r.menuItem.wooProductId ?? '')
      setFormWooCategories(r.menuItem.wooCategoryId ? r.menuItem.wooCategoryId.split(',').map((s: string) => s.trim()).filter(Boolean) : [])
      setFormDietaryInfo(r.menuItem.dietaryInfo ? r.menuItem.dietaryInfo.split(',').map((s: string) => s.trim()).filter(Boolean) : [])
      setFormImageUrl(r.menuItem.imageUrl ?? null)
      setFormShortDescription(r.menuItem.shortDescription ?? '')
      setFormIsVariable(r.menuItem.isVariable ?? false)
      setFormVariations(r.menuItem.variations ?? [])
    } else {
    setLinkToMenu(false); setFormPrice('0'); setFormWooProductId(''); setFormWooCategories([]); setWooCatInput('')
    setFormDietaryInfo([]); setFormImageUrl(null); setFormShortDescription('')
    setFormIsVariable(false); setFormVariations([])
    }
  }

  function populateOrphan(o: OrphanMenuItem) {
    setIsCreating(true); setSelectedId(null)
    setFormName(o.name); setFormYieldQty('1'); setFormYieldUnitId('')
    setFormInstructions(''); setFormPrepTime(''); setLineItems([])
    setLinkToMenu(true); setFormPrice(String(o.price))
    setFormWooProductId(o.wooProductId ?? ''); setFormWooCategories(o.wooCategoryId ? o.wooCategoryId.split(',').map((s: string) => s.trim()).filter(Boolean) : [])
    setFormDietaryInfo(o.dietaryInfo ? o.dietaryInfo.split(',').map((s: string) => s.trim()).filter(Boolean) : [])
    setFormImageUrl(o.imageUrl ?? null)
    setFormShortDescription(o.shortDescription ?? '')
    setFormIsVariable(o.isVariable ?? false)
    setFormVariations(o.variations ?? [])
    setFormExistingMenuItemId(o.id)
  }

  async function load() {
    setLoading(true)
    const [rRes, uRes, iRes, mRes, cRes] = await Promise.all([
      fetch('/api/admin/recipes'),
      fetch('/api/admin/uoms'),
      fetch('/api/admin/inventory'),
      fetch('/api/admin/menu-items'),
      fetch('/api/admin/inventory/categories'),
    ])
    if (rRes.ok) {
      const prs = await rRes.json()
      setRecipes(Array.isArray(prs) ? prs : [])
      setAllRecipes(Array.isArray(prs) ? prs.map((r: any) => ({ id: r.id, name: r.name })) : [])
    }
    if (uRes.ok) {
      const data = await uRes.json()
      setUoms(Array.isArray(data) ? data : [])
    }
    if (iRes.ok) {
      const data = await iRes.json()
      setInventoryItems(Array.isArray(data) ? data : [])
    }
    if (mRes.ok) {
      const items = await mRes.json()
      const arr = Array.isArray(items) ? items : []
      // Filter: menu items whose recipe is null (no recipe linked)
      const orphaned = arr.filter((m: any) => !m.recipe || !m.recipeId)
      setOrphanItems(orphaned)
    }
    if (cRes.ok) {
      const data = await cRes.json()
      setCategories(Array.isArray(data) ? data : [])
    }
    // Load WooCommerce categories for the category picker
    try {
      const wcRes = await fetch('/api/admin/woocommerce/categories')
      if (wcRes.ok) {
        const data = await wcRes.json()
        setWooCategories((data.categories ?? []).map((c: { id: number; name: string }) => ({ id: String(c.id), name: c.name })))
      }
    } catch { /* best-effort */ }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (selectedId && !isCreating) {
      const r = recipes.find((x) => x.id === selectedId)
      if (r) populateForm(r)
    }
  }, [selectedId])

  function addLineItem() {
    if (!newItemId || !newItemUomId) return
    const uom = uoms.find((u) => u.id === newItemUomId)
    const li: LineItem = {
      _clientId: generateId(),
      qty: parseFloat(newItemQty) || 1,
      uomId: newItemUomId,
    }
    if (newItemType === 'inventory') {
      const inv = inventoryItems.find((i) => i.id === newItemId)
      li.inventoryItemId = newItemId
      li.inventoryItemName = inv?.name
      li.inventoryItemUnit = uom?.name
      li.allergyInfo = inv?.allergyInfo ?? null
    } else {
      const rec = allRecipes.find((i) => i.id === newItemId)
      li.childRecipeId = newItemId
      li.childRecipeName = rec?.name
    }
    setLineItems((prev) => [...prev, li])
    setNewItemId(''); setNewItemQty('1'); setNewItemUomId('')
  }

  function removeLineItem(clientId: string) {
    setLineItems((prev) => prev.filter((li) => (li._clientId ?? li.id) !== clientId))
  }

  function openLineEdit(li: LineItem) {
    const cid = li._clientId ?? li.id ?? ''
    setEditingLineId(cid)
    setEditLineQty(String(li.qty))
    setEditLineUomId(li.uomId)
  }

  function saveLineEdit() {
    if (!editingLineId) return
    setLineItems((prev) => prev.map((li) => {
      const cid = li._clientId ?? li.id ?? ''
      if (cid !== editingLineId) return li
      return { ...li, qty: parseFloat(editLineQty) || 1, uomId: editLineUomId }
    }))
    setEditingLineId(null)
  }

  async function handleSave() {
    if (!formName.trim()) return
    setSaving(true)
    const body: any = {
      name: formName.trim().toUpperCase(),
      yieldQty: parseFloat(formYieldQty) || 1,
      yieldUnitId: formYieldUnitId,
      instructions: formInstructions || null,
      prepTime: formPrepTime ? parseInt(formPrepTime) : null,
      lineItems: lineItems.map((li) => ({
        qty: li.qty, uomId: li.uomId,
        inventoryItemId: li.inventoryItemId ?? null,
        childRecipeId: li.childRecipeId ?? null,
      })),
      linkToMenu,
      price: linkToMenu ? parseFloat(formPrice) || 0 : undefined,
      wooProductId: linkToMenu ? (formWooProductId || null) : undefined,
      wooCategoryId: linkToMenu ? (formWooCategories.length > 0 ? formWooCategories.join(', ') : null) : undefined,
      imageUrl: linkToMenu ? formImageUrl : undefined,
      shortDescription: linkToMenu ? (formShortDescription || null) : undefined,
      isVariable: linkToMenu ? formIsVariable : undefined,
      variations: linkToMenu ? (formVariations.length > 0 ? formVariations : null) : undefined,
      existingMenuItemId: formExistingMenuItemId || undefined,
      dietaryInfo: formDietaryInfo.length > 0 ? formDietaryInfo.join(',') : null,
    }
    if (isCreating) {
      const r = await fetch('/api/admin/recipes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (r.ok) { const created = await r.json(); setSelectedId(created.id); setIsCreating(false); await load() }
    } else if (selectedId) {
      const r = await fetch(`/api/admin/recipes/${selectedId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (r.ok) await load()
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!selectedId) return
    if (!confirm('Delete this recipe?')) return
    await fetch(`/api/admin/recipes/${selectedId}`, { method: 'DELETE' })
    setSelectedId(null); resetForm(); load()
  }

  const otherRecipes = allRecipes.filter((r) => r.id !== (isCreating ? undefined : selectedId))

  const searchGroups = (() => {
    const groups: { label: string; options: { value: string; label: string }[] }[] = []
    const byCat = new Map<string, { value: string; label: string }[]>()
    for (const i of inventoryItems) {
      // Filter out OTHER-tab items (equipment, tools, cleaning, etc.)
      const tab = i.category?.tab
      if (tab !== 'FOOD' && tab !== 'BEVERAGE' && tab != null) continue
      const catName = i.category?.name ?? 'UNCATEGORISED'
      const arr = byCat.get(catName) ?? []
      arr.push({ value: i.id, label: i.name })
      byCat.set(catName, arr)
    }
    for (const [cat, items] of byCat) {
      groups.push({ label: cat, options: items })
    }
    if (otherRecipes.length > 0) groups.push({ label: 'SUB-RECIPES', options: otherRecipes.map((r) => ({ value: r.id, label: r.name })) })
    return groups
  })()

  const filteredRecipes = recipes.filter(r => !recipeSearch || r.name.includes(recipeSearch))
  const filteredOrphans = orphanItems.filter(o => !recipeSearch || o.name.includes(recipeSearch))

  if (loading) {
    return <div className="flex items-center justify-center h-64"><p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p></div>
  }

  return (
    <div className="space-y-4">
      <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">RECIPES & MENU ITEMS</h1>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-3">
          <ListBox
            title="ITEMS"
            count={recipes.length + orphanItems.length}
            action={<Button size="sm" onClick={() => { setSelectedId(null); setIsCreating(true); resetForm() }}>+ ADD</Button>}
          >
            <div className="p-2">
              <Input value={recipeSearch} onChange={(e) => setRecipeSearch(e.target.value.toUpperCase())} placeholder="SEARCH..." />
            </div>
            <div className="max-h-[60vh] overflow-y-auto divide-y divide-grey-mid">
              {filteredRecipes.map((r) => (
                <ListRow key={r.id} active={selectedId === r.id && !isCreating} onClick={() => { setIsCreating(false); setSelectedId(r.id) }}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="block truncate flex-1 font-mono text-xs uppercase text-white">{r.name}</span>
                      {r.menuItem && <span className="font-mono text-[8px] text-success border border-success px-1 shrink-0">MENU</span>}
                    </div>
                    <span className="block text-[10px] text-grey-light">
                      v{r.version} · {r.yieldQty} {r.yieldUnit?.name ?? ''}{r.menuItem ? ` · $${r.menuItem.price.toFixed(2)}` : ''}
                    </span>
                    {r.menuItem?.wooCategoryId && (() => {
                      const cats = r.menuItem.wooCategoryId.split(',').map((c: string) => c.trim()).filter(Boolean)
                      return cats.map((cat: string) => (
                        <span key={cat} className="inline-block mt-0.5 mr-1 font-mono text-[8px] text-[#c4a530] border border-[#c4a530] px-1">{cat}</span>
                      ))
                    })()}
                  </div>
                </ListRow>
              ))}
              {filteredOrphans.length > 0 && filteredRecipes.length > 0 && (
                <div className="px-3 py-1">
                  <span className="font-mono text-[9px] text-warning uppercase">NEEDS RECIPE</span>
                </div>
              )}
              {filteredOrphans.map((o) => (
                <ListRow key={o.id} onClick={() => populateOrphan(o)}>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-xs uppercase text-[#c4a530]">{o.name}</span>
                    <span className="block text-[10px] text-grey-light">IMPORTED · ${o.price.toFixed(2)}</span>
                  </div>
                </ListRow>
              ))}
              {filteredRecipes.length === 0 && filteredOrphans.length === 0 && (
                <p className="font-mono text-xs text-grey-light px-3 py-2">No recipes yet.</p>
              )}
            </div>
          </ListBox>
        </div>

        <div className="lg:col-span-9">
          <div className="border border-grey-mid p-4 space-y-4">
            {(!selectedId && !isCreating) ? (
              <p className="font-mono text-xs text-grey-light uppercase">SELECT AN ITEM OR CLICK + ADD</p>
            ) : (
              <>
                <h2 className="font-mono text-xs uppercase text-grey-light tracking-wider">
                  {isCreating ? 'NEW RECIPE' : 'PROPERTIES'}
                </h2>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
                  <div className="col-span-2 md:col-span-2">
                    <label className="font-mono text-xs uppercase text-grey-light block mb-1">NAME</label>
                    <Input value={formName} onChange={(e) => setFormName(e.target.value.toUpperCase())} placeholder="RECIPE NAME" />
                  </div>
                  <div className="col-span-1">
                    <label className="font-mono text-xs uppercase text-grey-light block mb-1">YIELD QTY</label>
                    <Input type="number" step="0.01" value={formYieldQty} onChange={(e) => setFormYieldQty(e.target.value)} />
                  </div>
                  <div className="col-span-1">
                    <label className="font-mono text-xs uppercase text-grey-light block mb-1">YIELD UNIT</label>
                    <Select value={formYieldUnitId} onChange={(e) => setFormYieldUnitId(e.target.value)}
                      options={uoms.map((u) => ({ value: u.id, label: u.name }))} placeholder="UOM" />
                  </div>
                  <div className="col-span-1">
                    <label className="font-mono text-xs uppercase text-grey-light block mb-1">PREP (MIN)</label>
                    <Input type="number" value={formPrepTime} onChange={(e) => setFormPrepTime(e.target.value)} />
                  </div>
                </div>

                <div>
                  <label className="font-mono text-xs uppercase text-grey-light block mb-1">INSTRUCTIONS</label>
                  <textarea value={formInstructions} onChange={(e) => setFormInstructions(e.target.value)}
                    placeholder="USE - FOR BULLET POINTS&#10;- STEP ONE&#10;- STEP TWO"
                    rows={5} className="w-full bg-black border border-grey-mid text-white font-mono text-xs px-3 py-2 outline-hidden focus:border-white placeholder:text-grey-light resize-y" />
                </div>

                {/* Line Items */}
                <div className="space-y-3">
                  <ListBox title="INGREDIENTS & SUB-RECIPES" count={lineItems.length}>
                    {lineItems.length === 0 ? (
                      <p className="font-mono text-xs text-grey-light px-3 py-2">NO INGREDIENTS YET.</p>
                    ) : (
                      lineItems.map((li) => {
                        const cid = li._clientId ?? li.id ?? ''
                        const uom = uoms.find((u) => u.id === li.uomId)
                        return (
                          <ListRow key={cid}>
                            <span className="text-white flex-1 min-w-0 truncate font-mono text-xs uppercase">{li.inventoryItemName ?? li.childRecipeName ?? '—'}</span>
                            {li.allergyInfo && li.allergyInfo.split(',').map((a: string) => a.trim()).filter(Boolean).map((allergen: string) => (
                              <span key={allergen} className="font-mono text-[8px] text-[#c4a530] border border-[#c4a530] px-1">{allergen}</span>
                            ))}
                            <span className="font-mono text-xs text-grey-light shrink-0">×{li.qty} {uom?.name ?? ''}</span>
                            {li.childRecipeId && <span className="font-mono text-[10px] text-warning shrink-0">SUB-RECIPE</span>}
                            <button onClick={() => openLineEdit(li)}
                              className="font-mono text-[10px] text-[#c4a530] border border-[#c4a530] px-1.5 py-0.5 hover:text-white hover:border-white uppercase shrink-0"
                            >EDIT</button>
                            <button onClick={() => removeLineItem(cid)} className="font-mono text-xs text-grey-light hover:text-danger shrink-0">✕</button>
                          </ListRow>
                        )
                      })
                    )}
                  </ListBox>

                  <div className="flex items-center gap-2">
                    <SearchSelect value={newItemId}                     onChange={(v) => {
                      setNewItemId(v)
                      if (v) {
                        const isRecipe = otherRecipes.some((r) => r.id === v)
                        setNewItemType(isRecipe ? 'recipe' : 'inventory')
                        if (!isRecipe && uoms.length > 0) {
                          const inv = inventoryItems.find((i) => i.id === v)
                          if (inv?.unit) {
                            const u = inv.unit.toUpperCase().trim()
                            // Exact match first, then baseUnit
                            let match = uoms.find((um) => um.name.toUpperCase() === u)
                            if (!match) match = uoms.find((um) => um.baseUnit?.toUpperCase() === u)
                            if (match) setNewItemUomId(match.id)
                          }
                        }
                      }
                    }}
                      groups={searchGroups} placeholder="SEARCH INGREDIENT OR RECIPE..." className="flex-1"
          footerAction={{ label: 'ADD INGREDIENT', onClick: () => setShowAddIngredient(true) }} />
                    <Input type="number" step="0.01" value={newItemQty} onChange={(e) => setNewItemQty(e.target.value)} className="w-20" />
                    <Select value={newItemUomId} onChange={(e) => setNewItemUomId(e.target.value)}
                      options={uoms.map((u) => ({ value: u.id, label: u.name }))} placeholder="UOM" className="w-28" />
                    <Button size="sm" onClick={addLineItem} disabled={!newItemId || !newItemUomId}>+ ADD</Button>
                  </div>
                </div>

                {/* Allergens */}
                <div className="border border-grey-mid p-3 space-y-1.5">
                  <label className="font-mono text-xs uppercase text-grey-light block">ALLERGENS</label>
                  {(() => {
                    const inherited = computeRecipeAllergens(
                      lineItems.map((li) => ({
                        type: li.inventoryItemId ? 'inventory' as const : 'recipe' as const,
                        item: { id: li.inventoryItemId ?? li.childRecipeId ?? '', name: li.inventoryItemName ?? li.childRecipeName ?? '', allergyInfo: li.allergyInfo ?? null },
                      })),
                      null,
                    ).filter((s) => s.inherited)
                    const inheritedMap = new Map(inherited.map((s) => [s.allergen, s]))
                    return (
                      <div className="space-y-1.5">
                        {ALLERGEN_GROUPS.map((grp) => (
                          <div key={grp.label}>
                            <div className="font-mono text-[8px] uppercase text-grey-light mb-0.5 pl-0.5">{grp.label}</div>
                            <div className="flex flex-wrap gap-1">
                              {grp.items.filter((a) => ALLERGENS.includes(a)).map((a) => {
                                const inh = inheritedMap.get(a as any)
                                const selected = formDietaryInfo.includes(a)
                                if (inh) {
                                  return (
                                    <span key={a} onClick={() => setAllergenPopout({ allergen: a, source: inh.source })} className="inline-flex items-center gap-1 font-mono text-[9px] uppercase px-1.5 py-0.5 border cursor-pointer bg-[#c4a530]/10 text-[#c4a530] border-[#c4a530]/50 hover:border-[#c4a530]">
                                      ⚿ {a}
                                    </span>
                                  )
                                }
                                return (
                                  <button key={a} type="button"
                                    onClick={() => setFormDietaryInfo((prev) => prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a])}
                                    className={`font-mono text-[9px] uppercase px-1.5 py-0.5 border transition-colors ${selected ? 'bg-[#c4a530]/10 text-[#c4a530] border-[#c4a530]/50' : 'bg-transparent text-grey-light border-grey-mid hover:border-white hover:text-white'
                                      }`}>
                                    {selected ? '✓ ' : ''}{a}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>

                {/* Link to WooCommerce */}
                <div className="border border-grey-mid p-3 space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={linkToMenu} onChange={(e) => setLinkToMenu(e.target.checked)}
                      className="bg-black border border-grey-mid accent-white" />
                    <span className="font-mono text-xs uppercase text-white">LINK TO WOO</span>
                    {linkToMenu && <span className="font-mono text-[10px] text-grey-light">(APPEARS ON WOOCOMMERCE)</span>}
                  </label>
                  {linkToMenu && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="font-mono text-xs uppercase text-grey-light block mb-1">PRICE</label>
                        <Input type="number" step="0.01" value={formPrice} onChange={(e) => setFormPrice(e.target.value)} />
                      </div>
                      <div>
                        <label className="font-mono text-xs uppercase text-grey-light block mb-1">WOO PRODUCT ID</label>
                        <Input value={formWooProductId} onChange={(e) => setFormWooProductId(e.target.value)} placeholder="AUTO-GENERATED ON SAVE" disabled={true} />
                      </div>
                      <div className="relative">
                        <label className="font-mono text-xs uppercase text-grey-light block mb-1">WOO CATEGORY</label>
                        <div className={`flex flex-wrap items-center gap-1 bg-black border px-3 py-2 min-h-[38px] ${wooCatShowDropdown && filteredWooCats.length > 0 ? 'border-white' : 'border-grey-mid focus-within:border-white'}`}>
                          {formWooCategories.map((c, i) => (
                            <span key={i} className="inline-flex items-center gap-1 bg-grey-mid border border-grey-light px-1.5 py-0.5 font-mono text-[10px] text-white leading-none">
                              {wooCategories.find(cat => cat.id === c)?.name ?? c}
                              <button onClick={() => setFormWooCategories(prev => prev.filter((_, j) => j !== i))}
                                className="text-grey-light hover:text-danger text-xs leading-none">&times;</button>
                            </span>
                          ))}
                          <input value={wooCatInput}
                            onFocus={() => { if (wooCatInput.trim() && filteredWooCats.length > 0) setWooCatShowDropdown(true) }}
                            onBlur={() => setTimeout(() => setWooCatShowDropdown(false), 150)}
                            onChange={(e) => {
                              const v = e.target.value
                              if (v.endsWith(',')) {
                                const tag = v.replace(/,/g, '').trim().toUpperCase()
                                if (tag && !formWooCategories.includes(tag)) setFormWooCategories(prev => [...prev, tag])
                                setWooCatInput(''); setWooCatShowDropdown(false)
                              } else { setWooCatInput(v); if (v.trim()) setWooCatShowDropdown(true) }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); const tag = wooCatInput.trim().toUpperCase(); if (tag && !formWooCategories.includes(tag)) setFormWooCategories(prev => [...prev, tag]); setWooCatInput(''); setWooCatShowDropdown(false) }
                              else if (e.key === 'Backspace' && !wooCatInput && formWooCategories.length > 0) { setFormWooCategories(prev => prev.slice(0, -1)) }
                              else if (e.key === 'Escape') { setWooCatShowDropdown(false) }
                            }}
                            placeholder={formWooCategories.length === 0 ? 'SEARCH OR TYPE CATEGORY...' : ''}
                            className="flex-1 min-w-[120px] bg-transparent border-none outline-hidden text-white font-mono text-xs placeholder:text-grey-light"
                          />
                        </div>
                        {wooCatShowDropdown && filteredWooCats.length > 0 && (
                          <div className="absolute top-full left-0 right-0 z-50 mt-1 border border-grey-mid bg-black max-h-48 overflow-y-auto shadow-lg">
                            {filteredWooCats.map((c) => (
                              <button key={c.id}
                                onMouseDown={(e) => { e.preventDefault(); if (!formWooCategories.includes(c.id)) setFormWooCategories(prev => [...prev, c.id]); setWooCatInput(''); setWooCatShowDropdown(false) }}
                                className="w-full text-left px-3 py-1.5 font-mono text-xs text-white hover:bg-grey-dark border-b border-grey-mid last:border-b-0 uppercase">
                                {c.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="md:col-span-3">
                        <label className="font-mono text-xs uppercase text-grey-light block mb-1">SHORT DESCRIPTION</label>
                        <textarea value={formShortDescription} onChange={(e) => setFormShortDescription(e.target.value)}
                          placeholder="BRIEF EXCERPT FOR PRODUCT LISTING..."
                          rows={3}
                          className="w-full bg-black border border-grey-mid text-white font-mono text-xs px-3 py-2 outline-none focus:border-white placeholder:text-grey-light resize-y" />
                      </div>

                      <div className="md:col-span-3">
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={formIsVariable} onChange={(e) => { setFormIsVariable(e.target.checked); if (!e.target.checked) setFormVariations([]) }}
                            className="bg-black border border-grey-mid accent-white" />
                          <span className="font-mono text-xs uppercase text-white">VARIABLE PRODUCT</span>
                          <span className="font-mono text-[10px] text-grey-light">(E.G. SMALL, MEDIUM, LARGE)</span>
                        </label>
                        {formIsVariable && (
                          <div className="mt-3 ml-2 border-l border-grey-mid pl-4 space-y-3">
                            <p className="font-mono text-[10px] text-grey-light leading-relaxed">
                              EACH VARIATION CREATES A UNIQUE PRICE POINT ON WOOCOMMERCE.
                              THE MAIN PRICE ABOVE IS THE DEFAULT (LOWEST) PRICE.<br />
                              WHEN PUSHED, THE PRODUCT BECOMES A VARIABLE PRODUCT WITH THESE SIZE OPTIONS.
                              VARIATIONS MUST BE MANAGED ON WOOCOMMERCE AFTER THE INITIAL PUSH.
                            </p>
                            <div className="space-y-2">
                              {formVariations.map((v, i) => (
                                <div key={i} className="flex items-center gap-2">
                                  <input value={v.name} onChange={(e) => updateVariation(i, 'name', e.target.value.toUpperCase())}
                                    placeholder="e.g. SMALL"
                                    className="w-32 bg-black border border-grey-mid text-white font-mono text-xs px-3 py-2 outline-none focus:border-white placeholder:text-grey-light" />
                                  <span className="font-mono text-xs text-grey-light">$</span>
                                  <input type="number" step="0.01" value={v.price || ''} onChange={(e) => updateVariation(i, 'price', e.target.value)}
                                    placeholder="0.00"
                                    className="w-24 bg-black border border-grey-mid text-white font-mono text-xs px-3 py-2 outline-none focus:border-white placeholder:text-grey-light text-right" />
                                  <button onClick={() => removeVariation(i)}
                                    className="text-grey-light hover:text-danger font-mono text-xs">×</button>
                                </div>
                              ))}
                              <button onClick={addVariation}
                                className="font-mono text-[10px] uppercase text-[#60A5FA] hover:text-white">
                                + ADD VARIATION
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="md:col-span-3">
                        <label className="font-mono text-xs uppercase text-grey-light block mb-1">PRODUCT IMAGE</label>
                        <div className="flex items-center gap-2" onPaste={(e) => {
                          const items = e.clipboardData?.items
                          if (items) {
                            for (const item of Array.from(items)) {
                              if (item.type.startsWith('image/')) {
                                const file = item.getAsFile()
                                if (file) uploadImage(file)
                                break
                              }
                            }
                          }
                        }}>
                          <input ref={imageFileRef} type="file" accept="image/*" className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f) }} />
                          <button type="button" onClick={() => imageFileRef.current?.click()}
                            className="font-mono text-xs uppercase border border-grey-mid px-3 py-1.5 text-grey-light hover:border-white hover:text-white transition-colors">
                            {imageUploading ? 'UPLOADING_' : formImageUrl ? 'REPLACE IMAGE' : 'ADD IMAGE'}
                          </button>
                          <span className="font-mono text-[9px] text-grey-light/50 hidden sm:inline">OR PASTE (CTRL+V)</span>
                          {formImageUrl && (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={formImageUrl} alt="product" className="h-10 w-10 object-cover border border-grey-mid cursor-pointer" onClick={() => setPreviewImage(formImageUrl)} />
                              <button type="button" onClick={() => setFormImageUrl(null)}
                                className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors">
                                REMOVE
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t border-grey-mid pt-3 flex items-center gap-2">
                  <Button onClick={handleSave} disabled={saving || !formName.trim()}>
                    {saving ? 'SAVING...' : 'SAVE'}
                  </Button>
                  {!isCreating && <Button variant="danger" size="sm" onClick={handleDelete}>DELETE</Button>}
                  <Button variant="ghost" size="sm" onClick={() => { setSelectedId(null); setIsCreating(false); resetForm() }}>CANCEL</Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <Modal isOpen={editingLineId != null} onClose={() => setEditingLineId(null)} title="EDIT INGREDIENT" size="sm">
        {(() => {
          const li = lineItems.find((x) => (x._clientId ?? x.id ?? '') === editingLineId)
          return (
            <div className="space-y-4">
              <div>
                <label className="font-mono text-xs uppercase text-grey-light block mb-1">ITEM</label>
                <p className="font-mono text-xs uppercase text-white">{li?.inventoryItemName ?? li?.childRecipeName ?? '—'}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-mono text-xs uppercase text-grey-light block mb-1">QTY</label>
                  <Input type="number" step="0.01" value={editLineQty} onChange={(e) => setEditLineQty(e.target.value)} />
                </div>
                <div>
                  <label className="font-mono text-xs uppercase text-grey-light block mb-1">UNIT</label>
                  <Select value={editLineUomId} onChange={(e) => setEditLineUomId(e.target.value)}
                    options={uoms.map((u) => ({ value: u.id, label: u.name }))} placeholder="UOM" />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={saveLineEdit} disabled={!editLineUomId}>SAVE</Button>
                <Button variant="ghost" onClick={() => setEditingLineId(null)}>CANCEL</Button>
              </div>
            </div>
          )
        })()}
      </Modal>

      <Modal isOpen={allergenPopout != null} onClose={() => setAllergenPopout(null)} title="ALLERGEN SOURCE" size="sm">
        {allergenPopout && (
          <div className="space-y-3">
            <div className="border border-[#c4a530]/50 bg-[#c4a530]/10 px-3 py-2 font-mono text-sm uppercase text-[#c4a530]">
              ⚿ {allergenPopout.allergen}
            </div>
            <p className="font-mono text-xs text-grey-light">THIS ALLERGEN IS INHERITED FROM AN INGREDIENT AND CANNOT BE REMOVED.</p>
            <div className="border border-grey-mid p-3">
              <div className="font-mono text-[10px] uppercase text-grey-light mb-1">SOURCE CHAIN</div>
              <div className="font-mono text-xs text-white">{allergenPopout.source}</div>
            </div>
            <Button variant="ghost" onClick={() => setAllergenPopout(null)}>CLOSE</Button>
          </div>
        )}
      </Modal>

      <Modal isOpen={showAddIngredient} onClose={() => { setShowAddIngredient(false); setNewIngredientName(''); setNewIngredientUomId(''); setNewIngredientCatId('') }} title="ADD INGREDIENT" size="sm">
        <div className="space-y-4">
          <div>
            <label className="font-mono text-xs uppercase text-grey-light block mb-1">NAME</label>
            <Input value={newIngredientName} onChange={(e) => setNewIngredientName(e.target.value.toUpperCase())} placeholder="INGREDIENT NAME" />
          </div>
          <div>
            <label className="font-mono text-xs uppercase text-grey-light block mb-1">CATEGORY</label>
            <Select value={newIngredientCatId} onChange={(e) => setNewIngredientCatId(e.target.value)}
              options={categories.filter(c => c.tab === 'FOOD' || c.tab === 'BEVERAGE').map(c => ({ value: c.id, label: c.name }))} placeholder="SELECT CATEGORY" />
          </div>
          <div>
            <label className="font-mono text-xs uppercase text-grey-light block mb-1">UNIT</label>
            <Select value={newIngredientUomId} onChange={(e) => setNewIngredientUomId(e.target.value)}
              options={uoms.map(u => ({ value: u.id, label: u.name }))} placeholder="SELECT UNIT" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={handleAddIngredient} disabled={addingIngredient || !newIngredientName.trim() || !newIngredientUomId || !newIngredientCatId}>
              {addingIngredient ? 'CREATING...' : 'CREATE'}
            </Button>
            <Button variant="ghost" onClick={() => { setShowAddIngredient(false); setNewIngredientName(''); setNewIngredientUomId(''); setNewIngredientCatId('') }}>CANCEL</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={previewImage != null} onClose={() => setPreviewImage(null)} title="" size="lg">
        {previewImage && (
          <img src={previewImage} alt="Product preview" className="w-full border border-grey-mid" />
        )}
      </Modal>
    </div>
  )
}
