'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { Combobox } from '@/components/ui/Combobox'
import { AllergenPicker } from '@/components/ui/AllergenPicker'
import { ALLERGENS } from '@/lib/allergens'
import { cupToDensity, findKnownIngredient } from '@/lib/unit-convert'
import { buildDensityPrompt, parseDensityFromAnswer } from '@/lib/llm-prompt'
import { FurnitureForm } from '@/components/admin/FurnitureForm'
import { getActiveVenueId } from '@/lib/active-venue'
import type { FurnitureView } from '@hospo-ops/types'

interface Category { id: string; name: string; isBuiltIn: boolean; venueId: string | null; tab: string | null; showDeepFields: boolean; showEquipmentFields: boolean }
interface Item {
  id: string; name: string; categoryId: string; unit: string; defaultParLevel: number; totalQty: number; placedCount: number; category: Category
  furnitureType?: string | null; elementWidth?: number | null; elementDepth?: number | null
  elementShape?: string | null; defaultColour?: string | null; defaultChairCount?: number
  countingUnitId?: string | null; orderingUnitId?: string | null; yieldPercentage?: number | null; costPrice?: number | null; expiryDate?: string | null; fallbackCategoryId?: string | null; allergyInfo?: string | null
  shelfLifeDays?: number | null; canFreeze?: boolean; freezerShelfLifeDays?: number | null
  densityGramsPerMl?: number | null; weightPerUnitGrams?: number | null
  // Equipment / tool tracking
  imageUrls?: string[] | null; storageSectionId?: string | null; storageNotes?: string | null
  serialNumber?: string | null; purchaseDate?: string | null; warrantyExpiry?: string | null
  serviceIntervalDays?: number | null; lastServicedAt?: string | null; nextServiceAt?: string | null
  maintenanceNotes?: string | null; supplierId?: string | null
}
interface Uom { id: string; name: string; baseUnit: string }
interface IngredientRef { id: string; name: string; densityGramsPerMl: number | null; weightPerUnitGrams: number | null; notes: string | null; isBuiltIn: boolean }
interface SectionLite { id: string; name: string; department: { id: string; name: string } }
interface SupplierLite { id: string; name: string }

interface StockItem { id: string; name: string; quantity: number; unit: string }
interface StockTable { id: string; label: string; width: number; depth: number; planName: string; planId: string; inventoryItems: StockItem[] }
interface StockSection { id: string; name: string; tables: StockTable[] }

interface PantryRef {
  id: string; name: string; densityGramsPerMl: number | null
  weightPerUnitGrams: number | null; notes: string | null
}

