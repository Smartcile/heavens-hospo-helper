'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

interface Supplier {
  id: string; name: string; contact: string | null; email: string | null
  phone: string | null; notes: string | null; isActive: boolean
}

export function SuppliersClient() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const [formName, setFormName] = useState('')
  const [formContact, setFormContact] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formNotes, setFormNotes] = useState('')

  function resetForm() {
    setFormName(''); setFormContact(''); setFormEmail(''); setFormPhone(''); setFormNotes('')
  }

  function populateForm(s: Supplier) {
    setFormName(s.name); setFormContact(s.contact ?? ''); setFormEmail(s.email ?? '')
    setFormPhone(s.phone ?? ''); setFormNotes(s.notes ?? '')
  }

  async function load() {
    setLoading(true)
    const r = await fetch('/api/admin/suppliers')
    if (r.ok) setSuppliers(await r.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (selectedId && !isCreating) {
      const s = suppliers.find((x) => x.id === selectedId)
      if (s) populateForm(s)
    }
  }, [selectedId])

  async function handleSave() {
    if (!formName.trim()) return
    const body: any = { name: formName.trim().toUpperCase(), contact: formContact || null, email: formEmail || null, phone: formPhone || null, notes: formNotes || null }
    if (isCreating) {
      const r = await fetch('/api/admin/suppliers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) return
    } else if (selectedId) {
      const r = await fetch(`/api/admin/suppliers/${selectedId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) return
    }
    setSelectedId(null); setIsCreating(false); resetForm(); load()
  }

  async function handleDelete() {
    if (!selectedId) return
    await fetch(`/api/admin/suppliers/${selectedId}`, { method: 'DELETE' })
    setSelectedId(null); resetForm(); load()
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p></div>
  }

  return (
    <div className="space-y-4">
      <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">SUPPLIERS</h1>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4">
          <div className="border border-grey-mid p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-mono text-xs font-bold text-white uppercase">SUPPLIERS ({suppliers.length})</h2>
              <Button size="sm" onClick={() => { setSelectedId(null); setIsCreating(true); resetForm() }}>+ ADD</Button>
            </div>
            <div className="space-y-0.5 max-h-[60vh] overflow-y-auto">
              {suppliers.map((s) => (
                <button key={s.id} onClick={() => { setIsCreating(false); setSelectedId(s.id) }}
                  className={`w-full text-left px-2 py-1.5 font-mono text-xs uppercase border ${selectedId === s.id && !isCreating ? 'border-white text-white' : 'border-transparent text-grey-light hover:border-grey-mid hover:text-white'}`}>
                  <span className="block truncate">{s.name}</span>
                  {s.contact && <span className="block text-[10px] text-grey-light normal-case">{s.contact}</span>}
                </button>
              ))}
              {suppliers.length === 0 && <p className="font-mono text-xs text-grey-light px-2 py-1">No suppliers yet.</p>}
            </div>
          </div>
        </div>

        <div className="lg:col-span-8">
          <div className="border border-grey-mid p-4 space-y-4">
            {(!selectedId && !isCreating) ? (
              <p className="font-mono text-xs text-grey-light uppercase">SELECT A SUPPLIER OR CLICK + ADD</p>
            ) : (
              <>
                <h2 className="font-mono text-xs uppercase text-grey-light tracking-wider">
                  {isCreating ? 'NEW SUPPLIER' : 'PROPERTIES'}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="font-mono text-xs uppercase text-grey-light block mb-1">NAME</label>
                    <Input value={formName} onChange={(e) => setFormName(e.target.value.toUpperCase())} placeholder="SUPPLIER NAME" />
                  </div>
                  <div>
                    <label className="font-mono text-xs uppercase text-grey-light block mb-1">CONTACT</label>
                    <Input value={formContact} onChange={(e) => setFormContact(e.target.value)} placeholder="CONTACT NAME" />
                  </div>
                  <div>
                    <label className="font-mono text-xs uppercase text-grey-light block mb-1">EMAIL</label>
                    <Input value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="EMAIL" />
                  </div>
                  <div>
                    <label className="font-mono text-xs uppercase text-grey-light block mb-1">PHONE</label>
                    <Input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="PHONE" />
                  </div>
                </div>
                <div>
                  <label className="font-mono text-xs uppercase text-grey-light block mb-1">NOTES</label>
                  <Input value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="NOTES" />
                </div>
                <div className="border-t border-grey-mid pt-3 flex items-center gap-2">
                  <Button onClick={handleSave} disabled={!formName.trim()}>{isCreating ? 'CREATE' : 'SAVE'}</Button>
                  {!isCreating && <Button variant="danger" size="sm" onClick={handleDelete}>DELETE</Button>}
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
