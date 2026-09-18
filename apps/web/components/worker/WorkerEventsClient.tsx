'use client'

// Worker BEO builder — managers / granted floor staff create and edit events
// from the phone. Simpler than the admin builder: click to add blocks (drag is
// a desktop affordance), stacked fields, full-screen.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { BeoBlockEditor } from '@/components/admin/BeoBlockEditor'
import { BeoBlockLibrary } from '@/components/admin/BeoBlockLibrary'
import { BeoBlockReferences } from '@/components/admin/BeoBlockReferences'
import {
  BEO_BLOCKS,
  blockLabel,
  defaultConfigFor,
  defRowToBlockDef,
  mergeLibrary,
  moveBlock,
  summariseBlock,
} from '@/lib/beo-blocks'

interface BlockRow {
  id: string
  type: string
  title: string | null
  config: Record<string, unknown>
  sortOrder: number
}

interface WorkerEvent {
  id: string
  name: string
  eventType: string | null
  status: string
  eventDate: string
  startTime: string | null
  endTime: string | null
  guestCount: number
  diningStyle: string | null
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  menuId: string | null
  serviceId: string | null
  setupId: string | null
  depositAmount: number | null
  paymentStatus: string
  notes: string | null
  blocks: BlockRow[]
}

interface Refs {
  menus: { id: string; name: string }[]
  menuItems: { id: string; name: string }[]
  services: { id: string; name: string }[]
  setups: { id: string; name: string }[]
  blockDefs: Parameters<typeof defRowToBlockDef>[0][]
}

const STATUSES = ['ENQUIRY', 'DRAFT', 'TENTATIVE', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']
const PAYMENTS = ['UNPAID', 'PARTIAL', 'PAID', 'REFUNDED']

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `new_${crypto.randomUUID()}`
  }
  return `new_${Math.random().toString(36).slice(2)}`
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function toDraft(e: WorkerEvent): WorkerEvent {
  return {
    ...e,
    eventDate: new Date(e.eventDate).toISOString().slice(0, 10),
    blocks: e.blocks.map((b, i) => ({ ...b, sortOrder: i })),
  }
}

const inputClass =
  'w-full bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white placeholder:text-grey-light'

