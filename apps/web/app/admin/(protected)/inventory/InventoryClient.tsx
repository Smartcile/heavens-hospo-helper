'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { TableProfileForm } from '@/components/admin/TableProfileForm'

interface Category { id: string; name: string; isBuiltIn: boolean; venueId: string | null; tab: string | null }
interface Item {
  id: string; name: string; categoryId: string; unit: string; defaultParLevel: number; totalQty: number; placedCount: number; category: Category
  furnitureType?: string | null; elementWidth?: number | null; elementDepth?: number | null
  elementShape?: string | null; defaultColour?: string | null; defaultChairCount?: number
  countingUnitId?: string | null; orderingUnitId?: string | null; yieldPercentage?: number | null; costPrice?: number | null; expiryDate?: string | null; fallbackCategoryId?: string | null; allergyInfo?: string | null
  // Equipment / tool tracking
  imageUrl?: string | null; storageSectionId?: string | null; storageNotes?: string | null
  serialNumber?: string | null; purchaseDate?: string | null; warrantyExpiry?: string | null
  serviceIntervalDays?: number | null; lastServicedAt?: string | null; nextServiceAt?: string | null
  maintenanceNotes?: string | null; supplierId?: string | null
}
interface Uom { id: string; name: string; baseUnit: string }
interface SectionLite { id: string; name: string; department: { id: string; name: string } }
interface SupplierLite { id: string; name: string }

interface StockItem { id: string; name: string; quantity: number; unit: string }
interface StockTable { id: string; label: string; width: number; depth: number; planName: string; planId: string; inventoryItems: StockItem[] }
interface StockSection { id: string; name: string; tables: StockTable[] }

