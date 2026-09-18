'use client'

// The enquiry intake: a first-visit chat captured against the venue's master
// template, then converted into a BEO. Deliberately simpler than the BEO builder
// — contact, date, headcount and the master-template areas only.

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { BeoBlockEditor } from '@/components/admin/BeoBlockEditor'
import { BeoBlockLibrary } from '@/components/admin/BeoBlockLibrary'
import { BeoBlockReferences } from '@/components/admin/BeoBlockReferences'
import { blockLabel, defaultConfigFor, moveBlock, summariseBlock } from '@/lib/beo-blocks'
import { useBlockLibrary } from '@/lib/use-block-library'

interface BlockRow {
  id: string
  type: string
  title: string | null
  config: Record<string, unknown>
  sortOrder: number
}

interface Enquiry {
  id: string
  name: string
  eventType: string | null
  status: string
  eventDate: string
  guestCount: number
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  notes: string | null
  blocks: BlockRow[]
}

const textareaClass =
  'w-full bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white placeholder:text-grey-light'

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `new_${crypto.randomUUID()}`
  }
  return `new_${Math.random().toString(36).slice(2)}`
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function dateKey(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? String(iso ?? '').slice(0, 10) : d.toISOString().slice(0, 10)
}

export function EnquiriesPanel({
  sessionVenueId,
  defaultVenueId,
  onConverted,
}: {
  sessionVenueId: string
  defaultVenueId?: string | null
  onConverted: (eventId: string) => void
}) {
  const venueId = defaultVenueId || sessionVenueId
  const library = useBlockLibrary(`/api/admin/beo-block-defs?venueId=${venueId}`)

  const [enquiries, setEnquiries] = useState<Enquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<Enquiry | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [converting, setConverting] = useState(false)
  const [showLibrary, setShowLibrary] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDate, setNewDate] = useState(todayKey())
  const [newPax, setNewPax] = useState('0')
  const [newContact, setNewContact] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/admin/enquiries?venueId=${venueId}`)
      const d = r.ok ? await r.json() : []
      setEnquiries(Array.isArray(d) ? (d as Enquiry[]) : [])
    } catch {
      setEnquiries([])
    }
    setLoading(false)
  }, [venueId])

  useEffect(() => { load() }, [load])

  function toDraft(e: Enquiry): Enquiry {
    return {
      ...e,
      eventDate: dateKey(e.eventDate),
      blocks: (e.blocks ?? []).map((b, i) => ({ ...b, sortOrder: i })),
    }
  }

  function patch(p: Partial<Enquiry>) {
    setDraft((d) => (d ? { ...d, ...p } : d))
  }

  async function createEnquiry() {
    if (!newName.trim()) return
    setCreating(true)
    setError('')
    const r = await fetch('/api/admin/enquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        venueId,
        name: newName,
        eventDate: newDate,
        guestCount: Number(newPax) || 0,
        contactName: newContact || null,
        contactPhone: newPhone || null,
      }),
    })
    setCreating(false)
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setError(String(d.error ?? 'COULD NOT CREATE ENQUIRY').toUpperCase())
      return
    }
    const created = (await r.json()) as Enquiry
    setCreateOpen(false)
    setNewName('')
    setNewPax('0')
    setNewContact('')
    setNewPhone('')
    await load()
    setDraft(toDraft(created))
  }

  function addBlock(type: string) {
    setShowLibrary(false)
    setDraft((d) => {
      if (!d) return d
      const id = newId()
      setExpanded((prev) => new Set(prev).add(id))
      return { ...d, blocks: [...d.blocks, { id, type, title: null, config: defaultConfigFor(type, library), sortOrder: d.blocks.length }] }
    })
  }

  async function save(): Promise<boolean> {
    if (!draft) return false
    setSaving(true)
    setError('')
    const eventRes = await fetch(`/api/admin/events/${draft.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: draft.name,
        eventDate: draft.eventDate,
        guestCount: draft.guestCount,
        eventType: draft.eventType,
        contactName: draft.contactName,
        contactEmail: draft.contactEmail,
        contactPhone: draft.contactPhone,
        notes: draft.notes,
      }),
    })
    if (!eventRes.ok) {
      const d = await eventRes.json().catch(() => ({}))
      setSaving(false)
      setError(String(d.error ?? 'COULD NOT SAVE').toUpperCase())
      return false
    }
    const blocksRes = await fetch(`/api/admin/events/${draft.id}/blocks`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blocks: draft.blocks.map((b) => ({
          id: b.id.startsWith('new_') ? null : b.id,
          type: b.type,
          title: b.title,
          config: b.config,
        })),
      }),
    })
    setSaving(false)
    if (!blocksRes.ok) {
      const d = await blocksRes.json().catch(() => ({}))
      setError(String(d.error ?? 'ENQUIRY SAVED, BLOCKS FAILED').toUpperCase())
      return false
    }
    return true
  }

  async function convert() {
    if (!draft) return
    const ok = await save()
    if (!ok) return
    setConverting(true)
    const r = await fetch(`/api/admin/events/${draft.id}/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'TENTATIVE' }),
    })
    setConverting(false)
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setError(String(d.error ?? 'COULD NOT CONVERT').toUpperCase())
      return
    }
    const id = draft.id
    setDraft(null)
    await load()
    onConverted(id)
  }

  if (draft) {
    const eventValues = draft as unknown as Record<string, unknown>
    return (
      <div className="space-y-3">
        <div className="sticky top-[var(--admin-topbar-h)] z-10 bg-black border-b border-grey-mid -mx-4 px-4 py-2 flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="ghost" onClick={() => { setDraft(null); load() }}>← BACK</Button>
          <span className="font-mono text-xs uppercase text-white truncate">{draft.name || 'UNTITLED ENQUIRY'}</span>
          <span className="font-mono text-[10px] uppercase text-grey-light">ENQUIRY</span>
          <div className="flex-1" />
          {error && <span className="font-mono text-[10px] text-danger uppercase">{error}</span>}
          <Button size="sm" variant="ghost" onClick={convert} loading={converting}>CONVERT TO BEO</Button>
          <Button size="sm" onClick={save} loading={saving}>SAVE</Button>
        </div>

        <div className="border border-grey-mid p-4 space-y-3">
          <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">GUEST &amp; CONTACT</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input label="Name" value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
            <Input label="Date" type="date" value={draft.eventDate} onChange={(e) => patch({ eventDate: e.target.value })} />
            <Input label="Guests" type="number" value={String(draft.guestCount)} onChange={(e) => patch({ guestCount: Number(e.target.value) })} />
            <Input label="Type" value={draft.eventType ?? ''} placeholder="WEDDING" onChange={(e) => patch({ eventType: e.target.value })} />
            <Input label="Contact name" value={draft.contactName ?? ''} onChange={(e) => patch({ contactName: e.target.value })} />
            <Input label="Contact phone" value={draft.contactPhone ?? ''} onChange={(e) => patch({ contactPhone: e.target.value })} />
            <Input label="Contact email" value={draft.contactEmail ?? ''} onChange={(e) => patch({ contactEmail: e.target.value })} />
          </div>
          <div>
            <label className="block font-mono text-[10px] uppercase text-grey-light mb-1">Notes</label>
            <textarea rows={3} value={draft.notes ?? ''} onChange={(e) => patch({ notes: e.target.value })} className={textareaClass} />
          </div>
        </div>

        <div className="border border-grey-mid p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">ENQUIRY AREAS</h3>
            <Button size="sm" variant="ghost" onClick={() => setShowLibrary(true)}>+ ADD AREA</Button>
          </div>
          {draft.blocks.length === 0 && (
            <p className="font-mono text-[10px] uppercase text-grey-light text-center py-3">
              NO AREAS YET. SET A MASTER TEMPLATE TO SEED NEW ENQUIRIES.
            </p>
          )}
          {draft.blocks.map((b, i) => {
            const open = expanded.has(b.id)
            return (
              <div key={b.id} className="border border-grey-mid">
                <div className="flex items-center gap-1 px-1.5 py-1 bg-grey-dark/40">
                  <button
                    type="button"
                    onClick={() => setExpanded((prev) => { const n = new Set(prev); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n })}
                    className="flex-1 min-w-0 text-left px-1 py-2 font-mono text-xs uppercase text-white truncate"
                  >
                    {open ? '▾' : '▸'} {b.title?.trim() || blockLabel(b.type, library)}
                  </button>
                  <button type="button" disabled={i === 0} aria-label="Move up" onClick={() => setDraft((d) => (d ? { ...d, blocks: moveBlock(d.blocks, i, -1) } : d))} className="w-9 h-9 flex items-center justify-center font-mono text-sm text-grey-light hover:text-white disabled:opacity-30">↑</button>
                  <button type="button" disabled={i === draft.blocks.length - 1} aria-label="Move down" onClick={() => setDraft((d) => (d ? { ...d, blocks: moveBlock(d.blocks, i, 1) } : d))} className="w-9 h-9 flex items-center justify-center font-mono text-sm text-grey-light hover:text-white disabled:opacity-30">↓</button>
                  <button type="button" aria-label="Delete area" onClick={() => setDraft((d) => (d ? { ...d, blocks: d.blocks.filter((x) => x.id !== b.id) } : d))} className="w-9 h-9 flex items-center justify-center font-mono text-sm text-grey-light hover:text-danger">✕</button>
                </div>
                {!open && <p className="px-2.5 pb-2 -mt-1 font-mono text-[9px] uppercase text-grey-light truncate">{summariseBlock(b, library)}</p>}
                {open && (
                  <div className="p-3 border-t border-grey-mid space-y-3">
                    <BeoBlockReferences blockType={b.type} library={library} mode="admin" venueId={venueId} />
                    <BeoBlockEditor
                      type={b.type}
                      config={b.config}
                      eventValues={eventValues}
                      library={library}
                      onConfigChange={(config) => setDraft((d) => (d ? { ...d, blocks: d.blocks.map((x) => (x.id === b.id ? { ...x, config } : x)) } : d))}
                      onEventFieldChange={(field, value) => patch({ [field]: value } as Partial<Enquiry>)}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <Modal isOpen={showLibrary} onClose={() => setShowLibrary(false)} title="ADD AREA">
          <BeoBlockLibrary onAdd={addBlock} library={library} />
        </Modal>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="font-mono text-xl font-bold uppercase tracking-widest text-white">ENQUIRIES</h1>
        <div className="flex-1" />
        <Button size="sm" onClick={() => setCreateOpen(true)}>+ NEW ENQUIRY</Button>
      </div>

      <p className="font-mono text-[10px] uppercase text-grey-light">
        FIRST VISIT AND CHAT. START FROM THE MASTER TEMPLATE, THEN CONVERT TO A BEO WHEN IT IS REAL.
      </p>

      {error && <p className="font-mono text-xs text-danger uppercase">{error}</p>}

      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : enquiries.length === 0 ? (
        <div className="border border-grey-mid p-6 text-center">
          <p className="font-mono text-xs uppercase text-grey-light">NO ENQUIRIES YET.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {enquiries.map((e) => (
            <button
              key={e.id}
              type="button"
              data-testid="enquiry-card"
              onClick={() => { setExpanded(new Set()); setError(''); setDraft(toDraft(e)) }}
              className="text-left border border-grey-mid hover:border-white transition-colors p-3 space-y-1"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs uppercase text-white truncate">{e.name}</span>
                <div className="flex-1" />
                <span className="font-mono text-[9px] uppercase text-accent border border-accent px-1">ENQUIRY</span>
              </div>
              <div className="font-mono text-[10px] uppercase text-grey-light">
                {dateKey(e.eventDate)}{e.guestCount ? ` · ${e.guestCount} PAX` : ''}
              </div>
              <div className="font-mono text-[10px] uppercase text-grey-light truncate">
                {[e.contactName, e.contactPhone].filter(Boolean).join(' · ') || 'NO CONTACT'}
              </div>
              <div className="font-mono text-[9px] uppercase text-grey-light truncate">
                {e.blocks.length === 0 ? 'NO AREAS' : e.blocks.map((b) => summariseBlock(b, library)).join(' · ')}
              </div>
            </button>
          ))}
        </div>
      )}

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="NEW ENQUIRY">
        <div className="space-y-3">
          <Input label="Enquiry name" value={newName} placeholder="SMITH WEDDING" onChange={(e) => setNewName(e.target.value)} />
          <Input label="Date" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          <Input label="Guests" type="number" value={newPax} onChange={(e) => setNewPax(e.target.value)} />
          <Input label="Contact name" value={newContact} onChange={(e) => setNewContact(e.target.value)} />
          <Input label="Contact phone" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
          {error && <p className="font-mono text-xs text-danger uppercase">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setCreateOpen(false)}>CANCEL</Button>
            <Button size="sm" onClick={createEnquiry} loading={creating} disabled={!newName.trim()}>CREATE ENQUIRY</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
