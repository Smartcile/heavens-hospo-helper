'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'

interface Category { id: string; name: string; isBuiltIn: boolean; venueId: string | null }
interface Item {
  id: string; name: string; categoryId: string; unit: string; defaultParLevel: number; totalQty: number; category: Category
  furnitureType?: string | null; elementWidth?: number | null; elementDepth?: number | null
  elementShape?: string | null; defaultColour?: string | null; defaultChairCount?: number
}

interface StockItem { id: string; name: string; quantity: number; unit: string }
interface StockTable { id: string; label: string; width: number; depth: number; planName: string; planId: string; inventoryItems: StockItem[] }
interface StockSection { id: string; name: string; tables: StockTable[] }

export function InventoryClient() {
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [stock, setStock] = useState<StockSection[]>([])
  const [stockLoading, setStockLoading] = useState(false)
  const [filterCat, setFilterCat] = useState('')
  const [showNewCat, setShowNewCat] = useState(false)
  const [newCatName, setNewCatName] = useState('')

  // Property editor state
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [formName, setFormName] = useState('')
  const [formCat, setFormCat] = useState('')
  const [formUnit, setFormUnit] = useState('EA')
  const [formPar, setFormPar] = useState('0')
  const [formTotalQty, setFormTotalQty] = useState('0')
  const [formFurnitureType, setFormFurnitureType] = useState('')
  const [formElemW, setFormElemW] = useState('80')
  const [formElemD, setFormElemD] = useState('80')
  const [formElemShape, setFormElemShape] = useState('RECTANGLE')
  const [formDefaultColour, setFormDefaultColour] = useState('#555')
  const [formChairCount, setFormChairCount] = useState('0')

  function resetForm() {
    setFormName(''); setFormCat(''); setFormUnit('EA'); setFormPar('0'); setFormTotalQty('0')
    setFormFurnitureType(''); setFormElemW('80'); setFormElemD('80'); setFormElemShape('RECTANGLE')
    setFormDefaultColour('#555'); setFormChairCount('0')
  }

  function populateForm(item: Item) {
    setFormName(item.name); setFormCat(item.categoryId); setFormUnit(item.unit)
    setFormPar((item.defaultParLevel ?? 0).toString()); setFormTotalQty((item.totalQty ?? 0).toString())
    setFormFurnitureType(item.furnitureType ?? '')
    setFormElemW((item.elementWidth ?? 80).toString()); setFormElemD((item.elementDepth ?? 80).toString())
    setFormElemShape(item.elementShape ?? 'RECTANGLE'); setFormDefaultColour(item.defaultColour ?? '#555')
    setFormChairCount((item.defaultChairCount ?? 0).toString())
  }

  async function load() {
    setLoading(true)
    const [catRes, itemRes] = await Promise.all([
      fetch('/api/admin/inventory/categories'),
      fetch('/api/admin/inventory'),
    ])
    if (catRes.ok) setCategories(await catRes.json())
    if (itemRes.ok) setItems(await itemRes.json())
    setLoading(false)
  }

  async function loadStock() {
    setStockLoading(true)
    const r = await fetch('/api/admin/stock/hierarchy')
    if (r.ok) setStock((await r.json()).sections)
    setStockLoading(false)
  }

  useEffect(() => { load(); loadStock() }, [])

  async function handleSave() {
    const cat = categories.find((c) => c.id === formCat)
    const body: any = {
      name: (formName || 'ITEM').toUpperCase().trim(),
      categoryId: formCat || categories[0]?.id,
      unit: formUnit || 'EA',
      defaultParLevel: parseInt(formPar) || 0,
      totalQty: parseInt(formTotalQty) || 0,
    }
    if (cat?.name === 'FURNITURE') {
      body.furnitureType = formFurnitureType || null
      body.elementWidth = parseFloat(formElemW) || null
      body.elementDepth = parseFloat(formElemD) || null
      body.elementShape = formElemShape || null
      body.defaultColour = formDefaultColour || null
      body.defaultChairCount = parseInt(formChairCount) || 0
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
    const r = await fetch('/api/admin/inventory/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newCatName }) })
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
    if (selectedItem?.id === id) { setSelectedItem(null); setIsCreating(false); resetForm() }
    load()
  }

  const filtered = filterCat ? items.filter((i) => i.categoryId === filterCat) : items
  const formCategory = categories.find((c) => c.id === formCat)

  if (loading) {
    return <div className="p-8"><p className="font-mono text-sm text-grey-light loading-cursor">LOADING</p></div>
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">INVENTORY</h1>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setShowNewCat(!showNewCat)} variant="ghost">+ CATEGORY</Button>
        </div>
      </div>

      {showNewCat && (
        <div className="border border-grey-mid p-4 flex gap-2">
          <Input value={newCatName} onChange={(e) => setNewCatName(e.target.value.toUpperCase())} placeholder="CATEGORY NAME" className="flex-1" />
          <Button size="sm" onClick={addCategory} disabled={!newCatName}>CREATE</Button>
          <Button size="sm" variant="ghost" onClick={() => setShowNewCat(false)}>CANCEL</Button>
        </div>
      )}

      {/* Two-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Stock Hierarchy Tree */}
        <div className="lg:col-span-5">
          <div className="border border-grey-mid p-4 h-full">
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
        </div>

        {/* Right: Item List + Property Editor */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          {/* Top: Item List */}
          <div className="border border-grey-mid p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-mono text-xs font-bold text-white uppercase">STANDARD STOCK</h2>
              <div className="flex items-center gap-2">
                <Select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}
                  options={categories.map((c) => ({ value: c.id, label: c.name }))} placeholder="ALL CATEGORIES" />
                <Button size="sm" onClick={() => { setSelectedItem(null); setIsCreating(true); resetForm() }}>+ ADD ITEM</Button>
              </div>
            </div>
            <div className="space-y-0">
              {filtered.length === 0 && <p className="font-mono text-xs text-grey-light py-2">No items yet.</p>}
              {filtered.map((item) => {
                const isFurniture = item.furnitureType != null
                return (
                  <div key={item.id} className={`flex items-center gap-3 py-2 border-b border-grey-mid last:border-0 ${selectedItem?.id === item.id ? 'bg-grey-mid/20 -mx-4 px-4' : ''}`}>
                    {isFurniture && item.defaultColour && (
                      <div className="w-4 h-4 flex-shrink-0 border border-grey-light" style={{ backgroundColor: item.defaultColour }} />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-xs text-white block truncate">{item.name}</span>
                      <span className="font-mono text-[10px] text-grey-light">{item.category.name}</span>
                      {isFurniture && (
                        <span className="font-mono text-[10px] text-accent ml-2">
                          {item.furnitureType} {item.elementWidth}×{item.elementDepth}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-right flex-shrink-0">
                      <span className="font-mono text-[10px] text-grey-light w-12">QTY: {item.totalQty ?? 0}</span>
                      {isFurniture && <span className="font-mono text-[10px] text-accent w-12">AVAIL: {item.totalQty ?? 0}</span>}
                      <button onClick={() => { setSelectedItem(item); setIsCreating(false); populateForm(item) }}
                        className="font-mono text-[10px] text-grey-light hover:text-white uppercase">E</button>
                      <button onClick={() => deleteItem(item.id)}
                        className="font-mono text-[10px] text-danger hover:text-white">D</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Bottom: Property Editor */}
          <div className="border border-grey-mid p-4">
            <h2 className="font-mono text-xs font-bold text-white uppercase mb-3">PROPERTIES</h2>

            {!selectedItem && !isCreating ? (
              <p className="font-mono text-xs text-grey-light italic">SELECT AN ITEM TO EDIT PROPERTIES</p>
            ) : (
              <div className="space-y-3">
                <Input label="NAME" value={formName} onChange={(e) => setFormName(e.target.value.toUpperCase())} placeholder="ITEM NAME" />
                <div className="grid grid-cols-3 gap-2">
                  <Select label="CATEGORY" value={formCat} onChange={(e) => setFormCat(e.target.value)}
                    options={categories.map((c) => ({ value: c.id, label: c.name }))} placeholder="CATEGORY" />
                  <Select label="UNIT" value={formUnit} onChange={(e) => setFormUnit(e.target.value)}
                    options={[{ value: 'EA', label: 'EA' }, { value: 'SET', label: 'SET' }, { value: 'PAIR', label: 'PAIR' }]} />
                  <Input label="TOTAL QTY" type="number" value={formTotalQty} onChange={(e) => setFormTotalQty(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input label="PAR LEVEL" type="number" value={formPar} onChange={(e) => setFormPar(e.target.value)} />
                </div>

                {formCategory?.name === 'FURNITURE' && (
                  <div className="border-t border-grey-mid pt-3 space-y-2">
                    <p className="font-mono text-[10px] text-grey-light uppercase">Furniture Template</p>
                    <Select label="TYPE" value={formFurnitureType} onChange={(e) => setFormFurnitureType(e.target.value)}
                      options={[{ value: 'TABLE', label: 'TABLE' }, { value: 'CHAIR', label: 'CHAIR' }]} placeholder="TYPE" />
                    <div className="grid grid-cols-3 gap-2">
                      <Input label="W (cm)" type="number" value={formElemW} onChange={(e) => setFormElemW(e.target.value)} />
                      <Input label="D (cm)" type="number" value={formElemD} onChange={(e) => setFormElemD(e.target.value)} />
                      <Select label="SHAPE" value={formElemShape} onChange={(e) => setFormElemShape(e.target.value)}
                        options={[{ value: 'RECTANGLE', label: 'RECT' }, { value: 'CIRCLE', label: 'CIRCLE' }]} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input label="COLOUR" value={formDefaultColour} onChange={(e) => setFormDefaultColour(e.target.value)} placeholder="#555" />
                      {formFurnitureType === 'TABLE' && (
                        <Input label="CHAIRS" type="number" value={formChairCount} onChange={(e) => setFormChairCount(e.target.value)} />
                      )}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button size="sm" onClick={handleSave} disabled={!formName || !formCat}>
                    {isCreating ? 'CREATE' : 'SAVE PROPERTIES'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setSelectedItem(null); setIsCreating(false); resetForm() }}>CANCEL</Button>
                  {selectedItem && selectedItem.furnitureType != null && (
                    <Button size="sm" variant="ghost" onClick={async () => {
                      await fetch(`/api/admin/inventory/${selectedItem.id}/duplicate`, { method: 'POST' }); load()
                    }}>DUPLICATE</Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Categories */}
      <div className="border border-grey-mid p-4">
        <h2 className="font-mono text-xs font-bold text-white uppercase mb-2">CATEGORIES</h2>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center gap-1 bg-grey-dark border border-grey-mid px-2 py-1">
              <span className="font-mono text-[10px] text-white">{c.name}</span>
              {c.isBuiltIn ? (
                <span className="font-mono text-[8px] text-grey-light">(BUILT-IN)</span>
              ) : (
                <button onClick={() => deleteCategory(c.id)}
                  className="font-mono text-[10px] text-danger hover:text-white ml-1">✕</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