export function InventoryClient({ role, sessionVenueId, defaultVenueId }: { role: string; sessionVenueId: string; defaultVenueId?: string | null }) {
  const venueId = getActiveVenueId(role, sessionVenueId, defaultVenueId)
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [stock, setStock] = useState<StockSection[]>([])
  const [stockLoading, setStockLoading] = useState(false)
  const [showNewCat, setShowNewCat] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [showCatModal, setShowCatModal] = useState(false)
  const [editingCat, setEditingCat] = useState<Category | null>(null)
  const [showDeleted, setShowDeleted] = useState(false)
  const [deletedItems, setDeletedItems] = useState<Item[]>([])
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [maintLogs, setMaintLogs] = useState<{ id: string; note: string; createdAt: string; staffName: string | null }[]>([])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [showCatDropdown, setShowCatDropdown] = useState(false)
  const [activeTab, setActiveTab] = useState<'FOOD' | 'BEVERAGE' | 'OTHER'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('hospo-inventory-tab')
      if (saved === 'FOOD' || saved === 'BEVERAGE' || saved === 'OTHER') return saved
    }
    return 'OTHER'
  })
  const [uoms, setUoms] = useState<Uom[]>([])

  // Property editor (non-furniture items)
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [formName, setFormName] = useState('')
  const [formCat, setFormCat] = useState('')
  const [formUnit, setFormUnit] = useState('EA')
  const [formPar, setFormPar] = useState('0')
  const [formTotalQty, setFormTotalQty] = useState('0')
  const [isCreating, setIsCreating] = useState(false)
  const [createCat, setCreateCat] = useState('')
  const [newCatTab, setNewCatTab] = useState('FOOD')

  // Deep inventory fields
  const [formCountingUnitId, setFormCountingUnitId] = useState('')
  const [formOrderingUnitId, setFormOrderingUnitId] = useState('')
  const [formYield, setFormYield] = useState('')
  const [formCostPrice, setFormCostPrice] = useState('')
  const [formExpiryDate, setFormExpiryDate] = useState('')
  const [formFallbackCatId, setFormFallbackCatId] = useState('')
  const [formAllergyInfo, setFormAllergyInfo] = useState('')
  const [showDeepFields, setShowDeepFields] = useState(true)
  const [formShelfLifeDays, setFormShelfLifeDays] = useState('')
  const [formCanFreeze, setFormCanFreeze] = useState(false)
  const [formFreezerShelfLifeDays, setFormFreezerShelfLifeDays] = useState('')
  const [formCountingUnitQty, setFormCountingUnitQty] = useState('')
  const [formOrderingUnitQty, setFormOrderingUnitQty] = useState('')
  const [formParLevelUnitId, setFormParLevelUnitId] = useState('')

  // Density (volume ↔ mass ↔ count conversion)
  const [formDensity, setFormDensity] = useState('')
  const [formCupWeight, setFormCupWeight] = useState('')
  const [formWeightPerUnit, setFormWeightPerUnit] = useState('')
  const [ingredientRefs, setIngredientRefs] = useState<IngredientRef[]>([])
  const [knownSuggestion, setKnownSuggestion] = useState<IngredientRef | null>(null)
  const [showRefPicker, setShowRefPicker] = useState(false)
  const [refSearch, setRefSearch] = useState('')
  const [showLlmModal, setShowLlmModal] = useState(false)
  const [llmAnswer, setLlmAnswer] = useState('')

  // Equipment / tool tracking
  const [formImageUrls, setFormImageUrls] = useState<string[]>([])
  const [formStorageSectionId, setFormStorageSectionId] = useState('')
  const [formStorageNotes, setFormStorageNotes] = useState('')
  const [formSerialNumber, setFormSerialNumber] = useState('')
  const [formPurchaseDate, setFormPurchaseDate] = useState('')
  const [formWarrantyExpiry, setFormWarrantyExpiry] = useState('')
  const [formWarrantyMonths, setFormWarrantyMonths] = useState('')
  const [formServiceIntervalDays, setFormServiceIntervalDays] = useState('')
  const [formLastServicedAt, setFormLastServicedAt] = useState('')
  const [formNextServiceAt, setFormNextServiceAt] = useState('')
  const [formMaintenanceNotes, setFormMaintenanceNotes] = useState('')
  const [formSupplierId, setFormSupplierId] = useState('')
  const [formAltSupplierIds, setFormAltSupplierIds] = useState<string[]>([])
  const [showEquipmentFields, setShowEquipmentFields] = useState(true)
  const [catShowDeep, setCatShowDeep] = useState(false)
  const [catShowEquip, setCatShowEquip] = useState(false)
  const [formUploadingImg, setFormUploadingImg] = useState(false)
  const [sections, setSections] = useState<SectionLite[]>([])
  const [suppliers, setSuppliers] = useState<SupplierLite[]>([])
  const [pantryRefs, setPantryRefs] = useState<PantryRef[]>([])

  // Furniture editor. Furniture is an InventoryItem with geometry set, so the
  // id here is just the item's id — there is no separate profile record.
  const [showTableProfile, setShowTableProfile] = useState(false)
  const [editProfileId, setEditProfileId] = useState<string | null>(null)
  const [profiles, setProfiles] = useState<FurnitureView[]>([])

  function resetForm() {
    setFormName(''); setFormCat(''); setFormUnit('EA'); setFormPar('0'); setFormTotalQty('0')
    setFormCountingUnitId(''); setFormOrderingUnitId(''); setFormYield(''); setFormCostPrice('')
    setFormExpiryDate(''); setFormFallbackCatId(''); setFormAllergyInfo(''); setShowDeepFields(true)
    setFormShelfLifeDays(''); setFormCanFreeze(false); setFormFreezerShelfLifeDays('')
    setFormDensity(''); setFormCupWeight(''); setFormWeightPerUnit(''); setKnownSuggestion(null); setLlmAnswer('')
    setFormImageUrls([]); setFormStorageSectionId(''); setFormStorageNotes('')
    setFormSerialNumber(''); setFormPurchaseDate(''); setFormWarrantyExpiry('')
    setFormServiceIntervalDays(''); setFormLastServicedAt(''); setFormNextServiceAt('')
    setFormMaintenanceNotes(''); setFormSupplierId(''); setShowEquipmentFields(false)
  }

  function populateForm(item: Item) {
    setFormName(item.name); setFormCat(item.categoryId); setFormUnit(item.unit)
    setFormPar((item.defaultParLevel ?? 0).toString()); setFormTotalQty((item.totalQty ?? 0).toString())
    setFormCountingUnitId(item.countingUnitId ?? ''); setFormOrderingUnitId(item.orderingUnitId ?? '')
    setFormYield(item.yieldPercentage != null ? String(item.yieldPercentage) : '')
    setFormCostPrice(item.costPrice != null ? String(item.costPrice) : '')
    setFormExpiryDate(item.expiryDate ?? ''); setFormFallbackCatId(item.fallbackCategoryId ?? '')
    setFormAllergyInfo(item.allergyInfo ?? '')
    setFormShelfLifeDays(item.shelfLifeDays != null ? String(item.shelfLifeDays) : '')
    setFormCanFreeze(!!item.canFreeze)
    setFormFreezerShelfLifeDays(item.freezerShelfLifeDays != null ? String(item.freezerShelfLifeDays) : '')
    setFormDensity(item.densityGramsPerMl != null ? String(item.densityGramsPerMl) : '')
    setFormCupWeight('')
    setFormWeightPerUnit(item.weightPerUnitGrams != null ? String(item.weightPerUnitGrams) : '')
    setKnownSuggestion(null); setLlmAnswer('')
    setFormImageUrls(Array.isArray(item.imageUrls) ? item.imageUrls : item.imageUrls ? [item.imageUrls as any] : [])
    setFormStorageSectionId(item.storageSectionId ?? '')
    setFormStorageNotes(item.storageNotes ?? '')
    setFormSerialNumber(item.serialNumber ?? '')
    setFormPurchaseDate(item.purchaseDate ? String(item.purchaseDate).slice(0, 10) : '')
    setFormWarrantyExpiry(item.warrantyExpiry ? String(item.warrantyExpiry).slice(0, 10) : '')
    setFormServiceIntervalDays(item.serviceIntervalDays != null ? String(item.serviceIntervalDays) : '')
    setFormLastServicedAt(item.lastServicedAt ? String(item.lastServicedAt).slice(0, 10) : '')
    setFormNextServiceAt(item.nextServiceAt ? String(item.nextServiceAt).slice(0, 10) : '')
    setFormMaintenanceNotes(item.maintenanceNotes ?? '')
    setFormSupplierId(item.supplierId ?? '')
    const itemCat = categories.find((c) => c.id === item.categoryId)
    setShowDeepFields(itemCat?.showDeepFields ?? false)
    setShowEquipmentFields(itemCat?.showEquipmentFields ?? false)
    setCatShowDeep(itemCat?.showDeepFields ?? (itemCat?.tab === 'FOOD' || itemCat?.tab === 'BEVERAGE'))
    setCatShowEquip(itemCat?.showEquipmentFields ?? (itemCat?.tab == null || itemCat?.name === 'TABLES'))
    // Fetch maintenance logs
    fetch(`/api/admin/inventory/${item.id}/logs`).then((r) => r.json()).then((logs) => {
      if (Array.isArray(logs)) setMaintLogs(logs)
    }).catch(() => {})
  }

  async function load() {
    setLoading(true)
    const venueParam = venueId ? `?venueId=${venueId}` : ''
    const [catRes, itemRes, prRes, uomRes, secRes, supRes, refRes] = await Promise.all([
      fetch(`/api/admin/inventory/categories${venueParam}`),
      fetch(`/api/admin/inventory${venueParam}`),
      fetch(`/api/admin/furniture${venueParam}`),
      fetch(`/api/admin/uoms${venueParam}`),
      fetch(`/api/admin/sections${venueParam}`),
      fetch(`/api/admin/suppliers${venueParam}`),
      fetch(`/api/admin/ingredient-references${venueParam}`),
    ])
    if (catRes.ok) setCategories(await catRes.json())
    if (itemRes.ok) setItems(await itemRes.json())
    if (prRes.ok) {
      const prs = await prRes.json()
      setProfiles(Array.isArray(prs) ? prs : [])
    }
    if (uomRes.ok) {
      const data = await uomRes.json()
      setUoms(Array.isArray(data) ? data : [])
    }
    if (secRes.ok) {
      const data = await secRes.json()
      setSections(Array.isArray(data) ? data : [])
    }
    if (supRes.ok) {
      const data = await supRes.json()
      setSuppliers(Array.isArray(data) ? data : [])
    }
    if (refRes.ok) {
      const data = await refRes.json()
      setIngredientRefs(Array.isArray(data) ? data : [])
    }
    setLoading(false)
  }

  async function loadStock() {
    setStockLoading(true)
    const r = await fetch(`/api/admin/stock/hierarchy${venueId ? `?venueId=${venueId}` : ''}`)
    if (r.ok) setStock((await r.json()).sections)
    setStockLoading(false)
  }

  async function loadDeleted() {
    const r = await fetch(`/api/admin/inventory?deleted=true${venueId ? `&venueId=${venueId}` : ''}`)
    if (r.ok) setDeletedItems(await r.json())
  }

  async function restoreItem(id: string) {
    await fetch(`/api/admin/inventory/${id}/restore`, { method: 'POST' })
    load(); loadDeleted()
  }

  async function purgeItem(id: string) {
    if (!confirm('PERMANENTLY DELETE THIS ITEM? THIS CANNOT BE UNDONE.')) return
    await fetch(`/api/admin/inventory/${id}?permanent=1`, { method: 'DELETE' })
    load(); loadDeleted()
  }

  useEffect(() => { load(); loadStock() }, [])

  // Auto-suggest a known ingredient's density when the name matches the library
  useEffect(() => {
    const name = formName.toUpperCase().trim()
    if (!name || formDensity || formCupWeight) { setKnownSuggestion(null); return }
    setKnownSuggestion(findKnownIngredient(name, ingredientRefs))
  }, [formName, ingredientRefs, formDensity, formCupWeight])

  useEffect(() => {
    if (loading) return
    setCollapsed((prev) => {
      if (prev.size > 0) return prev
      const next = new Set<string>()
      for (const cat of categories) {
        const count = catItems.get(cat.id)?.length ?? 0
        if (count === 0) next.add(cat.name)
      }
      return next
    })
  }, [loading])

  async function uploadImage(file: File) {
    setFormUploadingImg(true)
    const form = new FormData()
    form.append('file', file)
    const r = await fetch('/api/admin/upload', { method: 'POST', body: form })
    setFormUploadingImg(false)
    if (r.ok) { const data = await r.json(); setFormImageUrls((prev) => [...prev, data.url]) }
  }

  function cupWeightToDensity(v: string) {
    const g = parseFloat(v)
    return g > 0 ? cupToDensity(g) : null
  }

  function applyRef(ref: IngredientRef) {
    setFormDensity(ref.densityGramsPerMl != null ? String(ref.densityGramsPerMl) : '')
    setFormCupWeight('')
    setFormWeightPerUnit(ref.weightPerUnitGrams != null ? String(ref.weightPerUnitGrams) : '')
    setKnownSuggestion(null)
    setShowRefPicker(false)
  }

  async function saveAsReference() {
    const d = formDensity !== '' ? parseFloat(formDensity) : formCupWeight !== '' ? cupWeightToDensity(formCupWeight) : null
    if (!formName.trim() || (d == null && formWeightPerUnit === '')) return
    const r = await fetch('/api/admin/ingredient-references', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: formName.trim().toUpperCase(),
        densityGramsPerMl: d != null && isFinite(d) && d > 0 ? d : null,
        weightPerUnitGrams: formWeightPerUnit !== '' ? parseFloat(formWeightPerUnit) : null,
        notes: formCupWeight !== '' ? `1 CUP ≈ ${formCupWeight}G` : null,
        ...(venueId ? { venueId } : {}),
      }),
    })
    if (r.ok) {
      const refRes = await fetch(`/api/admin/ingredient-references${venueId ? `?venueId=${venueId}` : ''}`)
      if (refRes.ok) setIngredientRefs(await refRes.json())
    }
  }

  async function deleteReference(id: string) {
    await fetch(`/api/admin/ingredient-references?id=${id}`, { method: 'DELETE' })
    const refRes = await fetch(`/api/admin/ingredient-references${venueId ? `?venueId=${venueId}` : ''}`)
    if (refRes.ok) setIngredientRefs(await refRes.json())
  }

  async function handleSave() {
    const body: any = {
      name: (formName || 'ITEM').toUpperCase().trim(),
      categoryId: formCat || categories[0]?.id,
      unit: formUnit || 'EA',
      defaultParLevel: parseInt(formPar) || 0,
      totalQty: parseInt(formTotalQty) || 0,
      countingUnitId: formCountingUnitId || null,
      orderingUnitId: formOrderingUnitId || null,
      yieldPercentage: formYield ? parseFloat(formYield) : null,
      costPrice: formCostPrice ? parseFloat(formCostPrice) : null,
      expiryDate: formExpiryDate || null,
      fallbackCategoryId: formFallbackCatId || null,
      allergyInfo: formAllergyInfo || null,
      imageUrls: formImageUrls.length ? formImageUrls : null,
      storageSectionId: formStorageSectionId || null,
      storageNotes: formStorageNotes || null,
      serialNumber: formSerialNumber || null,
      purchaseDate: formPurchaseDate || null,
      warrantyExpiry: formWarrantyExpiry || null,
      serviceIntervalDays: formServiceIntervalDays ? parseInt(formServiceIntervalDays) : null,
      lastServicedAt: formLastServicedAt || null,
      nextServiceAt: formNextServiceAt || null,
      maintenanceNotes: formMaintenanceNotes || null,
      supplierId: formSupplierId || null,
      shelfLifeDays: formShelfLifeDays ? parseInt(formShelfLifeDays) : null,
      canFreeze: formCanFreeze,
      freezerShelfLifeDays: formFreezerShelfLifeDays ? parseInt(formFreezerShelfLifeDays) : null,
      // Density: the cup-weight helper ("1 CUP = X G") is converted to g/mL on save
      densityGramsPerMl: formDensity != null && formDensity !== '' ? parseFloat(formDensity) : (formCupWeight != null && formCupWeight !== '' ? cupWeightToDensity(formCupWeight) : null),
      weightPerUnitGrams: formWeightPerUnit != null && formWeightPerUnit !== '' ? parseFloat(formWeightPerUnit) : null,
      ...(venueId ? { venueId } : {}),
    }
    if (isCreating) {
      if (!body.name || !body.categoryId) return
      const r = await fetch('/api/admin/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) return
    } else if (selectedItem) {
      const r = await fetch(`/api/admin/inventory/${selectedItem.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) return
    }
    setSelectedItem(null); setIsCreating(false); resetForm(); load()
  }

  async function addCategory() {
    const r = await fetch('/api/admin/inventory/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newCatName, tab: activeTab === 'OTHER' ? null : activeTab, ...(venueId ? { venueId } : {}) }) })
    if (!r.ok) { const d = await r.json(); alert(d.error); return }
    setNewCatName(''); setShowNewCat(false); load()
  }

  async function deleteCategory(id: string) {
    const r = await fetch(`/api/admin/inventory/categories/${id}`, { method: 'DELETE' })
    if (!r.ok) { const d = await r.json(); alert(d.error); return }
    load()
  }

  async function deleteItem(id: string) {
    await fetch(`/api/admin/inventory/${id}`, { method: 'DELETE' })
    if (selectedItem?.id === id) { setSelectedItem(null); resetForm() }
    load()
  }

  function toggleCollapse(catName: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(catName)) { next.delete(catName) } else { next.add(catName) }
      return next
    })
  }

  function startCreate(catId: string) {
    const cat = categories.find((c) => c.id === catId)
    // Auto-expand collapsed category
    if (cat) setCollapsed((prev) => { const next = new Set(prev); next.delete(cat.name); return next })
    if (cat?.name === 'TABLES') {
      setEditProfileId(null)
      setShowTableProfile(true)
    } else {
      setSelectedItem(null); setIsCreating(true); resetForm()
      setFormCat(catId)
      setCreateCat('')
      setShowCatDropdown(false)
      setShowDeepFields(cat?.showDeepFields ?? false)
      setShowEquipmentFields(cat?.showEquipmentFields ?? false)
      setCatShowDeep(cat?.showDeepFields ?? (cat?.tab === 'FOOD' || cat?.tab === 'BEVERAGE'))
      setCatShowEquip(cat?.showEquipmentFields ?? (cat?.tab == null || cat?.name === 'TABLES'))
    }
  }

  const editingProfileName = editProfileId ? profiles.find((p) => p.id === editProfileId)?.name : null

  const tabCategories = categories.filter((c) => {
    if (activeTab === 'FOOD') return c.tab === 'FOOD'
    if (activeTab === 'BEVERAGE') return c.tab === 'BEVERAGE'
    return !c.tab || c.tab === null
  })

  const catItems = new Map<string, Item[]>()
  for (const item of items) {
    const arr = catItems.get(item.categoryId) ?? []
    arr.push(item)
    catItems.set(item.categoryId, arr)
  }

  if (loading) {
    return <div className="p-8"><p className="font-mono text-sm text-grey-light loading-cursor">LOADING</p></div>
  }

  return (
    <div className="space-y-4 pb-12">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">INVENTORY</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-grey-mid">
            {([['FOOD', 'FOOD'], ['BEVERAGE', 'BEVERAGE'], ['OTHER', 'OTHER']] as const).map(([key, label]) => (
              <button key={key} onClick={() => { setActiveTab(key); localStorage.setItem('hospo-inventory-tab', key) }}
                className={`font-mono text-[10px] uppercase px-3 py-1.5 border-r border-grey-mid last:border-r-0 ${activeTab === key ? 'bg-grey-mid/30 text-white' : 'text-grey-light hover:text-white'}`}>
                {label}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => { setEditingCat(null); setNewCatName(''); setNewCatTab('FOOD'); setShowCatModal(true) }} variant="ghost">+ CATEGORY</Button>
          <Button size="sm" onClick={() => { if (!showDeleted) loadDeleted(); setShowDeleted(!showDeleted) }} variant="ghost">{showDeleted ? 'HIDE DELETED' : 'SHOW DELETED'}</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Expandable category boxes */}
        <div className="lg:col-span-8 space-y-3">
          {/* Category selector dropdown for + ADD */}
          <div className="flex items-center gap-2 mb-2">
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <Button size="sm" variant="ghost" onClick={() => setShowCatDropdown(!showCatDropdown)}>+ ADD ITEM</Button>
              {showCatDropdown && (
                <div className="absolute top-full left-0 mt-1 z-50 border border-grey-mid bg-black p-1 min-w-[200px] shadow-lg">
                  {tabCategories.map((c) => (
                    <button key={c.id} onClick={() => startCreate(c.id)}
                      className="block w-full text-left px-3 py-1.5 font-mono text-xs uppercase text-grey-light hover:text-white hover:bg-grey-mid/30">
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {tabCategories.map((cat) => {
            const catItemList = catItems.get(cat.id) ?? []
            const isCollapsed = collapsed.has(cat.name)
            const isFurniture = cat.name === 'TABLES'
            return (
              <div key={cat.id} className="border border-grey-mid">
                <div className="flex items-center">
                  <button onClick={() => toggleCollapse(cat.name)}
                    className="flex-1 flex items-center justify-between px-3 py-2 hover:bg-grey-mid/20 text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-grey-light">{isCollapsed ? '▸' : '▾'}</span>
                      <span className="font-mono text-xs font-bold text-white uppercase">{cat.name}</span>
                      <span className="font-mono text-[10px] text-grey-light">({catItemList.length})</span>
                    </div>
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); startCreate(cat.id) }}
                    className="font-mono text-[10px] uppercase text-grey-light hover:text-white px-3 py-2 border-l border-grey-mid">
                    {isFurniture ? '+ ADD TABLE' : '+ ADD'}
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setEditingCat(cat); setNewCatName(cat.name); setNewCatTab(cat.tab ?? 'OTHER'); setShowCatModal(true) }}
                    className="font-mono text-[10px] uppercase text-[#c4a530] hover:text-white px-2 py-2 border-l border-grey-mid">
                    EDIT
                  </button>
                </div>

                {!isCollapsed && (
                  <div className="border-t border-grey-mid">
                    {catItemList.length === 0 && (
                      <p className="font-mono text-xs text-grey-light px-3 py-3">No items yet.</p>
                    )}
                    {catItemList.map((item, idx) => {
                      const isFurnitureItem = item.furnitureType != null
                      const avail = Math.max(0, (item.totalQty ?? 0) - (item.placedCount ?? 0))
                      const isEditing = selectedItem?.id === item.id || (showTableProfile && editProfileId === item.id)
                      // Furniture IS the inventory item now — matched by id, not
                      // by name. The old name match silently detached geometry
                      // from stock the moment either side was renamed.
                      const matchingProfile = isFurnitureItem ? profiles.find((p) => p.id === item.id) : null
                      const profileNumbers: string[] = matchingProfile?.tableNumbers ?? []
                      const profileCapacity = matchingProfile?.defaultChairCount ?? 0

                      return (
                        <div key={item.id}>
                          <div className={`flex items-center gap-3 py-2 px-3 ${isEditing ? 'bg-grey-mid/20' : ''}`}>
                            {isFurnitureItem && item.defaultColour && (
                              <div className="w-4 h-4 flex-shrink-0 border border-grey-light" style={{ backgroundColor: item.defaultColour }} />
                            )}
                            {Array.isArray(item.imageUrls) && item.imageUrls.length > 0 && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={item.imageUrls[0]} alt={item.name} className="w-5 h-5 object-cover border border-grey-mid flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <span className="font-mono text-xs text-white block truncate">
                                {item.name}
                                <span className="inline-block ml-1 font-mono text-[8px] text-grey-light border border-grey-mid px-1 align-middle">CUSTOM</span>
                                {item.allergyInfo && item.allergyInfo.split(',').map((a: string) => a.trim()).filter(Boolean).map((allergen: string) => (
                                  <span key={allergen} className="inline-block ml-1 font-mono text-[8px] text-[#c4a530] border border-[#c4a530] px-1 align-middle">{allergen}</span>
                                ))}
                              </span>
                              {isFurnitureItem && (
                                <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                  <span className="font-mono text-[10px] text-grey-light border border-grey-mid px-1.5 py-px">{item.elementWidth}×{item.elementDepth}</span>
                                  {(item.defaultChairCount ?? 0) > 0 && (
                                    <span className="font-mono text-[10px] text-grey-light border border-grey-mid px-1.5 py-px">{(item.defaultChairCount ?? 0)}/{profileCapacity || (item.defaultChairCount ?? 0)}</span>
                                  )}
                                  {profileNumbers.map((n: string, i: number) => (
                                    <span key={i} className="font-mono text-[10px] text-white border border-grey-mid px-1.5 py-px bg-grey-dark/50">{n}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-right flex-shrink-0">
                              <span className="font-mono text-[10px] text-grey-light w-10">QTY {item.totalQty ?? 0}</span>
                              {item.costPrice != null && (
                                <span className="font-mono text-[10px] text-grey-light w-14 text-right">${item.costPrice.toFixed(2)}</span>
                              )}
                              {isFurnitureItem && (
                                <span className={`font-mono text-[10px] w-10 ${avail > 0 ? 'text-accent' : 'text-danger'}`}>AVAIL {avail}</span>
                              )}
                              <button onClick={() => {
                                if (isFurnitureItem) {
                                  // The furniture form edits this very row.
                                  if (showTableProfile && editProfileId === item.id) {
                                    setShowTableProfile(false); setEditProfileId(null)
                                  } else {
                                    setEditProfileId(item.id); setShowTableProfile(true)
                                  }
                                } else {
                                  if (showTableProfile) { setShowTableProfile(false); setEditProfileId(null) }
                                  if (selectedItem?.id === item.id) {
                                    setSelectedItem(null); resetForm()
                                  } else {
                                    setSelectedItem(item); populateForm(item)
                                  }
                                }
                              }}
                                className="font-mono text-[10px] text-[#c4a530] border border-[#c4a530] px-1.5 py-0.5 hover:text-white hover:border-white uppercase"                                >EDIT</button>
                              <button onClick={() => deleteItem(item.id)}
                                className="font-mono text-[10px] text-danger hover:text-white border border-grey-mid px-1.5 py-0.5">DLT</button>
                            </div>
                          </div>
                          {idx < catItemList.length - 1 && (
                            <div className="mx-3 border-b border-grey-mid" />
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}

          {/* Pantry Bible — the known-ingredient density library. These are
              references for recipes (density / unit weight), not stock. */}
          <div className="border border-grey-mid">
            <div className="flex items-center">
              <button onClick={() => toggleCollapse('PANTRY BIBLE')}
                className="flex-1 flex items-center justify-between px-3 py-2 hover:bg-grey-mid/20 text-left">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-grey-light">{collapsed.has('PANTRY BIBLE') ? '▸' : '▾'}</span>
                  <span className="font-mono text-xs font-bold text-white uppercase">PANTRY BIBLE</span>
                  <span className="font-mono text-[10px] text-grey-light">({ingredientRefs.length})</span>
                </div>
              </button>
              <button onClick={() => setShowRefPicker(true)}
                className="font-mono text-[10px] uppercase text-grey-light hover:text-white px-3 py-2 border-l border-grey-mid">
                LIBRARY
              </button>
            </div>
            {!collapsed.has('PANTRY BIBLE') && (
              <div className="border-t border-grey-mid">
                <p className="font-mono text-[9px] text-grey-light px-3 pt-2">
                  KNOWN INGREDIENTS WITH DENSITY / UNIT-WEIGHT — REFERENCE VALUES FOR RECIPES, NOT STOCK.
                </p>
                {ingredientRefs.length === 0 && <p className="font-mono text-xs text-grey-light px-3 py-3">No known ingredients.</p>}
                <div className="divide-y divide-grey-mid/50 pb-1">
                  {ingredientRefs.map((r) => (
                    <div key={r.id} className="flex items-center gap-2 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <span className="font-mono text-xs text-white block truncate uppercase">
                          {r.name}
                          <span className="inline-block ml-1 font-mono text-[8px] text-[#c4a530] border border-[#c4a530] px-1 align-middle">PANTRY BIBLE</span>
                        </span>
                        <span className="block font-mono text-[9px] text-grey-light">
                          {r.notes ?? (r.densityGramsPerMl != null ? `1 CUP ≈ ${Math.round(r.densityGramsPerMl * 250)}G` : r.weightPerUnitGrams != null ? `1 EA ≈ ${r.weightPerUnitGrams}G` : '')}
                        </span>
                      </div>
                      <span className="font-mono text-[9px] text-grey-light shrink-0 uppercase">REFERENCE</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Restore deleted items */}
        {showDeleted && (
          <div className="border border-grey-mid border-dashed">
            <div className="px-3 py-2 border-b border-grey-mid font-mono text-xs font-bold text-white uppercase bg-grey-dark/50">DELETED ITEMS</div>
            {deletedItems.length === 0 ? (
              <p className="px-3 py-3 font-mono text-xs text-grey-light">No deleted items.</p>
            ) : (
              <div className="divide-y divide-grey-mid">
                {deletedItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between px-3 py-2">
                    <span className="font-mono text-xs text-grey-light line-through">{item.name}</span>
                    <div className="flex gap-2">
                      <button onClick={() => restoreItem(item.id)} className="font-mono text-[10px] text-success hover:text-white border border-grey-mid px-1.5 py-0.5">RESTORE</button>
                      <button onClick={() => purgeItem(item.id)} className="font-mono text-[10px] text-danger hover:text-white border border-grey-mid px-1.5 py-0.5">PURGE</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Right: Summary + TableProfileForm */}
        <div className="lg:col-span-4 space-y-4">
          {/* Category stock summary for FOOD/BEVERAGE */}
          {(activeTab === 'FOOD' || activeTab === 'BEVERAGE') && (
          <div className="border border-grey-mid p-4">
            <h2 className="font-mono text-xs font-bold text-white uppercase mb-3">{activeTab} SUMMARY</h2>
            {tabCategories.length === 0 ? (
              <p className="font-mono text-xs text-grey-light">No categories yet.</p>
            ) : (
              <div className="space-y-1">
          {!showDeleted && tabCategories.map((cat) => {
                  const list = catItems.get(cat.id) ?? []
                  const totalStock = list.reduce((s, i) => s + (i.totalQty ?? 0), 0)
                  return (
                    <div key={cat.id} className="flex items-center justify-between font-mono text-xs">
                      <span className="text-white uppercase w-32 truncate">{cat.name}</span>
                      <span className="text-grey-light">{list.length} ITEMS</span>
                      <span className="text-accent w-16 text-right">{totalStock}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          )}
          {activeTab === 'OTHER' && (
          <div className="border border-grey-mid p-4">
            <h2 className="font-mono text-xs font-bold text-white uppercase mb-3">INVENTORY SUMMARY</h2>
            {stockLoading && <p className="font-mono text-xs text-grey-light">LOADING...</p>}
            {!stockLoading && stock.length === 0 && <p className="font-mono text-xs text-grey-light">No stock hierarchy found. Create sections and place tables on floor plans first.</p>}
            {!stockLoading && stock.map((sec) => (
              <div key={sec.id} className="mb-2">
                <h3 className="font-mono text-[11px] font-bold text-accent uppercase">{sec.name}</h3>
                {sec.tables.length === 0 && <p className="font-mono text-[9px] text-grey-light italic ml-3">No tables in this section.</p>}
                {sec.tables.map((tbl) => (
                  <div key={tbl.id} className="ml-3 border-l border-grey-mid pl-3 py-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-white">{tbl.label}</span>
                      <span className="font-mono text-[8px] text-grey-light">{tbl.width}×{tbl.depth} cm · {tbl.planName}</span>
                    </div>
                    {tbl.inventoryItems.length === 0 && <p className="font-mono text-[8px] text-grey-light ml-2 italic">No equipment linked.</p>}
                    {tbl.inventoryItems.map((inv) => (
                      <div key={inv.id} className="flex items-center gap-2 ml-2">
                        <span className="font-mono text-[9px] text-grey-light">{inv.name}</span>
                        <span className="font-mono text-[8px] text-accent">×{inv.quantity}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
          )}

          {showTableProfile && (
            <Modal isOpen={showTableProfile} onClose={() => { setShowTableProfile(false); setEditProfileId(null) }} title={editProfileId ? 'EDIT FURNITURE' : 'NEW FURNITURE'} size="lg">
              <FurnitureForm
                furnitureId={editProfileId}
                onSaved={() => { setShowTableProfile(false); setEditProfileId(null); load() }}
                onCancel={() => { setShowTableProfile(false); setEditProfileId(null) }}
                onDeleted={() => { setShowTableProfile(false); setEditProfileId(null); load() }}
              />
            </Modal>
          )}
        </div>
      </div>

      <Modal isOpen={previewImage != null} onClose={() => setPreviewImage(null)} title="" size="lg">
        {previewImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewImage} alt="Preview" className="w-full border border-grey-mid" />
        )}
      </Modal>

      <Modal isOpen={showCatModal} onClose={() => setShowCatModal(false)} title={editingCat ? 'EDIT CATEGORY' : 'NEW CATEGORY'} size="sm">
        <div className="space-y-3">
          <Input value={newCatName} onChange={(e) => setNewCatName(e.target.value.toUpperCase())} placeholder="CATEGORY NAME" />
          <Select label="TAB" value={newCatTab} onChange={(e) => setNewCatTab(e.target.value)}
            options={[{ value: 'FOOD', label: 'FOOD' }, { value: 'BEVERAGE', label: 'BEVERAGE' }, { value: 'OTHER', label: 'OTHER' }]} />
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={!showDeepFields} onChange={(e) => setShowDeepFields(!e.target.checked)} className="accent-white" />
              <span className="font-mono text-[10px] uppercase text-grey-light">DEEP INVENTORY FIELDS</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={showEquipmentFields} onChange={(e) => setShowEquipmentFields(e.target.checked)} className="accent-white" />
              <span className="font-mono text-[10px] uppercase text-grey-light">EQUIPMENT / TOOL TRACKING</span>
            </label>
          </div>
          <div className="flex gap-2">
            <Button onClick={async () => {
              if (!newCatName) return
              if (editingCat) {
                await fetch(`/api/admin/inventory/categories/${editingCat.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newCatName, tab: newCatTab === 'OTHER' ? null : newCatTab, showDeepFields: !showDeepFields, showEquipmentFields }) })
              } else {
                await fetch('/api/admin/inventory/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newCatName, tab: newCatTab === 'OTHER' ? null : newCatTab, showDeepFields: !showDeepFields, showEquipmentFields, ...(venueId ? { venueId } : {}) }) })
              }
              setShowCatModal(false); load()
            }} disabled={!newCatName}>{editingCat ? 'SAVE' : 'CREATE'}</Button>
            <Button variant="ghost" onClick={() => setShowCatModal(false)}>CANCEL</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={selectedItem != null || isCreating} onClose={() => { setSelectedItem(null); setIsCreating(false); resetForm() }} title={isCreating ? 'NEW ITEM' : 'EDIT ITEM'} size="lg">
        <div className="space-y-3">
          <div className="grid grid-cols-6 gap-2">
            <div className="col-span-4">
              <Input label="NAME" value={formName} onChange={(e) => setFormName(e.target.value.toUpperCase())} placeholder="ITEM NAME" />
            </div>
            <div className="col-span-2">
              <Select label="CATEGORY" value={formCat} onChange={(e) => setFormCat(e.target.value)}
                options={categories.filter((c) => !selectedItem?.furnitureType || c.name === 'TABLES').map((c) => ({ value: c.id, label: c.name }))} placeholder="CATEGORY"
                disabled={!!selectedItem?.furnitureType} />
            </div>
          </div>
          <div className="grid grid-cols-6 gap-2">
            {catShowDeep ? (
              <div className="col-span-6">
                <Input label="PAR LEVEL" type="number" value={formPar} onChange={(e) => setFormPar(e.target.value)} />
              </div>
            ) : (
              <>
                <div className="col-span-2">
                  <Select label="UNIT" value={formUnit} onChange={(e) => setFormUnit(e.target.value)}
                    options={[{ value: 'EA', label: 'EA' }, { value: 'SET', label: 'SET' }, { value: 'PAIR', label: 'PAIR' }]} />
                </div>
                <div className="col-span-2">
                  <Input label="TOTAL QTY" type="number" value={formTotalQty} onChange={(e) => setFormTotalQty(e.target.value)} />
                </div>
                <div className="col-span-2">
                  <Input label="PAR LEVEL" type="number" value={formPar} onChange={(e) => setFormPar(e.target.value)} />
                </div>
              </>
            )}
          </div>
          {catShowDeep && (
            <button onClick={() => setShowDeepFields(!showDeepFields)}
              className="font-mono text-[10px] uppercase border border-grey-mid px-2 py-1 text-grey-light hover:border-white hover:text-white">
              {showDeepFields ? '▾ DEEP INVENTORY' : '▸ DEEP INVENTORY'}
            </button>
          )}
          {catShowDeep && showDeepFields && (
            <div className="grid grid-cols-6 gap-2 border-t border-grey-mid pt-3">
              <div className="col-span-2">
                <Select label="COUNTING UOM" value={formCountingUnitId} onChange={(e) => setFormCountingUnitId(e.target.value)}
                  options={uoms.map((u) => ({ value: u.id, label: u.name }))} placeholder="—" />
              </div>
              <div className="col-span-1">
                <Input label="QTY" type="number" step="0.01" value={formCountingUnitQty} onChange={(e) => setFormCountingUnitQty(e.target.value)} placeholder="1" />
              </div>
              <div className="col-span-2">
                <Select label="ORDERING UOM" value={formOrderingUnitId} onChange={(e) => setFormOrderingUnitId(e.target.value)}
                  options={uoms.map((u) => ({ value: u.id, label: u.name }))} placeholder="—" />
              </div>
              <div className="col-span-1">
                <Input label="QTY" type="number" step="0.01" value={formOrderingUnitQty} onChange={(e) => setFormOrderingUnitQty(e.target.value)} placeholder="1" />
              </div>
              <div className="col-span-2">
                <Select label="PAR LEVEL UOM" value={formParLevelUnitId} onChange={(e) => setFormParLevelUnitId(e.target.value)}
                  options={uoms.map((u) => ({ value: u.id, label: u.name }))} placeholder="—" />
              </div>
              <div className="col-span-1">
                <Input label="PAR LEVEL" type="number" value={formPar} onChange={(e) => setFormPar(e.target.value)} />
              </div>
              <div className="col-span-2">
                <Input label="YIELD %" type="number" step="0.1" value={formYield} onChange={(e) => setFormYield(e.target.value)} />
              </div>
              <div className="col-span-2">
                <Input label="COST PRICE" type="number" step="0.01" value={formCostPrice} onChange={(e) => setFormCostPrice(e.target.value)} />
              </div>
              <div className="col-span-2">
                <Input label="SHELF LIFE (DAYS)" type="number" value={formShelfLifeDays} onChange={(e) => setFormShelfLifeDays(e.target.value)} placeholder="e.g. 7" />
              </div>
              <div className="col-span-3">
                <label className="flex items-center gap-2 cursor-pointer pt-1">
                  <input type="checkbox" checked={formCanFreeze} onChange={(e) => setFormCanFreeze(e.target.checked)} className="accent-white" />
                  <span className="font-mono text-[10px] uppercase text-grey-light">CAN BE FROZEN</span>
                </label>
              </div>
              {formCanFreeze && (
                <div className="col-span-3">
                  <Input label="FREEZER SHELF LIFE (DAYS)" type="number" value={formFreezerShelfLifeDays} onChange={(e) => setFormFreezerShelfLifeDays(e.target.value)} placeholder="e.g. 90" />
                </div>
              )}
              <div className="col-span-6 border border-grey-mid p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="font-mono text-[10px] uppercase text-grey-light tracking-wider">DENSITY — CONVERTS VOLUME ↔ WEIGHT</h3>
                  <div className="flex gap-1">
                    <button onClick={() => { setRefSearch(''); setShowRefPicker(true) }}
                      className="font-mono text-[9px] uppercase border border-grey-mid px-1.5 py-0.5 text-grey-light hover:border-white hover:text-white">
                      FROM LIBRARY
                    </button>
                    <button onClick={() => { setLlmAnswer(''); setShowLlmModal(true) }}
                      className="font-mono text-[9px] uppercase border border-[#60A5FA]/50 px-1.5 py-0.5 text-[#60A5FA] hover:border-[#60A5FA] hover:text-white">
                      HELP ME FIND OUT
                    </button>
                  </div>
                </div>
                {knownSuggestion && (
                  <div className="flex items-center gap-2 border border-[#c4a530]/50 bg-[#c4a530]/10 px-2 py-1.5">
                    <span className="font-mono text-[10px] text-[#c4a530] flex-1 truncate">
                      KNOWN: {knownSuggestion.name} · {knownSuggestion.notes ?? (knownSuggestion.densityGramsPerMl != null ? `1 CUP ≈ ${Math.round(knownSuggestion.densityGramsPerMl * 250)}G` : knownSuggestion.weightPerUnitGrams != null ? `1 EA ≈ ${knownSuggestion.weightPerUnitGrams}G` : '')}
                    </span>
                    <button onClick={() => applyRef(knownSuggestion)}
                      className="font-mono text-[9px] uppercase text-white border border-[#c4a530] px-1.5 py-0.5 hover:bg-[#c4a530] hover:text-black shrink-0">
                      APPLY DENSITY?
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-1">
                    <Input label="DENSITY (G/ML)" type="number" step="0.001" value={formDensity}
                      onChange={(e) => { setFormDensity(e.target.value); if (e.target.value) setFormCupWeight('') }} placeholder="e.g. 0.528" />
                  </div>
                  <div className="col-span-1">
                    <Input label="1 CUP = ___ G" type="number" step="1" value={formCupWeight}
                      onChange={(e) => { setFormCupWeight(e.target.value); if (e.target.value) setFormDensity('') }} placeholder="e.g. 132" />
                  </div>
                  <div className="col-span-1">
                    <Input label="1 UNIT = ___ G" type="number" step="1" value={formWeightPerUnit}
                      onChange={(e) => setFormWeightPerUnit(e.target.value)} placeholder="e.g. 50 (EGG)" />
                  </div>
                </div>
                <p className="font-mono text-[9px] text-grey-light">
                  {(() => {
                    const d = formDensity !== '' ? parseFloat(formDensity) : formCupWeight !== '' ? cupWeightToDensity(formCupWeight) : null
                    if (d == null || !isFinite(d) || d <= 0) {
                      return formWeightPerUnit !== '' ? `1 EA ≈ ${parseFloat(formWeightPerUnit) || 0}G — COUNT → WEIGHT ONLY` : 'ENTER G/ML OR A CUP WEIGHT — "1 CUP FLOUR ≈ 132 G", "1 CUP SUGAR ≈ 211 G"'
                    }
                    const cupG = Math.round(d * 250)
                    const unit = formWeightPerUnit !== '' ? ` · 1 EA ≈ ${parseFloat(formWeightPerUnit) || 0}G` : ''
                    return `1 CUP ≈ ${cupG}G · 1 TBSP ≈ ${Math.round(d * 20)}G · 1 TSP ≈ ${Math.round(d * 5)}G${unit}`
                  })()}
                </p>
              </div>
              <div className="col-span-6">
                <label className="font-mono text-xs uppercase text-grey-light tracking-wider block mb-1">ALLERGENS</label>
                <div className="space-y-1.5">
                  {(() => {
                    const groups = [
                      { label: 'DAIRY', items: ['MILK'] },
                      { label: 'EGGS', items: ['EGG'] },
                      { label: 'NUTS & SEEDS', items: ['ALMOND','BRAZIL NUT','CASHEW','HAZELNUT','LUPIN','MACADAMIA','PEANUT','PECAN','PINE NUT','PISTACHIO','WALNUT'] },
                      { label: 'GRAINS', items: ['BARLEY','OATS','RYE','WHEAT'] },
                      { label: 'SEAFOOD', items: ['CRUSTACEAN','FISH','MOLLUSC'] },
                      { label: 'OTHER', items: ['SESAME','SOY','SULPHITES'] },
                    ]
                    const selected = (formAllergyInfo || '').toUpperCase().split(',').map((a: string) => a.trim()).filter(Boolean)
                    return groups.map((grp) => {
                      const visible = grp.items.filter((a) => (ALLERGENS as readonly string[]).includes(a))
                      if (visible.length === 0) return null
                      return (
                        <div key={grp.label}>
                          <div className="font-mono text-[8px] uppercase text-grey-light mb-0.5">{grp.label}</div>
                          <div className="flex flex-wrap gap-1">
                            {visible.map((a) => {
                              const on = selected.includes(a)
                              return (
                                <button key={a} type="button"
                                  onClick={() => {
                                    const next = on ? selected.filter((x: string) => x !== a) : [...selected, a]
                                    setFormAllergyInfo(next.join(', '))
                                  }}
                                  className={`font-mono text-[9px] uppercase px-1.5 py-0.5 border transition-colors ${on ? 'bg-[#c4a530]/10 text-[#c4a530] border-[#c4a530]/50' : 'bg-transparent text-grey-light border-grey-mid hover:border-white hover:text-white'}`}>
                                  {on ? '✓ ' : ''}{a}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })
                  })()}
                </div>
              </div>
            </div>
          )}
            {catShowEquip && (
              <>
                <button onClick={() => setShowEquipmentFields(!showEquipmentFields)}
                  className="font-mono text-[10px] uppercase border border-grey-mid px-2 py-1 text-grey-light hover:border-white hover:text-white">
                  {showEquipmentFields ? '▾ EQUIPMENT / TOOL TRACKING' : '▸ EQUIPMENT / TOOL TRACKING'}
                </button>
                {showEquipmentFields && (
                  <div className="border-t border-grey-mid pt-3 space-y-3" onPaste={(e) => {
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
                  <div className="flex items-center gap-2">
                    <input id="inv-img-upload" type="file" accept="image/*" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f) }} />
                    <button type="button" onClick={() => document.getElementById('inv-img-upload')?.click()}
                      className="font-mono text-[10px] uppercase border border-grey-mid px-2 py-1 text-grey-light hover:border-white hover:text-white">
                      {formUploadingImg ? 'UPLOADING_' : 'ADD PHOTO'}
                    </button>
                    <span className="font-mono text-[9px] text-grey-light/50">OR PASTE IMAGE (CTRL+V)</span>
                  </div>
                  {formImageUrls.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {formImageUrls.map((url, i) => (
                        <div key={i} className="relative group">
                          <img src={url} alt={`photo ${i + 1}`} className="h-16 w-16 object-cover border border-grey-mid cursor-pointer"
                            onClick={() => setPreviewImage(url)} />
                          <button onClick={() => setFormImageUrls((prev) => prev.filter((_, idx) => idx !== i))}
                            className="absolute -top-1 -right-1 w-4 h-4 bg-danger text-black font-mono text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-6 gap-2">
                    <div className="col-span-3">
                      <Select label="STORAGE SECTION" value={formStorageSectionId} onChange={(e) => setFormStorageSectionId(e.target.value)}
                        options={sections.map((s) => ({ value: s.id, label: `${s.department?.name ?? ''} → ${s.name}` }))} placeholder="—" />
                    </div>
                    <div className="col-span-3">
                      <Select label="SUPPLIER" value={formSupplierId} onChange={(e) => setFormSupplierId(e.target.value)}
                        options={suppliers.map((s) => ({ value: s.id, label: s.name }))} placeholder="—" />
                    </div>
                    <div className="col-span-3">
                      <Combobox label="ALT. SUPPLIERS"
                        options={suppliers.filter((s) => s.id !== formSupplierId).map((s) => ({ value: s.id, label: s.name }))}
                        selected={formAltSupplierIds}
                        onChange={setFormAltSupplierIds}
                        placeholder="Search..."
                        hideTags
                      />
                    </div>
                    <div className="col-span-6">
                      <Input label="STORAGE NOTES" value={formStorageNotes} onChange={(e) => setFormStorageNotes(e.target.value)} placeholder="TOP SHELF, ABOVE THE COFFEE STATION" />
                    </div>
                    <div className="col-span-3">
                      <Input label="SERIAL NUMBER" value={formSerialNumber} onChange={(e) => setFormSerialNumber(e.target.value)} placeholder="SN-12345" />
                    </div>
                    <div className="col-span-3">
                      <Input label="SERVICE INTERVAL (DAYS)" type="number" value={formServiceIntervalDays} onChange={(e) => setFormServiceIntervalDays(e.target.value)} placeholder="180" />
                    </div>
                    <div className="col-span-3">
                      <Input label="PURCHASE DATE" type="date" value={formPurchaseDate} onChange={(e) => setFormPurchaseDate(e.target.value)} />
                    </div>
                    <div className="col-span-3">
                      <Input label="WARRANTY (MONTHS)" type="number" value={formWarrantyMonths} onChange={(e) => {
                        setFormWarrantyMonths(e.target.value)
                        if (formPurchaseDate && e.target.value) {
                          const d = new Date(formPurchaseDate)
                          d.setMonth(d.getMonth() + parseInt(e.target.value))
                          setFormWarrantyExpiry(d.toISOString().slice(0, 10))
                        }
                      }} placeholder="e.g. 12" />
                    </div>
                    <div className="col-span-3">
                      <Input label="WARRANTY EXPIRY" type="date" value={formWarrantyExpiry} onChange={(e) => setFormWarrantyExpiry(e.target.value)} />
                    </div>
                    <div className="col-span-3">
                      <Input label="LAST SERVICED" type="date" value={formLastServicedAt} onChange={(e) => setFormLastServicedAt(e.target.value)} />
                    </div>
                    <div className="col-span-3">
                      <Input label="NEXT SERVICE" type="date" value={formNextServiceAt} onChange={(e) => setFormNextServiceAt(e.target.value)} />
                    </div>
                    <div className="col-span-6">
                      <Input label="MAINTENANCE NOTES" value={formMaintenanceNotes} onChange={(e) => setFormMaintenanceNotes(e.target.value)} placeholder="LAST OIL CHANGE: JAN 2026" />
                    </div>
                  </div>
                </div>
                )}
              </>
            )}
            {maintLogs.length > 0 && (
              <div className="border-t border-grey-mid pt-3">
                <label className="font-mono text-xs uppercase text-grey-light tracking-wider block mb-2">MAINTENANCE HISTORY</label>
                <div className="border border-grey-mid max-h-40 overflow-y-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-grey-mid bg-grey-dark/30">
                        <th className="font-mono text-[9px] uppercase text-grey-light px-2 py-1">DATE</th>
                        <th className="font-mono text-[9px] uppercase text-grey-light px-2 py-1">BY</th>
                        <th className="font-mono text-[9px] uppercase text-grey-light px-2 py-1">NOTE</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-grey-mid/30">
                      {maintLogs.map((l) => (
                        <tr key={l.id}>
                          <td className="font-mono text-[9px] text-white px-2 py-1 whitespace-nowrap">{String(l.createdAt).slice(0, 10)}</td>
                          <td className="font-mono text-[9px] text-grey-light px-2 py-1 whitespace-nowrap">{l.staffName || '—'}</td>
                          <td className="font-mono text-[9px] text-white px-2 py-1">{l.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={!formName || !formCat}>{isCreating ? 'CREATE' : 'SAVE'}</Button>
              <Button variant="ghost" onClick={() => { setSelectedItem(null); setIsCreating(false); resetForm() }}>CANCEL</Button>
          </div>
        </div>
      </Modal>

      {/* Known-ingredient library picker */}
      <Modal isOpen={showRefPicker} onClose={() => setShowRefPicker(false)} title="KNOWN INGREDIENTS" size="md">
        <div className="space-y-3">
          <Input value={refSearch} onChange={(e) => setRefSearch(e.target.value.toUpperCase())} placeholder="SEARCH LIBRARY..." />
          <div className="max-h-[40vh] overflow-y-auto divide-y divide-grey-mid/50 border border-grey-mid">
            {ingredientRefs.filter((r) => !refSearch || r.name.includes(refSearch)).map((r) => (
              <div key={r.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-grey-dark/40">
                <button onClick={() => applyRef(r)} className="flex-1 min-w-0 text-left">
                  <span className="block font-mono text-xs uppercase text-white truncate">{r.name}</span>
                  <span className="block font-mono text-[9px] text-grey-light">{r.notes ?? (r.densityGramsPerMl != null ? `1 CUP ≈ ${Math.round(r.densityGramsPerMl * 250)}G` : r.weightPerUnitGrams != null ? `1 EA ≈ ${r.weightPerUnitGrams}G` : '')}</span>
                </button>
                {!r.isBuiltIn && (
                  <button onClick={() => deleteReference(r.id)} className="font-mono text-xs text-grey-light hover:text-danger shrink-0">✕</button>
                )}
              </div>
            ))}
            {ingredientRefs.length === 0 && <p className="font-mono text-xs text-grey-light px-2 py-2">LIBRARY EMPTY.</p>}
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-[9px] text-grey-light flex-1">CLICK A ROW TO APPLY ITS DENSITY TO THIS ITEM.</p>
            <Button size="sm" onClick={saveAsReference} disabled={!formName.trim() || (formDensity === '' && formCupWeight === '' && formWeightPerUnit === '')}>
              + SAVE CURRENT AS REFERENCE
            </Button>
          </div>
        </div>
      </Modal>

      {/* LLM density helper */}
      <Modal isOpen={showLlmModal} onClose={() => setShowLlmModal(false)} title="FIND THE DENSITY" size="lg">
        <div className="space-y-3">
          <p className="font-mono text-[10px] text-grey-light leading-relaxed">
            COPY THE PROMPT BELOW INTO ANY LLM (CHATGPT, CLAUDE, GEMINI...). IT ASKS
            FOR THE DENSITY OF &quot;{formName.toUpperCase().trim() || 'THIS ITEM'}&quot; — PASTE THE ANSWER BACK
            AND WE WILL FILL IN THE DENSITY FIELD.
          </p>
          <textarea readOnly value={buildDensityPrompt({ itemName: formName.toUpperCase().trim() || 'THIS ITEM' })}
            onFocus={(e) => e.target.select()}
            rows={10}
            className="w-full bg-black border border-grey-mid text-white font-mono text-[10px] px-3 py-2 outline-none focus:border-white resize-y" />
          <Button size="sm" onClick={async () => {
            try { await navigator.clipboard.writeText(buildDensityPrompt({ itemName: formName.toUpperCase().trim() || 'THIS ITEM' })) } catch { /* clipboard unavailable */ }
          }}>COPY PROMPT</Button>
          <div>
            <label className="font-mono text-[10px] uppercase text-grey-light block mb-1">PASTE THE LLM&apos;S ANSWER HERE</label>
            <textarea value={llmAnswer} onChange={(e) => setLlmAnswer(e.target.value)}
              rows={6}
              placeholder={'DENSITY: 0.528 g/mL (ESTIMATE)\n1 CUP: 132 g\n...'}
              className="w-full bg-black border border-grey-mid text-white font-mono text-[10px] px-3 py-2 outline-none focus:border-white placeholder:text-grey-light resize-y" />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => {
              const d = parseDensityFromAnswer(llmAnswer)
              if (d != null) {
                setFormDensity(String(d)); setFormCupWeight(''); setLlmAnswer(''); setShowLlmModal(false)
              } else {
                alert('COULD NOT FIND A DENSITY (G/ML) IN THE ANSWER — TRY AGAIN OR ENTER IT MANUALLY.')
              }
            }}>APPLY DENSITY</Button>
            <Button variant="ghost" size="sm" onClick={() => setShowLlmModal(false)}>CLOSE</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
