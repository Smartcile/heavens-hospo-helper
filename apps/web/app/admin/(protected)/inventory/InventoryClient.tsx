'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'

interface Category { id: string; name: string; isBuiltIn: boolean; venueId: string | null }
interface Item {
  id: string; name: string; categoryId: string; unit: string; defaultParLevel: number; category: Category
  furnitureType?: string | null; elementWidth?: number | null; elementDepth?: number | null
  elementShape?: string | null; defaultColour?: string | null; defaultChairCount?: number
}

export function InventoryClient() {
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [filterCat, setFilterCat] = useState('')
  const [showNewItem, setShowNewItem] = useState(false)
  const [showNewCat, setShowNewCat] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCat, setNewCat] = useState('')
  const [newUnit, setNewUnit] = useState('EA')
  const [newPar, setNewPar] = useState('0')
  const [newFurnitureType, setNewFurnitureType] = useState('')
  const [newElemW, setNewElemW] = useState('80')
  const [newElemD, setNewElemD] = useState('80')
  const [newElemShape, setNewElemShape] = useState('RECTANGLE')
  const [newDefaultColour, setNewDefaultColour] = useState('#555')
  const [newDefaultChairCount, setNewDefaultChairCount] = useState('0')
  const [newCatName, setNewCatName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

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

  useEffect(() => { load() }, [])

  async function addItem() {
    const body: any = { name: newName, categoryId: newCat, unit: newUnit, defaultParLevel: parseInt(newPar) || 0 }
    const cat = categories.find((c) => c.id === newCat)
    if (cat?.name === 'FURNITURE') {
      body.furnitureType = (newFurnitureType || null) as string | null
      body.elementWidth = parseFloat(newElemW) || null
      body.elementDepth = parseFloat(newElemD) || null
      body.elementShape = (newElemShape || null) as string | null
      body.defaultColour = (newDefaultColour || null) as string | null
      body.defaultChairCount = parseInt(newDefaultChairCount) || 0
    }
    await fetch('/api/admin/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setNewName(''); setNewCat(''); setNewUnit('EA'); setNewPar('0')
    setNewFurnitureType(''); setNewElemW('80'); setNewElemD('80'); setNewElemShape('RECTANGLE')
    setNewDefaultColour('#555'); setNewDefaultChairCount('0')
    setShowNewItem(false)
    load()
  }

  async function addCategory() {
    const r = await fetch('/api/admin/inventory/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newCatName }),
    })
    if (!r.ok) { const d = await r.json(); alert(d.error); return }
    setNewCatName(''); setShowNewCat(false)
    load()
  }

  async function deleteCategory(id: string) {
    const r = await fetch(`/api/admin/inventory/categories/${id}`, { method: 'DELETE' })
    if (!r.ok) { const d = await r.json(); alert(d.error); return }
    load()
  }

  async function deleteItem(id: string) {
    await fetch(`/api/admin/inventory/${id}`, { method: 'DELETE' })
    load()
  }

  async function updatePar(id: string, par: number) {
    await fetch(`/api/admin/inventory/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ defaultParLevel: par }),
    })
    load()
  }

  const filtered = filterCat ? items.filter((i) => i.categoryId === filterCat) : items

  if (loading) {
    return <p className="font-mono text-sm text-grey-light loading-cursor">LOADING</p>
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">INVENTORY</h1>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setShowNewCat(!showNewCat)} variant="ghost">NEW CATEGORY</Button>
          <Button size="sm" onClick={() => setShowNewItem(!showNewItem)}>NEW ITEM</Button>
        </div>
      </div>

      {showNewCat && (
        <div className="bg-grey-dark border border-grey-mid p-4 space-y-3">
          <h2 className="font-mono text-xs font-bold text-white uppercase">New Category</h2>
          <div className="flex gap-2">
            <Input value={newCatName} onChange={(e) => setNewCatName(e.target.value.toUpperCase())} placeholder="CATEGORY NAME" className="flex-1" />
            <Button size="sm" onClick={addCategory} disabled={!newCatName}>CREATE</Button>
          </div>
        </div>
      )}

      {showNewItem && (
        <div className="bg-grey-dark border border-grey-mid p-4 space-y-3">
          <h2 className="font-mono text-xs font-bold text-white uppercase">New Item</h2>
          <Input value={newName} onChange={(e) => setNewName(e.target.value.toUpperCase())} placeholder="ITEM NAME" />
          <div className="flex gap-2">
            <Select value={newCat} onChange={(e) => setNewCat(e.target.value)}
              options={categories.map((c) => ({ value: c.id, label: c.name }))} placeholder="CATEGORY" className="flex-1" />
            <Select value={newUnit} onChange={(e) => setNewUnit(e.target.value)}
              options={[{ value: 'EA', label: 'EA' }, { value: 'SET', label: 'SET' }, { value: 'PAIR', label: 'PAIR' }]} className="w-24" />
            <Input type="number" value={newPar} onChange={(e) => setNewPar(e.target.value)} placeholder="PAR" className="w-20" />
          </div>
          {categories.find((c) => c.id === newCat)?.name === 'FURNITURE' && (
            <div className="border-t border-grey-mid pt-3 space-y-2">
              <p className="font-mono text-[10px] text-grey-light uppercase">Furniture Template</p>
              <div className="flex gap-2">
                <Select value={newFurnitureType} onChange={(e) => setNewFurnitureType(e.target.value)}
                  options={[{ value: 'TABLE', label: 'TABLE' }, { value: 'CHAIR', label: 'CHAIR' }]} placeholder="TYPE" className="flex-1" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Input label="W (cm)" type="number" value={newElemW} onChange={(e) => setNewElemW(e.target.value)} />
                <Input label="D (cm)" type="number" value={newElemD} onChange={(e) => setNewElemD(e.target.value)} />
                <Select label="Shape" value={newElemShape} onChange={(e) => setNewElemShape(e.target.value)}
                  options={[{ value: 'RECTANGLE', label: 'RECT' }, { value: 'CIRCLE', label: 'CIRCLE' }]} />
              </div>
              <div className="flex gap-2">
                <Input label="Colour" value={newDefaultColour} onChange={(e) => setNewDefaultColour(e.target.value)} placeholder="#555" />
                {newFurnitureType === 'TABLE' && (
                  <Input label="Default Chairs" type="number" value={newDefaultChairCount} onChange={(e) => setNewDefaultChairCount(e.target.value)} />
                )}
              </div>
            </div>
          )}
          <Button size="sm" onClick={addItem} disabled={!newName || !newCat}>CREATE</Button>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[10px] text-grey-light uppercase">Filter:</span>
          <button onClick={() => setFilterCat('')}
            className={`font-mono text-[10px] uppercase px-2 py-1 border ${!filterCat ? 'border-white text-white' : 'border-grey-mid text-grey-light'}`}>ALL</button>
          {categories.map((c) => (
            <button key={c.id} onClick={() => setFilterCat(c.id)}
              className={`font-mono text-[10px] uppercase px-2 py-1 border ${filterCat === c.id ? 'border-white text-white' : 'border-grey-mid text-grey-light'}`}>
              {c.name}{c.isBuiltIn ? '' : ' ★'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        {filtered.length === 0 && <p className="font-mono text-xs text-grey-light">No items yet.</p>}
        {filtered.map((item) => {
          const isFurniture = item.furnitureType != null
          return (
            <div key={item.id} className="flex items-center gap-3 bg-grey-dark border border-grey-mid p-2">
              {isFurniture && item.defaultColour && (
                <div className="w-4 h-4 flex-shrink-0 border border-grey-light" style={{ backgroundColor: item.defaultColour }} />
              )}
              <div className="flex-1 min-w-0">
                <span className="font-mono text-xs text-white truncate">{item.name}</span>
                <span className="font-mono text-[10px] text-grey-light ml-2">{item.category.name}</span>
                {isFurniture && (
                  <span className="font-mono text-[10px] text-accent ml-2">
                    {item.furnitureType} {item.elementWidth}×{item.elementDepth}
                    {item.furnitureType === 'TABLE' && item.defaultChairCount ? ` · ${item.defaultChairCount} chairs` : ''}
                  </span>
                )}
              </div>
              <span className="font-mono text-[10px] text-grey-light w-10 text-right">{item.unit}</span>
              {editing === item.id ? (
                <div className="flex items-center gap-1">
                  <Input type="number" value={editName} onChange={(e) => setEditName(e.target.value)}
                    className="w-16 h-7 text-[10px]" />
                  <button onClick={() => { updatePar(item.id, parseInt(editName) || 0); setEditing(null) }}
                    className="font-mono text-[10px] text-success">OK</button>
                </div>
              ) : (
                <button onClick={() => { setEditing(item.id); setEditName(item.defaultParLevel.toString()) }}
                  className="font-mono text-[10px] text-grey-light hover:text-white w-12 text-right">
                  PAR: {item.defaultParLevel || '-'}
                </button>
              )}
              {isFurniture && (
                <button onClick={async () => {
                  await fetch(`/api/admin/inventory/${item.id}/duplicate`, { method: 'POST' })
                  load()
                }}
                  className="font-mono text-[10px] text-grey-light hover:text-white uppercase border border-grey-mid px-1.5 py-0.5">
                  DUPLICATE
                </button>
              )}
              <button onClick={() => deleteItem(item.id)}
                className="font-mono text-[10px] text-danger hover:text-white">✕</button>
            </div>
          )
        })}
      </div>

      <div className="border-t border-grey-mid pt-4">
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
        <p className="font-mono text-[10px] text-grey-light mt-2">★ = custom category</p>
      </div>
    </div>
  )
}