export function InventoryClient() {
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [stock, setStock] = useState<StockSection[]>([])
  const [stockLoading, setStockLoading] = useState(false)
  const [showNewCat, setShowNewCat] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [showCatDropdown, setShowCatDropdown] = useState(false)
  const [activeTab, setActiveTab] = useState<'FOOD' | 'BEVERAGE' | 'OTHER'>('OTHER')
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

  // Equipment / tool tracking
  const [formImageUrl, setFormImageUrl] = useState('')
  const [formStorageSectionId, setFormStorageSectionId] = useState('')
  const [formStorageNotes, setFormStorageNotes] = useState('')
  const [formSerialNumber, setFormSerialNumber] = useState('')
  const [formPurchaseDate, setFormPurchaseDate] = useState('')
  const [formWarrantyExpiry, setFormWarrantyExpiry] = useState('')
  const [formServiceIntervalDays, setFormServiceIntervalDays] = useState('')
  const [formLastServicedAt, setFormLastServicedAt] = useState('')
  const [formNextServiceAt, setFormNextServiceAt] = useState('')
  const [formMaintenanceNotes, setFormMaintenanceNotes] = useState('')
  const [formSupplierId, setFormSupplierId] = useState('')
  const [showEquipmentFields, setShowEquipmentFields] = useState(false)
  const [formUploadingImg, setFormUploadingImg] = useState(false)
  const [sections, setSections] = useState<SectionLite[]>([])
  const [suppliers, setSuppliers] = useState<SupplierLite[]>([])

  // Table profile editor
  const [showTableProfile, setShowTableProfile] = useState(false)
  const [editProfileId, setEditProfileId] = useState<string | null>(null)
  const [profiles, setProfiles] = useState<any[]>([])

  function resetForm() {
    setFormName(''); setFormCat(''); setFormUnit('EA'); setFormPar('0'); setFormTotalQty('0')
    setFormCountingUnitId(''); setFormOrderingUnitId(''); setFormYield(''); setFormCostPrice('')
    setFormExpiryDate(''); setFormFallbackCatId(''); setFormAllergyInfo(''); setShowDeepFields(true)
    setFormImageUrl(''); setFormStorageSectionId(''); setFormStorageNotes('')
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
    setFormImageUrl(item.imageUrl ?? '')
    setFormStorageSectionId(item.storageSectionId ?? '')
    setFormStorageNotes(item.storageNotes ?? '')
    setFormSerialNumber(item.serialNumber ?? '')
    setFormPurchaseDate(item.purchaseDate ?? '')
    setFormWarrantyExpiry(item.warrantyExpiry ?? '')
    setFormServiceIntervalDays(item.serviceIntervalDays != null ? String(item.serviceIntervalDays) : '')
    setFormLastServicedAt(item.lastServicedAt ?? '')
    setFormNextServiceAt(item.nextServiceAt ?? '')
    setFormMaintenanceNotes(item.maintenanceNotes ?? '')
    setFormSupplierId(item.supplierId ?? '')
    setShowEquipmentFields(!!(item.imageUrl || item.storageSectionId || item.storageNotes || item.serialNumber || item.supplierId))
  }

  async function load() {
    setLoading(true)
    const [catRes, itemRes, prRes, uomRes, secRes, supRes] = await Promise.all([
      fetch('/api/admin/inventory/categories'),
      fetch('/api/admin/inventory'),
      fetch('/api/admin/table-profiles'),
      fetch('/api/admin/uoms'),
      fetch('/api/admin/sections'),
      fetch('/api/admin/suppliers'),
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
    setLoading(false)
  }

  async function loadStock() {
    setStockLoading(true)
    const r = await fetch('/api/admin/stock/hierarchy')
    if (r.ok) setStock((await r.json()).sections)
    setStockLoading(false)
  }

  useEffect(() => { load(); loadStock() }, [])

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
    if (r.ok) { const data = await r.json(); setFormImageUrl(data.url) }
  }

  function renderEquipmentFields() {
    return (
      <>
        <button onClick={() => setShowEquipmentFields(!showEquipmentFields)}
          className="font-mono text-[10px] uppercase text-grey-light hover:text-white text-left">
          {showEquipmentFields ? '▾ EQUIPMENT / TOOL TRACKING' : '▸ EQUIPMENT / TOOL TRACKING'}
        </button>
        {showEquipmentFields && (
          <div className="border-t border-grey-mid pt-3 space-y-3">
            <div className="flex items-center gap-2">
              <input ref={(el) => { if (el) el.style.display = 'none' }} id="inv-img-upload" type="file" accept="image/*"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f) }}
                className="hidden" />
              <button type="button" onClick={() => document.getElementById('inv-img-upload')?.click()}
                className="font-mono text-[10px] uppercase border border-grey-mid px-2 py-1 text-grey-light hover:border-white hover:text-white">
                {formUploadingImg ? 'UPLOADING_' : formImageUrl ? 'REPLACE PHOTO' : 'ADD PHOTO'}
              </button>
              {formImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={formImageUrl} alt="preview" className="h-10 w-10 object-cover border border-grey-mid" />
              )}
            </div>
            <div className="grid grid-cols-6 gap-2">
              <div className="col-span-3">
                <Select label="STORAGE SECTION" value={formStorageSectionId} onChange={(e) => setFormStorageSectionId(e.target.value)}
                  options={sections.map((s) => ({ value: s.id, label: `${s.department?.name ?? ''} → ${s.name}` }))} placeholder="—" />
              </div>
              <div className="col-span-3">
                <Select label="SUPPLIER" value={formSupplierId} onChange={(e) => setFormSupplierId(e.target.value)}
                  options={suppliers.map((s) => ({ value: s.id, label: s.name }))} placeholder="—" />
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
    )
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
      imageUrl: formImageUrl || null,
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
    const r = await fetch('/api/admin/inventory/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newCatName, tab: activeTab === 'OTHER' ? null : activeTab }) })
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
    if (cat?.name === 'FURNITURE') {
      setEditProfileId(null)
      setShowTableProfile(true)
    } else {
      setSelectedItem(null); setIsCreating(true); resetForm()
      setFormCat(catId)
      setCreateCat('')
      setShowCatDropdown(false)
    }
  }

  const editingProfileName = editProfileId ? profiles.find((p: any) => p.id === editProfileId)?.name : null

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
              <button key={key} onClick={() => setActiveTab(key)}
                className={`font-mono text-[10px] uppercase px-3 py-1.5 border-r border-grey-mid last:border-r-0 ${activeTab === key ? 'bg-grey-mid/30 text-white' : 'text-grey-light hover:text-white'}`}>
                {label}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => setShowNewCat(!showNewCat)} variant="ghost">+ CATEGORY</Button>
        </div>
      </div>

      {showNewCat && (
        <div className="border border-grey-mid p-4 flex gap-2 items-center flex-wrap">
          <Input value={newCatName} onChange={(e) => setNewCatName(e.target.value.toUpperCase())} placeholder="CATEGORY NAME" className="flex-1 min-w-[200px]" />
          <select value={newCatTab} onChange={(e) => setNewCatTab(e.target.value)}
            className="bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-hidden">
            <option value="FOOD">FOOD TAB</option>
            <option value="BEVERAGE">BEVERAGE TAB</option>
            <option value="OTHER">OTHER TAB</option>
          </select>
          <Button size="sm" onClick={addCategory} disabled={!newCatName}>CREATE</Button>
          <Button size="sm" variant="ghost" onClick={() => setShowNewCat(false)}>CANCEL</Button>
        </div>
      )}

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

          {/* Inline create form — appears at top when adding */}
          {isCreating && (
            <div className="border border-grey-mid bg-grey-dark p-4 space-y-3 mb-3">
              <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">NEW ITEM</h3>
              <div className="grid grid-cols-6 gap-2">
                <div className="col-span-4">
                  <Input label="NAME" value={formName} onChange={(e) => setFormName(e.target.value.toUpperCase())} placeholder="ITEM NAME" />
                </div>
                <div className="col-span-2">
                  <Select label="CATEGORY" value={formCat} onChange={(e) => setFormCat(e.target.value)}
                    options={tabCategories.map((c) => ({ value: c.id, label: c.name }))} />
                </div>
              </div>
              <div className="grid grid-cols-6 gap-2">
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
              </div>
              <button onClick={() => setShowDeepFields(!showDeepFields)}
                className="font-mono text-[10px] uppercase text-grey-light hover:text-white text-left">
                {showDeepFields ? '▾ DEEP INVENTORY' : '▸ DEEP INVENTORY'}
              </button>
              {showDeepFields && (
                <div className="grid grid-cols-6 gap-2 border-t border-grey-mid pt-3">
                  <div className="col-span-3">
                    <Select label="COUNTING UOM" value={formCountingUnitId} onChange={(e) => setFormCountingUnitId(e.target.value)}
                      options={uoms.map((u) => ({ value: u.id, label: u.name }))} placeholder="—" />
                  </div>
                  <div className="col-span-3">
                    <Select label="ORDERING UOM" value={formOrderingUnitId} onChange={(e) => setFormOrderingUnitId(e.target.value)}
                      options={uoms.map((u) => ({ value: u.id, label: u.name }))} placeholder="—" />
                  </div>
                  <div className="col-span-2">
                    <Input label="YIELD %" type="number" step="0.1" value={formYield} onChange={(e) => setFormYield(e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <Input label="COST PRICE" type="number" step="0.01" value={formCostPrice} onChange={(e) => setFormCostPrice(e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <Input label="EXPIRY DATE" type="date" value={formExpiryDate} onChange={(e) => setFormExpiryDate(e.target.value)} />
                  </div>
                  <div className="col-span-3">
                    <Select label="FALLBACK CATEGORY" value={formFallbackCatId} onChange={(e) => setFormFallbackCatId(e.target.value)}
                      options={categories.map((c) => ({ value: c.id, label: c.name }))} placeholder="—" />
                  </div>
              <div className="col-span-3">
                <Input label="ALLERGENS" value={formAllergyInfo} onChange={(e) => setFormAllergyInfo(e.target.value.toUpperCase())} placeholder="GLUTEN, DAIRY, NUTS" />
              </div>
            </div>
              )}
              {renderEquipmentFields()}
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSave} disabled={!formName || !formCat}>CREATE</Button>
                <Button size="sm" variant="ghost" onClick={() => { setIsCreating(false); resetForm() }}>CANCEL</Button>
              </div>
            </div>
          )}

          {tabCategories.map((cat) => {
            const catItemList = catItems.get(cat.id) ?? []
            const isCollapsed = collapsed.has(cat.name)
            const isFurniture = cat.name === 'FURNITURE'
            return (
              <div key={cat.id} className="border border-grey-mid">
                <button onClick={() => toggleCollapse(cat.name)}
                  className="w-full flex items-center justify-between px-3 py-2 hover:bg-grey-mid/20">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-grey-light">{isCollapsed ? '▸' : '▾'}</span>
                    <span className="font-mono text-xs font-bold text-white uppercase">{cat.name}</span>
                    <span className="font-mono text-[10px] text-grey-light">({catItemList.length})</span>
                  </div>
                  <span className="font-mono text-[10px] text-grey-light uppercase">
                    {isFurniture ? '+ ADD TABLE' : '+ ADD'}
                  </span>
                </button>

                {!isCollapsed && (
                  <div className="border-t border-grey-mid">
                    {catItemList.length === 0 && (
                      <p className="font-mono text-xs text-grey-light px-3 py-3">No items yet.</p>
                    )}
                    {catItemList.map((item, idx) => {
                      const isFurnitureItem = item.furnitureType != null
                      const avail = Math.max(0, (item.totalQty ?? 0) - (item.placedCount ?? 0))
                      const isEditing = selectedItem?.id === item.id || (showTableProfile && editingProfileName === item.name)
                      const matchingProfile = isFurnitureItem ? profiles.find((p: any) => p.name === item.name) : null
                      const profileNumbers: string[] = Array.isArray((matchingProfile as any)?.tableNumbers) ? (matchingProfile as any).tableNumbers : []
                      const profileCapacity = (matchingProfile as any)?.capacity ?? 0

                      return (
                        <div key={item.id}>
                          <div className={`flex items-center gap-3 py-2 px-3 ${isEditing ? 'bg-grey-mid/20' : ''}`}>
                            {isFurnitureItem && item.defaultColour && (
                              <div className="w-4 h-4 flex-shrink-0 border border-grey-light" style={{ backgroundColor: item.defaultColour }} />
                            )}
                            <div className="flex-1 min-w-0">
                              <span className="font-mono text-xs text-white block truncate">
                                {item.name}
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
                                  const profile = profiles.find((p: any) => p.name === item.name)
                                  if (profile) {
                                    if (showTableProfile && editProfileId === profile.id) {
                                      setShowTableProfile(false); setEditProfileId(null)
                                    } else {
                                      setEditProfileId(profile.id); setShowTableProfile(true)
                                    }
                                  } else {
                                    setSelectedItem(item); populateForm(item)
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

                    {/* Inline create form for non-furniture categories */}
                    {isCreating && formCat === cat.id && !isFurniture && (
                      <div className="border-t border-grey-mid bg-grey-dark p-4 space-y-3">
                        <div className="grid grid-cols-6 gap-2">
                          <div className="col-span-4">
                            <Input label="NAME" value={formName} onChange={(e) => setFormName(e.target.value.toUpperCase())} placeholder="ITEM NAME" />
                          </div>
                          <div className="col-span-2">
                            <Select label="CATEGORY" value={formCat} onChange={(e) => setFormCat(e.target.value)}
                              options={categories.map((c) => ({ value: c.id, label: c.name }))} />
                          </div>
                        </div>
                        <div className="grid grid-cols-6 gap-2">
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
                        </div>
                        <button onClick={() => setShowDeepFields(!showDeepFields)}
                          className="font-mono text-[10px] uppercase text-grey-light hover:text-white text-left">
                          {showDeepFields ? '▾ DEEP INVENTORY' : '▸ DEEP INVENTORY'}
                        </button>
                        {showDeepFields && (
                          <div className="grid grid-cols-6 gap-2 border-t border-grey-mid pt-3">
                            <div className="col-span-3">
                              <Select label="COUNTING UOM" value={formCountingUnitId} onChange={(e) => setFormCountingUnitId(e.target.value)}
                                options={uoms.map((u) => ({ value: u.id, label: u.name }))} placeholder="—" />
                            </div>
                            <div className="col-span-3">
                              <Select label="ORDERING UOM" value={formOrderingUnitId} onChange={(e) => setFormOrderingUnitId(e.target.value)}
                                options={uoms.map((u) => ({ value: u.id, label: u.name }))} placeholder="—" />
                            </div>
                            <div className="col-span-2">
                              <Input label="YIELD %" type="number" step="0.1" value={formYield} onChange={(e) => setFormYield(e.target.value)} />
                            </div>
                            <div className="col-span-2">
                              <Input label="COST PRICE" type="number" step="0.01" value={formCostPrice} onChange={(e) => setFormCostPrice(e.target.value)} />
                            </div>
                            <div className="col-span-2">
                              <Input label="EXPIRY DATE" type="date" value={formExpiryDate} onChange={(e) => setFormExpiryDate(e.target.value)} />
                            </div>
                        <div className="col-span-3">
                          <Select label="FALLBACK CATEGORY" value={formFallbackCatId} onChange={(e) => setFormFallbackCatId(e.target.value)}
                            options={categories.map((c) => ({ value: c.id, label: c.name }))} placeholder="—" />
                        </div>
                      </div>
                        )}
                        {renderEquipmentFields()}
                        <div className="flex gap-2">
                          <Button size="sm" onClick={handleSave} disabled={!formName || !formCat}>CREATE</Button>
                          <Button size="sm" variant="ghost" onClick={() => { setIsCreating(false); resetForm() }}>CANCEL</Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

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
                {tabCategories.map((cat) => {
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
            <div className="border border-grey-mid p-4">
              <TableProfileForm
                onSaved={() => { setShowTableProfile(false); setEditProfileId(null); load() }}
                onCancel={() => { setShowTableProfile(false); setEditProfileId(null) }}
                profileId={editProfileId}
                onDelete={async () => {
                  if (editProfileId) {
                    await fetch(`/api/admin/table-profiles/${editProfileId}`, { method: 'DELETE' })
                    setShowTableProfile(false); setEditProfileId(null); load()
                  }
                }}
              />
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={selectedItem != null} onClose={() => { setSelectedItem(null); resetForm() }} title="EDIT ITEM" size="lg">
        <div className="space-y-3">
          <div className="grid grid-cols-6 gap-2">
            <div className="col-span-4">
              <Input label="NAME" value={formName} onChange={(e) => setFormName(e.target.value.toUpperCase())} placeholder="ITEM NAME" />
            </div>
            <div className="col-span-2">
              <Select label="CATEGORY" value={formCat} onChange={(e) => setFormCat(e.target.value)}
                options={categories.map((c) => ({ value: c.id, label: c.name }))} placeholder="CATEGORY" />
            </div>
          </div>
          <div className="grid grid-cols-6 gap-2">
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
          </div>
          <button onClick={() => setShowDeepFields(!showDeepFields)}
            className="font-mono text-[10px] uppercase text-grey-light hover:text-white">
            {showDeepFields ? '▾ DEEP INVENTORY' : '▸ DEEP INVENTORY'}
          </button>
          {showDeepFields && (
            <div className="grid grid-cols-6 gap-2 border-t border-grey-mid pt-3">
              <div className="col-span-3">
                <Select label="COUNTING UOM" value={formCountingUnitId} onChange={(e) => setFormCountingUnitId(e.target.value)}
                  options={uoms.map((u) => ({ value: u.id, label: u.name }))} placeholder="—" />
              </div>
              <div className="col-span-3">
                <Select label="ORDERING UOM" value={formOrderingUnitId} onChange={(e) => setFormOrderingUnitId(e.target.value)}
                  options={uoms.map((u) => ({ value: u.id, label: u.name }))} placeholder="—" />
              </div>
              <div className="col-span-2">
                <Input label="YIELD %" type="number" step="0.1" value={formYield} onChange={(e) => setFormYield(e.target.value)} />
              </div>
              <div className="col-span-2">
                <Input label="COST PRICE" type="number" step="0.01" value={formCostPrice} onChange={(e) => setFormCostPrice(e.target.value)} />
              </div>
              <div className="col-span-2">
                <Input label="EXPIRY DATE" type="date" value={formExpiryDate} onChange={(e) => setFormExpiryDate(e.target.value)} />
              </div>
              <div className="col-span-3">
                <Select label="FALLBACK CATEGORY" value={formFallbackCatId} onChange={(e) => setFormFallbackCatId(e.target.value)}
                  options={categories.map((c) => ({ value: c.id, label: c.name }))} placeholder="—" />
              </div>
          <div className="col-span-3">
            <Input label="ALLERGENS" value={formAllergyInfo} onChange={(e) => setFormAllergyInfo(e.target.value.toUpperCase())} placeholder="GLUTEN, DAIRY, NUTS" />
          </div>
        </div>
            )}
            {renderEquipmentFields()}
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={!formName || !formCat}>SAVE</Button>
              <Button variant="ghost" onClick={() => { setSelectedItem(null); resetForm() }}>CANCEL</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
