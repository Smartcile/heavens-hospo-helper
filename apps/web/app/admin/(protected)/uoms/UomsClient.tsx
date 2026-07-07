'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

interface Uom {
  id: string; name: string; baseUnit: string; conversionRatio: number
  isBuiltIn: boolean; venueId: string | null
}

export function UomsClient() {
  const [uoms, setUoms] = useState<Uom[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const [formName, setFormName] = useState('')
  const [formBaseUnit, setFormBaseUnit] = useState('')
  const [formRatio, setFormRatio] = useState('1')

  function resetForm() {
    setFormName(''); setFormBaseUnit(''); setFormRatio('1')
  }

  function populateForm(u: Uom) {
    setFormName(u.name); setFormBaseUnit(u.baseUnit); setFormRatio(u.conversionRatio.toString())
  }

  async function load() {
    setLoading(true)
    const r = await fetch('/api/admin/uoms')
    if (r.ok) setUoms(await r.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (selectedId && !isCreating) {
      const u = uoms.find((x) => x.id === selectedId)
      if (u) populateForm(u)
    }
  }, [selectedId])

  async function handleSave() {
    if (!formName.trim() || !formBaseUnit.trim()) return
    const body: any = {
      name: formName.trim().toUpperCase(),
      baseUnit: formBaseUnit.trim().toLowerCase(),
      conversionRatio: parseFloat(formRatio) || 1,
    }
    if (isCreating) {
      const r = await fetch('/api/admin/uoms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) return
    } else if (selectedId) {
      const r = await fetch(`/api/admin/uoms/${selectedId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) return
    }
    setSelectedId(null); setIsCreating(false); resetForm(); load()
  }

  async function handleDelete() {
    if (!selectedId) return
    const u = uoms.find((x) => x.id === selectedId)
    if (u?.isBuiltIn) { alert('Cannot delete built-in units of measure.'); return }
    await fetch(`/api/admin/uoms/${selectedId}`, { method: 'DELETE' })
    setSelectedId(null); resetForm(); load()
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p></div>
  }

  return (
    <div className="space-y-4">
      <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">UNITS OF MEASURE</h1>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4">
          <div className="border border-grey-mid p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-mono text-xs font-bold text-white uppercase">UNITS ({uoms.length})</h2>
              <Button size="sm" onClick={() => { setSelectedId(null); setIsCreating(true); resetForm() }}>+ ADD</Button>
            </div>
            <div className="space-y-0.5 max-h-[60vh] overflow-y-auto">
              {uoms.map((u) => (
                <button key={u.id} onClick={() => { setIsCreating(false); setSelectedId(u.id) }}
                  className={`w-full text-left px-2 py-1.5 font-mono text-xs uppercase border ${selectedId === u.id && !isCreating ? 'border-white text-white' : 'border-transparent text-grey-light hover:border-grey-mid hover:text-white'}`}>
                  <span className="block truncate">{u.name}</span>
                  <span className="block text-[10px] text-grey-light normal-case">1 = {u.conversionRatio} {u.baseUnit}</span>
                </button>
              ))}
              {uoms.length === 0 && <p className="font-mono text-xs text-grey-light px-2 py-1">No units yet.</p>}
            </div>
          </div>
        </div>

        <div className="lg:col-span-8">
          <div className="border border-grey-mid p-4 space-y-4">
            {(!selectedId && !isCreating) ? (
              <p className="font-mono text-xs text-grey-light uppercase">SELECT A UNIT OR CLICK + ADD</p>
            ) : (
              <>
                <h2 className="font-mono text-xs uppercase text-grey-light tracking-wider">
                  {isCreating ? 'NEW UNIT' : 'PROPERTIES'}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="font-mono text-xs uppercase text-grey-light block mb-1">NAME</label>
                    <Input value={formName} onChange={(e) => setFormName(e.target.value.toUpperCase())} placeholder="e.g. 6 PACK 1L" />
                  </div>
                  <div>
                    <label className="font-mono text-xs uppercase text-grey-light block mb-1">BASE UNIT</label>
                    <Input value={formBaseUnit} onChange={(e) => setFormBaseUnit(e.target.value.toLowerCase())} placeholder="e.g. mL" />
                  </div>
                  <div>
                    <label className="font-mono text-xs uppercase text-grey-light block mb-1">CONVERSION RATIO</label>
                    <Input type="number" step="0.0001" value={formRatio} onChange={(e) => setFormRatio(e.target.value)} placeholder="e.g. 6000" />
                  </div>
                </div>
                <p className="font-mono text-[10px] text-grey-light">
                  {formName && formBaseUnit ? `1 ${formName || '?'} = ${parseFloat(formRatio) || 1} ${formBaseUnit}` : 'Enter name and base unit to see the conversion'}
                </p>
                <div className="border-t border-grey-mid pt-3 flex items-center gap-2">
                  <Button onClick={handleSave} disabled={!formName.trim() || !formBaseUnit.trim()}>
                    {isCreating ? 'CREATE' : 'SAVE'}
                  </Button>
                  {!isCreating && (
                    <Button variant="danger" size="sm" onClick={handleDelete} disabled={uoms.find((u) => u.id === selectedId)?.isBuiltIn}>DELETE</Button>
                  )}
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