export function WorkerEventsClient() {
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [events, setEvents] = useState<WorkerEvent[]>([])
  const [refs, setRefs] = useState<Refs>({ menus: [], menuItems: [], services: [], setups: [], blockDefs: [] })
  const library = useMemo(
    () => (refs.blockDefs.length ? mergeLibrary(refs.blockDefs.map(defRowToBlockDef)) : BEO_BLOCKS),
    [refs.blockDefs],
  )
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<WorkerEvent | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showLibrary, setShowLibrary] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [pushMsg, setPushMsg] = useState('')

  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDate, setNewDate] = useState(todayKey())
  const [newPax, setNewPax] = useState('0')
  const [newIsEnquiry, setNewIsEnquiry] = useState(true)
  const [creating, setCreating] = useState(false)
  const [view, setView] = useState<'ENQUIRIES' | 'EVENTS' | 'ALL'>('ENQUIRIES')
  const [converting, setConverting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/worker/events')
      if (r.status === 403) { setAllowed(false); setLoading(false); return }
      if (!r.ok) { setAllowed(false); setLoading(false); return }
      const list = await r.json()
      setEvents(Array.isArray(list) ? list : [])
      setAllowed(true)
    } catch {
      setAllowed(false)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!allowed) return
    let alive = true
    ;(async () => {
      try {
        const r = await fetch('/api/worker/events/refs')
        if (!r.ok || !alive) return
        const d = await r.json()
        setRefs({
          menus: d.menus ?? [],
          menuItems: d.menuItems ?? [],
          services: d.services ?? [],
          setups: d.setups ?? [],
          blockDefs: d.blockDefs ?? [],
        })
      } catch { /* pickers degrade to empty */ }
    })()
    return () => { alive = false }
  }, [allowed])

  function patch(p: Partial<WorkerEvent>) {
    setDraft((d) => (d ? { ...d, ...p } : d))
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

  async function createEvent() {
    if (!newName.trim()) return
    setCreating(true)
    setError('')
    const r = await fetch(newIsEnquiry ? '/api/worker/enquiries' : '/api/worker/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, eventDate: newDate, guestCount: Number(newPax) || 0 }),
    })
    setCreating(false)
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setError(d.error ?? 'COULD NOT CREATE')
      return
    }
    const created = (await r.json()) as WorkerEvent
    setCreateOpen(false)
    setNewName('')
    setNewPax('0')
    await load()
    setDraft(toDraft(created))
  }

  async function persist(): Promise<boolean> {
    if (!draft) return false
    setSaving(true)
    setError('')
    const eventRes = await fetch(`/api/worker/events/${draft.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: draft.name,
        eventType: draft.eventType,
        status: draft.status,
        eventDate: draft.eventDate,
        startTime: draft.startTime,
        endTime: draft.endTime,
        guestCount: draft.guestCount,
        diningStyle: draft.diningStyle,
        contactName: draft.contactName,
        contactEmail: draft.contactEmail,
        contactPhone: draft.contactPhone,
        menuId: draft.menuId,
        serviceId: draft.serviceId,
        setupId: draft.setupId,
        depositAmount: draft.depositAmount,
        paymentStatus: draft.paymentStatus,
        notes: draft.notes,
      }),
    })
    if (!eventRes.ok) {
      const d = await eventRes.json().catch(() => ({}))
      setSaving(false)
      setError(d.error ?? 'COULD NOT SAVE')
      return false
    }

    const blocksRes = await fetch(`/api/worker/events/${draft.id}/blocks`, {
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
      setError(d.error ?? 'EVENT SAVED, BLOCKS FAILED')
      return false
    }
    return true
  }

  async function save() {
    const ok = await persist()
    if (!ok) return
    setDraft(null)
    load()
  }

  async function convert() {
    if (!draft) return
    const ok = await persist()
    if (!ok) return
    setConverting(true)
    const r = await fetch(`/api/worker/events/${draft.id}/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'TENTATIVE' }),
    })
    setConverting(false)
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setError(d.error ?? 'COULD NOT CONVERT')
      return
    }
    setDraft(null)
    load()
  }

  async function push() {
    if (!draft) return
    setPushing(true)
    setPushMsg('')
    // The push reads the stored event, so persist first.
    const eventRes = await fetch(`/api/worker/events/${draft.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: draft.name,
        eventType: draft.eventType,
        status: draft.status,
        eventDate: draft.eventDate,
        startTime: draft.startTime,
        endTime: draft.endTime,
        guestCount: draft.guestCount,
        diningStyle: draft.diningStyle,
        contactName: draft.contactName,
        contactEmail: draft.contactEmail,
        contactPhone: draft.contactPhone,
        menuId: draft.menuId,
        serviceId: draft.serviceId,
        setupId: draft.setupId,
        depositAmount: draft.depositAmount,
        paymentStatus: draft.paymentStatus,
        notes: draft.notes,
      }),
    })
    if (!eventRes.ok) {
      setPushing(false)
      setPushMsg('FIX THE SAVE ERROR FIRST')
      return
    }
    const r = await fetch(`/api/worker/events/${draft.id}/push`, { method: 'POST' })
    setPushing(false)
    const d = await r.json().catch(() => ({}))
    if (!r.ok) {
      setPushMsg(d.error ?? 'COULD NOT PUSH')
      return
    }
    setPushMsg(
      `PUSHED${d.orderNumber ? ` · ${d.orderNumber}` : ''}${
        Array.isArray(d.warnings) && d.warnings.length ? ` · ${d.warnings.length} WARNING(S)` : ''
      }`,
    )
  }

  if (loading || allowed === null) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="font-mono text-sm text-grey-light loading-cursor">LOADING</p>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="w-full max-w-sm border border-grey-mid p-6 space-y-3 text-center">
          <p className="font-mono text-sm font-bold uppercase text-white">NOT AUTHORISED</p>
          <p className="font-mono text-xs text-grey-light">
            ASK AN ADMIN TO GRANT EVENTS / BEO ACCESS (CREATE OR EDIT).
          </p>
        </div>
      </div>
    )
  }

  if (draft) {
    const eventValues = draft as unknown as Record<string, unknown>
    return (
      <div className="min-h-screen bg-black pb-24">
        <div className="sticky top-0 z-20 bg-black border-b border-grey-mid px-3 py-2 flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>← BACK</Button>
          <span className="font-mono text-xs uppercase text-white truncate flex-1">{draft.name || 'UNTITLED'}</span>
          {draft.status === 'ENQUIRY' && (
            <Button size="sm" variant="ghost" onClick={convert} loading={converting}>CONVERT</Button>
          )}
          <Button size="sm" variant="ghost" onClick={push} loading={pushing}>PUSH</Button>
          <Button size="sm" onClick={save} loading={saving}>SAVE</Button>
        </div>

        <div className="p-3 space-y-3">
          {error && <p className="font-mono text-[10px] text-danger uppercase">{error}</p>}
          {pushMsg && <p className="font-mono text-[10px] text-accent uppercase">{pushMsg}</p>}

          <Input label="Name" value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <Input label="Date" type="date" value={draft.eventDate} onChange={(e) => patch({ eventDate: e.target.value })} />
            <Input label="Guests" type="number" value={String(draft.guestCount)} onChange={(e) => patch({ guestCount: Number(e.target.value) })} />
            <Input label="Start" type="time" value={draft.startTime ?? ''} onChange={(e) => patch({ startTime: e.target.value })} />
            <Input label="End" type="time" value={draft.endTime ?? ''} onChange={(e) => patch({ endTime: e.target.value })} />
            <Input label="Type" value={draft.eventType ?? ''} placeholder="WEDDING" onChange={(e) => patch({ eventType: e.target.value })} />
            <Input label="Style" value={draft.diningStyle ?? ''} placeholder="PLATED" onChange={(e) => patch({ diningStyle: e.target.value })} />
          </div>
          <Select label="Status" value={draft.status} options={STATUSES.map((s) => ({ value: s, label: s }))} onChange={(e) => patch({ status: e.target.value })} />
          <Select label="Payment" value={draft.paymentStatus} options={PAYMENTS.map((p) => ({ value: p, label: p }))} onChange={(e) => patch({ paymentStatus: e.target.value })} />
          <Input label="Contact name" value={draft.contactName ?? ''} onChange={(e) => patch({ contactName: e.target.value })} />
          <Input label="Contact phone" value={draft.contactPhone ?? ''} onChange={(e) => patch({ contactPhone: e.target.value })} />
          <div>
            <label className="block font-mono text-[10px] uppercase text-grey-light mb-1">Notes</label>
            <textarea rows={3} value={draft.notes ?? ''} onChange={(e) => patch({ notes: e.target.value })} className={`${inputClass} resize-y`} />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[10px] uppercase text-grey-light">PDF:</span>
            {([
              ['FULL', 'BEO'],
              ['CLIENT', 'CLIENT'],
              ['KITCHEN', 'KITCHEN'],
            ] as const).map(([variant, label]) => (
              <a
                key={variant}
                href={`/api/worker/events/${draft.id}/pdf?variant=${variant}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[10px] uppercase tracking-wider border border-grey-mid text-white px-2 py-1 hover:border-white transition-colors"
              >
                {label}
              </a>
            ))}
          </div>

          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">BLOCKS</h3>
              <Button size="sm" variant="ghost" onClick={() => setShowLibrary(true)}>+ ADD BLOCK</Button>
            </div>

            {draft.blocks.length === 0 && (
              <p className="font-mono text-[10px] uppercase text-grey-light text-center py-3">NO BLOCKS YET.</p>
            )}

            {draft.blocks.map((b, i) => {
              const open = expanded.has(b.id)
              return (
                <div key={b.id} className="border border-grey-mid">
                  <div className="flex items-center gap-1 px-1.5 py-1 bg-grey-dark/40">
                    <button
                      type="button"
                      onClick={() => setExpanded((prev) => { const n = new Set(prev); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n })}
                      className="flex-1 min-w-0 text-left px-1 py-2.5 font-mono text-xs uppercase text-white truncate"
                    >
                      {open ? '▾' : '▸'} {b.title?.trim() || blockLabel(b.type, library)}
                    </button>
                    <button type="button" disabled={i === 0} aria-label="Move up" onClick={() => setDraft((d) => (d ? { ...d, blocks: moveBlock(d.blocks, i, -1) } : d))} className="w-10 h-10 flex items-center justify-center font-mono text-base text-grey-light hover:text-white disabled:opacity-30">↑</button>
                    <button type="button" disabled={i === draft.blocks.length - 1} aria-label="Move down" onClick={() => setDraft((d) => (d ? { ...d, blocks: moveBlock(d.blocks, i, 1) } : d))} className="w-10 h-10 flex items-center justify-center font-mono text-base text-grey-light hover:text-white disabled:opacity-30">↓</button>
                    <button type="button" aria-label="Delete block" onClick={() => setDraft((d) => (d ? { ...d, blocks: d.blocks.filter((x) => x.id !== b.id) } : d))} className="w-10 h-10 flex items-center justify-center font-mono text-base text-grey-light hover:text-danger">✕</button>
                  </div>
                  <p className="px-2.5 pb-1 font-mono text-[9px] uppercase text-grey-light truncate">{summariseBlock(b, library)}</p>
                  {open && (
                    <div className="p-3 border-t border-grey-mid space-y-3">
                      <BeoBlockReferences blockType={b.type} library={library} mode="worker" />
                      <BeoBlockEditor
                        type={b.type}
                        config={b.config}
                        eventValues={eventValues}
                        menus={refs.menus}
                        menuItems={refs.menuItems}
                        setups={refs.setups}
                        library={library}
                        onConfigChange={(config) => setDraft((d) => (d ? { ...d, blocks: d.blocks.map((x) => (x.id === b.id ? { ...x, config } : x)) } : d))}
                        onEventFieldChange={(field, value) => patch({ [field]: value } as Partial<WorkerEvent>)}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <Modal isOpen={showLibrary} onClose={() => setShowLibrary(false)} title="ADD BLOCK">
          <BeoBlockLibrary onAdd={addBlock} library={library} />
        </Modal>
      </div>
    )
  }

  const shown = events.filter((e) =>
    view === 'ALL' ? true : view === 'ENQUIRIES' ? e.status === 'ENQUIRY' : e.status !== 'ENQUIRY',
  )

  return (
    <div className="min-h-screen bg-black pb-16">
      <div className="px-4 pt-6 pb-4 border-b border-grey-mid space-y-3">
        <div className="flex items-center gap-2">
          <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white flex-1">ENQUIRIES / EVENTS</h1>
          <Button size="sm" onClick={() => { setNewIsEnquiry(view !== 'EVENTS'); setCreateOpen(true) }}>+ NEW</Button>
        </div>
        <div className="flex gap-1">
          {(['ENQUIRIES', 'EVENTS', 'ALL'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`font-mono text-[10px] uppercase px-2 py-1 border ${view === v ? 'border-white text-white bg-grey-mid' : 'border-grey-mid text-grey-light'}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-2">
        {error && <p className="font-mono text-[10px] text-danger uppercase">{error}</p>}
        {shown.length === 0 ? (
          <p className="font-mono text-xs uppercase text-grey-light text-center py-6">NOTHING HERE YET.</p>
        ) : (
          shown.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setDraft(toDraft(e))}
              className="w-full text-left bg-grey-dark border border-grey-mid hover:border-white transition-colors p-3 space-y-1"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm uppercase text-white truncate flex-1">{e.name}</span>
                <span className="font-mono text-[9px] uppercase text-grey-light">{e.status}</span>
              </div>
              <p className="font-mono text-[10px] uppercase text-grey-light">
                {new Date(e.eventDate).toISOString().slice(0, 10)}
                {e.startTime ? ` · ${e.startTime}` : ''} · {e.guestCount} PAX
              </p>
            </button>
          ))
        )}
      </div>

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title={newIsEnquiry ? 'NEW ENQUIRY' : 'NEW EVENT'}>
        <div className="space-y-3">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setNewIsEnquiry(true)}
              className={`flex-1 font-mono text-[10px] uppercase px-2 py-1.5 border ${newIsEnquiry ? 'border-white text-white bg-grey-mid' : 'border-grey-mid text-grey-light'}`}
            >
              ENQUIRY (FROM MASTER)
            </button>
            <button
              type="button"
              onClick={() => setNewIsEnquiry(false)}
              className={`flex-1 font-mono text-[10px] uppercase px-2 py-1.5 border ${!newIsEnquiry ? 'border-white text-white bg-grey-mid' : 'border-grey-mid text-grey-light'}`}
            >
              BLANK EVENT
            </button>
          </div>
          <Input label="Name" value={newName} placeholder="SMITH WEDDING" onChange={(e) => setNewName(e.target.value)} />
          <Input label="Date" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          <Input label="Guests" type="number" value={newPax} onChange={(e) => setNewPax(e.target.value)} />
          {error && <p className="font-mono text-xs text-danger uppercase">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setCreateOpen(false)}>CANCEL</Button>
            <Button size="sm" onClick={createEvent} loading={creating} disabled={!newName.trim()}>CREATE</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
