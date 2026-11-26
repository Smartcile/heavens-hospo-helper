'use client'

// The BEO builder: the event header form plus the drag-from-library block
// canvas. Owns the editable draft and persists via the events API.

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { BeoBlockEditor, type BeoSetupOption } from '@/components/admin/BeoBlockEditor'
import { RoomSetupCard } from '@/components/RoomSetupCard'
import { roomSetupLabel } from '@/lib/room-setup'
import { BeoBlockLibrary, BEO_BLOCK_DRAG_PREFIX } from '@/components/admin/BeoBlockLibrary'
import { BeoBlockReferences } from '@/components/admin/BeoBlockReferences'
import { EventPromptModal, type EventPromptApply } from '@/components/admin/EventPromptModal'
import type { EventPromptEvent } from '@/lib/event-prompt'
import {
  BEO_BLOCKS,
  BLOCK_STATES,
  blockLabel,
  blockState,
  defaultConfigFor,
  moveBlock,
  setBlockState,
  summariseBlock,
  type BlockLibrary,
  type BlockState,
} from '@/lib/beo-blocks'
import { computeEventTotals, type EventBlockLike } from '@/lib/event-pricing'
import { PdfViewerModal, type PdfViewerTarget } from '@/components/ui/PdfViewerModal'
import { inlinePdfUrl } from '@/lib/pdf-actions'

export interface BeoBlockRow {
  id: string
  type: string
  title: string | null
  config: Record<string, unknown>
  sortOrder: number
}

export interface EventHistoryEntry {
  at: string
  type: string
  note: string
}

export interface EventDetail {
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
  /** The physical room this event occupies (#189). */
  areaId?: string | null
  pushToBookings: boolean
  depositAmount: number | null
  paymentStatus: string
  notes: string | null
  internalNotes: string | null
  shareEnabled?: boolean
  shareExpiresAt?: string | null
  blocks: BeoBlockRow[]
  changeRequests?: { id: string; kind: string; status: string; message: string }[]
  /** Append-only activity log (CREATED / STATUS / BLOCKS / LLM_PASTE …). */
  history?: EventHistoryEntry[]
  /** Venue name for the prompt / header; present on the API payload. */
  venue?: { name: string } | null
}

interface Option { id: string; name: string }

export interface BeoRefs {
  menus: (Option & { pricingMode?: string | null; pricePerPerson?: number | null })[]
  menuItems: (Option & {
    price?: number
    pricingMode?: string | null
    servesMin?: number | null
    servesMax?: number | null
    minQty?: number | null
    leadTimeDays?: number | null
  })[]
  services: Option[]
  setups: BeoSetupOption[]
  /** Physical rooms (owned + shared) for the event's room picker (#189). */
  areas?: Option[]
}

interface Draft extends Omit<EventDetail, 'blocks' | 'eventDate' | 'depositAmount'> {
  eventDate: string
  depositAmount: string
  blocks: BeoBlockRow[]
}

const STATUSES = ['DRAFT', 'TENTATIVE', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']
const PAYMENTS = ['UNPAID', 'PARTIAL', 'PAID', 'REFUNDED']

const textareaClass =
  'w-full bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white placeholder:text-grey-light'

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `new_${crypto.randomUUID()}`
  }
  return `new_${Math.random().toString(36).slice(2)}`
}

function dateKey(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? String(iso ?? '').slice(0, 10) : d.toISOString().slice(0, 10)
}

function toDraft(e: EventDetail): Draft {
  return {
    ...e,
    eventDate: dateKey(e.eventDate),
    depositAmount: e.depositAmount == null ? '' : String(e.depositAmount),
    blocks: (e.blocks ?? []).map((b, i) => ({ ...b, sortOrder: i })),
  }
}

export function EventBuilder({
  event,
  venueId,
  refs,
  library = BEO_BLOCKS,
  onBack,
  onSaved,
}: {
  event: EventDetail
  venueId: string
  refs: BeoRefs
  library?: BlockLibrary
  onBack: () => void
  onSaved: () => void
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(event))
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)

  const [tplOpen, setTplOpen] = useState(false)
  const [tplName, setTplName] = useState('')
  const [tplCategory, setTplCategory] = useState('')
  const [tplSaving, setTplSaving] = useState(false)
  const [tplMsg, setTplMsg] = useState('')

  const [pushing, setPushing] = useState(false)
  const [pushMsg, setPushMsg] = useState('')

  const [shareOpen, setShareOpen] = useState(false)
  const [shareUrl, setShareUrl] = useState('')
  const [shareExpiry, setShareExpiry] = useState('')
  const [shareBusy, setShareBusy] = useState(false)
  const [shareMsg, setShareMsg] = useState('')
  const [pdfTarget, setPdfTarget] = useState<PdfViewerTarget | null>(null)
  const [promptOpen, setPromptOpen] = useState(false)

  function patch(p: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...p }))
  }

  function addBlock(type: string) {
    setDraft((d) => {
      const id = newId()
      const block: BeoBlockRow = {
        id,
        type,
        title: null,
        config: defaultConfigFor(type, library),
        sortOrder: d.blocks.length,
      }
      setExpanded((prev) => new Set(prev).add(id))
      return { ...d, blocks: [...d.blocks, block] }
    })
  }

  function updateBlock(id: string, p: Partial<BeoBlockRow>) {
    setDraft((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === id ? { ...b, ...p } : b)) }))
  }

  function removeBlock(id: string) {
    setDraft((d) => ({ ...d, blocks: d.blocks.filter((b) => b.id !== id) }))
  }

  function duplicateBlock(id: string) {
    setDraft((d) => {
      const idx = d.blocks.findIndex((b) => b.id === id)
      if (idx < 0) return d
      const src = d.blocks[idx]
      const copy: BeoBlockRow = {
        ...src,
        id: newId(),
        config: JSON.parse(JSON.stringify(src.config)) as Record<string, unknown>,
      }
      const blocks = [...d.blocks]
      blocks.splice(idx + 1, 0, copy)
      return { ...d, blocks: blocks.map((b, i) => ({ ...b, sortOrder: i })) }
    })
  }

  function move(id: string, dir: -1 | 1) {
    setDraft((d) => {
      const idx = d.blocks.findIndex((b) => b.id === id)
      return { ...d, blocks: moveBlock(d.blocks, idx, dir) }
    })
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function save(opts?: { historyNote?: string; draftOverride?: Draft }): Promise<boolean> {
    const d = opts?.draftOverride ?? draft
    setSaving(true)
    setError('')

    const eventRes = await fetch(`/api/admin/events/${event.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: d.name,
        eventType: d.eventType,
        status: d.status,
        eventDate: d.eventDate,
        startTime: d.startTime,
        endTime: d.endTime,
        guestCount: d.guestCount,
        diningStyle: d.diningStyle,
        contactName: d.contactName,
        contactEmail: d.contactEmail,
        contactPhone: d.contactPhone,
        menuId: d.menuId,
        serviceId: d.serviceId,
        setupId: d.setupId,
        areaId: d.areaId ?? null,
        pushToBookings: d.pushToBookings,
        depositAmount: d.depositAmount === '' ? null : Number(d.depositAmount),
        paymentStatus: d.paymentStatus,
        notes: d.notes,
        internalNotes: d.internalNotes,
      }),
    })
    if (!eventRes.ok) {
      const body = await eventRes.json().catch(() => ({}))
      setSaving(false)
      setError(body.error ?? 'COULD NOT SAVE EVENT')
      return false
    }

    const blocksRes = await fetch(`/api/admin/events/${event.id}/blocks`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blocks: d.blocks.map((b) => ({
          id: b.id.startsWith('new_') ? null : b.id,
          type: b.type,
          title: b.title,
          config: b.config,
        })),
        historyNote: opts?.historyNote,
      }),
    })
    if (!blocksRes.ok) {
      const body = await blocksRes.json().catch(() => ({}))
      setSaving(false)
      setError(body.error ?? 'EVENT SAVED, BUT BLOCKS FAILED')
      return false
    }

    // Re-seed the draft so newly created blocks pick up their real ids —
    // otherwise the next save re-creates them and churns the rows.
    const fresh = await fetch(`/api/admin/events/${event.id}`)
    if (fresh.ok) setDraft(toDraft((await fresh.json()) as EventDetail))
    setSaving(false)
    onSaved()
    return true
  }

  async function saveAsTemplate() {
    if (!tplName.trim()) return
    setTplSaving(true)
    setTplMsg('')
    // Snapshot the CURRENT blocks, so persist the event first.
    const ok = await save()
    if (!ok) {
      setTplSaving(false)
      setTplMsg('FIX THE SAVE ERROR FIRST')
      return
    }
    const r = await fetch('/api/admin/event-templates/from-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: event.id,
        venueId,
        name: tplName,
        category: tplCategory || null,
      }),
    })
    setTplSaving(false)
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setTplMsg(d.error ?? 'COULD NOT SAVE TEMPLATE')
      return
    }
    setTplOpen(false)
    setTplName('')
    setTplCategory('')
  }

  async function push() {
    setPushing(true)
    setPushMsg('')
    // The push reads the stored event, so persist first.
    const ok = await save()
    if (!ok) {
      setPushing(false)
      setPushMsg('FIX THE SAVE ERROR FIRST')
      return
    }
    const r = await fetch(`/api/admin/events/${event.id}/push`, { method: 'POST' })
    setPushing(false)
    const d = await r.json().catch(() => ({}))
    if (!r.ok) {
      setPushMsg(d.error ?? 'COULD NOT PUSH')
      return
    }
    setPushMsg(
      `PUSHED — BOOKING ${String(d.bookingId).slice(0, 8).toUpperCase()}` +
        (d.orderNumber ? ` · PRE-ORDER ${d.orderNumber}` : '') +
        (Array.isArray(d.warnings) && d.warnings.length ? ` · ${d.warnings.join('; ')}` : ''),
    )
  }

  async function generateShare() {
    setShareBusy(true)
    setShareMsg('')
    const r = await fetch(`/api/admin/events/${event.id}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresAt: shareExpiry || null }),
    })
    setShareBusy(false)
    const d = await r.json().catch(() => ({}))
    if (!r.ok) {
      setShareMsg(d.error ?? 'COULD NOT CREATE LINK')
      return
    }
    setShareUrl(d.url)
    setShareMsg('LINK CREATED — COPY IT NOW, IT IS ONLY SHOWN ONCE')
    onSaved()
  }

  async function revokeShare() {
    setShareBusy(true)
    setShareMsg('')
    const r = await fetch(`/api/admin/events/${event.id}/share`, { method: 'DELETE' })
    setShareBusy(false)
    if (!r.ok) {
      setShareMsg('COULD NOT REVOKE')
      return
    }
    setShareUrl('')
    setShareMsg('LINK REVOKED')
    onSaved()
  }

  async function applyPrompt(result: EventPromptApply): Promise<boolean> {
    const fields = { ...result.patch } as Record<string, unknown>
    if ('depositAmount' in fields) {
      fields.depositAmount = fields.depositAmount == null ? '' : String(fields.depositAmount)
    }
    const next: Draft = {
      ...draft,
      ...(fields as Partial<Draft>),
      blocks: result.blocks ?? draft.blocks,
    }
    setDraft(next)
    return save({ historyNote: result.summary, draftOverride: next })
  }

  const today = new Date().toISOString().slice(0, 10)
  // The event's bound menu is the package — a PER_PERSON menu prices per head.
  // Matches the server readers (buildEventPricing) so the builder cannot drift.
  const boundMenu = draft.menuId ? refs.menus.find((m) => m.id === draft.menuId) : undefined
  const packages =
    boundMenu && boundMenu.pricingMode === 'PER_PERSON' && boundMenu.pricePerPerson != null
      ? [{ id: boundMenu.id, name: boundMenu.name, price: Number(boundMenu.pricePerPerson) }]
      : []

  const totals = computeEventTotals(
    draft.blocks as unknown as EventBlockLike[],
    refs.menuItems.map((m) => ({
      id: m.id,
      name: m.name,
      price: m.price ?? 0,
      pricingMode: m.pricingMode ?? null,
      servesMin: m.servesMin ?? null,
      servesMax: m.servesMax ?? null,
      minQty: m.minQty ?? null,
      leadTimeDays: m.leadTimeDays ?? null,
    })),
    draft.depositAmount === '' ? 0 : Number(draft.depositAmount),
    {
      guestCount: draft.guestCount,
      eventDate: draft.eventDate,
      today,
      ...(packages.length > 0 ? { packages } : {}),
    },
  )

  const eventValues = draft as unknown as Record<string, unknown>

  return (
    <div className="space-y-4" data-testid="beo-builder">
      <div className="sticky top-[var(--admin-topbar-h)] z-10 bg-black border-b border-grey-mid -mx-4 px-4 py-2 flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="ghost" onClick={onBack}>← BACK</Button>
        <span className="font-mono text-xs uppercase text-white truncate">{draft.name || 'UNTITLED EVENT'}</span>
        <span className="font-mono text-xs uppercase text-grey-light">{draft.eventDate}</span>
        <div className="flex-1" />
        {error && <span className="font-mono text-xs text-danger uppercase">{error}</span>}
        <Button size="sm" variant="ghost" onClick={() => setShareOpen(true)}>SHARE</Button>
        <Button size="sm" variant="ghost" onClick={() => setPromptOpen(true)}>PROMPT</Button>
        <Button size="sm" variant="ghost" onClick={() => setTplOpen(true)}>SAVE AS TEMPLATE</Button>
        <Button size="sm" onClick={() => save()} loading={saving}>SAVE</Button>
      </div>

      {/* Event header */}
      <div className="border border-grey-mid p-4 space-y-3">
        <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">EVENT DETAILS</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input label="Name" value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
          <Input label="Type" value={draft.eventType ?? ''} placeholder="WEDDING" onChange={(e) => patch({ eventType: e.target.value })} />
          <Select label="Status" value={draft.status} options={STATUSES.map((s) => ({ value: s, label: s }))} onChange={(e) => patch({ status: e.target.value })} />
          <Input label="Date" type="date" value={draft.eventDate} onChange={(e) => patch({ eventDate: e.target.value })} />
          <Input label="Start" type="time" value={draft.startTime ?? ''} onChange={(e) => patch({ startTime: e.target.value })} />
          <Input label="End" type="time" value={draft.endTime ?? ''} onChange={(e) => patch({ endTime: e.target.value })} />
          <Input label="Guests" type="number" data-testid="event-guests" value={String(draft.guestCount)} onChange={(e) => patch({ guestCount: Number(e.target.value) })} />
          <Input label="Dining style" value={draft.diningStyle ?? ''} placeholder="PLATED" onChange={(e) => patch({ diningStyle: e.target.value })} />
          <Select
            label="Room setup"
            value={draft.setupId ?? ''}
            options={[{ value: '', label: '— NONE —' }, ...refs.setups.map((s) => ({ value: s.id, label: roomSetupLabel(s) }))]}
            onChange={(e) => patch({ setupId: e.target.value || null })}
          />
          <Select
            label="Room"
            value={draft.areaId ?? ''}
            options={[{ value: '', label: '— NONE —' }, ...(refs.areas ?? []).map((a) => ({ value: a.id, label: a.name }))]}
            onChange={(e) => patch({ areaId: e.target.value || null })}
          />
        </div>

        {(() => {
          const picked = refs.setups.find((s) => s.id === draft.setupId)
          return picked ? <RoomSetupCard setup={picked} /> : null
        })()}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input label="Contact name" value={draft.contactName ?? ''} onChange={(e) => patch({ contactName: e.target.value })} />
          <Input label="Contact email" value={draft.contactEmail ?? ''} onChange={(e) => patch({ contactEmail: e.target.value })} />
          <Input label="Contact phone" value={draft.contactPhone ?? ''} onChange={(e) => patch({ contactPhone: e.target.value })} />
          <Select
            label="Menu"
            value={draft.menuId ?? ''}
            options={[{ value: '', label: '— NONE —' }, ...refs.menus.map((m) => ({ value: m.id, label: m.name }))]}
            onChange={(e) => patch({ menuId: e.target.value || null })}
          />
          <Select
            label="Service"
            value={draft.serviceId ?? ''}
            options={[{ value: '', label: '— NONE —' }, ...refs.services.map((s) => ({ value: s.id, label: s.name }))]}
            onChange={(e) => patch({ serviceId: e.target.value || null })}
          />
          <Select
            label="Payment status"
            value={draft.paymentStatus}
            options={PAYMENTS.map((p) => ({ value: p, label: p }))}
            onChange={(e) => patch({ paymentStatus: e.target.value })}
          />
          <Input label="Deposit" type="number" value={draft.depositAmount} onChange={(e) => patch({ depositAmount: e.target.value })} />
          <label className="flex items-end gap-2 pb-1.5 font-mono text-xs uppercase text-grey-light">
            <input
              type="checkbox"
              checked={draft.pushToBookings}
              onChange={(e) => patch({ pushToBookings: e.target.checked })}
            />
            PUSH TO BOOKINGS / CALENDAR
          </label>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="ghost" onClick={push} loading={pushing}>PUSH NOW</Button>
          <span className="font-mono text-xs uppercase text-grey-light">
            CREATES THE BOOKING, SEATS THE PARTY AND RAISES THE PRE-ORDER
          </span>
          {pushMsg && <span className="font-mono text-xs uppercase text-accent">{pushMsg}</span>}
        </div>

        <div className="border border-grey-mid p-3 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="font-mono text-xs uppercase text-grey-light mb-0.5">SUBTOTAL</div>
              <div className="font-mono text-sm text-white">${totals.subtotal.toFixed(2)}</div>
            </div>
            <div>
              <div className="font-mono text-xs uppercase text-grey-light mb-0.5">DEPOSIT</div>
              <div className="font-mono text-sm text-white">${totals.deposit.toFixed(2)}</div>
            </div>
            <div>
              <div className="font-mono text-xs uppercase text-grey-light mb-0.5">BALANCE</div>
              <div className={`font-mono text-sm ${totals.balance <= 0 ? 'text-success' : 'text-white'}`}>
                ${totals.balance.toFixed(2)}
              </div>
            </div>
          </div>
          {(totals.byUnit.PER_PERSON > 0 || totals.byUnit.PER_PLATTER > 0 || totals.byUnit.EACH > 0) && (
            <div className="grid grid-cols-3 gap-3 border-t border-grey-mid pt-2" data-testid="pricing-by-unit">
              {([
                ['PER_PERSON', 'PER PERSON'],
                ['PER_PLATTER', 'PER PLATTER'],
                ['EACH', 'EACH'],
              ] as const).map(([unit, label]) => (
                <div key={unit}>
                  <div className="font-mono text-xs uppercase text-grey-light mb-0.5">{label}</div>
                  <div className="font-mono text-xs text-white">${totals.byUnit[unit].toFixed(2)}</div>
                </div>
              ))}
            </div>
          )}
          {totals.violations.length > 0 && (
            <div className="border border-danger p-2 space-y-1" data-testid="pricing-violations">
              {totals.violations.map((v, i) => (
                <p key={`${v.kind}-${i}`} className="font-mono text-2xs uppercase text-danger">
                  {v.message}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs uppercase text-grey-light">PDF:</span>
          {([
            ['FULL', 'FULL BEO'],
            ['CLIENT', 'CLIENT COPY'],
            ['KITCHEN', 'KITCHEN COPY'],
          ] as const).map(([variant, label]) => {
            const downloadUrl = `/api/admin/events/${event.id}/pdf?variant=${variant}`
            return (
              <button
                key={variant}
                type="button"
                onClick={() =>
                  setPdfTarget({
                    url: inlinePdfUrl(downloadUrl),
                    downloadUrl,
                    filename: `${event.name} - ${label}.pdf`,
                    title: `${event.name} — ${label}`,
                  })
                }
                className="font-mono text-xs uppercase tracking-wider border border-grey-mid text-white px-2 py-1 hover:border-white transition-colors"
              >
                {label}
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block font-mono text-xs uppercase text-grey-light mb-1">Notes</label>
            <textarea rows={2} value={draft.notes ?? ''} onChange={(e) => patch({ notes: e.target.value })} className={textareaClass} />
          </div>
          <div>
            <label className="block font-mono text-xs uppercase text-grey-light mb-1">Internal notes</label>
            <textarea rows={2} value={draft.internalNotes ?? ''} onChange={(e) => patch({ internalNotes: e.target.value })} className={textareaClass} />
          </div>
        </div>
      </div>

      {/* Blocks + library */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_16rem] gap-4 items-start">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const raw = e.dataTransfer.getData('text/plain')
            if (raw.startsWith(BEO_BLOCK_DRAG_PREFIX)) addBlock(raw.slice(BEO_BLOCK_DRAG_PREFIX.length))
          }}
          className={`border p-3 space-y-2 min-h-[8rem] transition-colors ${dragOver ? 'border-accent bg-accent/5' : 'border-grey-mid'}`}
        >
          <div className="flex items-center justify-between">
            <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">EVENT BLOCKS</h3>
            <span className="font-mono text-xs uppercase text-grey-light">{draft.blocks.length} BLOCK(S)</span>
          </div>

          {draft.blocks.length === 0 && (
            <p className="font-mono text-xs uppercase text-grey-light py-4 text-center">
              DRAG A BLOCK FROM THE LIBRARY, OR CLICK ONE TO ADD IT.
            </p>
          )}

          {draft.blocks.map((b, i) => {
            const open = expanded.has(b.id)
            return (
              <div key={b.id} className="border border-grey-mid">
                <div className="bg-grey-dark/40">
                  <div className="flex items-center gap-1 px-1.5 py-1">
                    <button
                      type="button"
                      onClick={() => toggle(b.id)}
                      className="flex-1 min-w-0 text-left px-1 py-2 font-mono text-xs uppercase text-white truncate"
                    >
                      {open ? '▾' : '▸'} {b.title?.trim() || blockLabel(b.type, library)}
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <select
                        aria-label="Block state"
                        value={blockState(b)}
                        onChange={(e) =>
                          updateBlock(b.id, {
                            config: setBlockState(b.config, e.target.value as BlockState),
                          })
                        }
                        className="bg-black border border-grey-mid text-white font-mono text-2xs uppercase px-1 py-1 outline-none focus:border-white"
                      >
                        {BLOCK_STATES.map((state) => (
                          <option key={state} value={state}>{state}</option>
                        ))}
                      </select>
                      <button type="button" onClick={() => move(b.id, -1)} disabled={i === 0} className="w-9 h-9 flex items-center justify-center font-mono text-sm text-grey-light hover:text-white disabled:opacity-30" aria-label="Move up">↑</button>
                      <button type="button" onClick={() => move(b.id, 1)} disabled={i === draft.blocks.length - 1} className="w-9 h-9 flex items-center justify-center font-mono text-sm text-grey-light hover:text-white disabled:opacity-30" aria-label="Move down">↓</button>
                      <button type="button" onClick={() => duplicateBlock(b.id)} className="h-9 px-2 flex items-center justify-center font-mono text-xs text-grey-light hover:text-white" aria-label="Duplicate">DUP</button>
                      <button type="button" onClick={() => removeBlock(b.id)} className="w-9 h-9 flex items-center justify-center font-mono text-sm text-grey-light hover:text-danger" aria-label="Delete block">✕</button>
                    </div>
                  </div>
                  {!open && (
                    <p className="px-2.5 pb-2 -mt-1 font-mono text-xs uppercase text-grey-light truncate">
                      <span className={`border px-1 mr-1 ${blockState(b) === 'CONFIRMED' ? 'border-success text-success' : blockState(b) === 'SENT' ? 'border-warning text-warning' : 'border-grey-mid text-grey-light'}`}>
                        {blockState(b)}
                      </span>
                      {summariseBlock(b, library)}
                    </p>
                  )}
                </div>
                {open && (
                  <div className="p-3 border-t border-grey-mid space-y-3">
                    <BeoBlockReferences blockType={b.type} library={library} mode="admin" venueId={venueId} />
                    <BeoBlockEditor
                      type={b.type}
                      config={b.config}
                      eventValues={eventValues}
                      menus={refs.menus}
                      menuItems={refs.menuItems}
                      setups={refs.setups}
                      library={library}
                      guestCount={draft.guestCount}
                      eventDate={draft.eventDate}
                      today={today}
                      onConfigChange={(config) => updateBlock(b.id, { config })}
                      onEventFieldChange={(field, value) => patch({ [field]: value } as Partial<Draft>)}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <BeoBlockLibrary onAdd={addBlock} library={library} />
      </div>

      <p className="font-mono text-xs uppercase text-grey-light">
        VENUE {venueId.slice(0, 8)} · BLOCKS SAVE WITH THE EVENT
      </p>

      {/* Read-only activity log — where an LLM_PASTE apply is recorded. */}
      <div className="border border-grey-mid p-3 space-y-2" data-testid="event-history">
        <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">HISTORY</h3>
        {(draft.history ?? []).length === 0 ? (
          <p className="font-mono text-xs uppercase text-grey-light">NO ACTIVITY YET.</p>
        ) : (
          <ul className="divide-y divide-grey-mid">
            {(draft.history ?? []).map((entry, i) => (
              <li key={`${entry.at}-${i}`} className="py-1.5 font-mono text-xs text-white">
                <span className="text-grey-light uppercase">{entry.at.slice(0, 16).replace('T', ' ')}</span>{' '}
                <span className="border border-grey-mid px-1 uppercase text-grey-light">{entry.type}</span>{' '}
                <span className="uppercase">{entry.note}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {promptOpen && (
        <EventPromptModal
          isOpen={promptOpen}
          onClose={() => setPromptOpen(false)}
          event={draft as unknown as EventPromptEvent}
          blocks={draft.blocks}
          refs={{
            venueName: draft.venue?.name,
            menus: refs.menus,
            menuItems: refs.menuItems,
            services: refs.services,
            setups: refs.setups,
          }}
          library={library}
          onApply={applyPrompt}
        />
      )}

      <Modal isOpen={tplOpen} onClose={() => setTplOpen(false)} title="SAVE AS TEMPLATE">
        <div className="space-y-3">
          <p className="font-mono text-xs uppercase text-grey-light">
            COPIES THE EVENT BLOCKS, MENU, LAYOUT, PAX AND STYLE INTO A REUSABLE TEMPLATE.
          </p>
          <Input label="Template name" value={tplName} placeholder="WEDDING PACKAGE — 100 PAX" onChange={(e) => setTplName(e.target.value)} />
          <Input label="Category" value={tplCategory} placeholder="WEDDING" onChange={(e) => setTplCategory(e.target.value)} />
          {tplMsg && <p className="font-mono text-xs text-danger uppercase">{tplMsg}</p>}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setTplOpen(false)}>CANCEL</Button>
            <Button size="sm" onClick={saveAsTemplate} loading={tplSaving} disabled={!tplName.trim()}>SAVE TEMPLATE</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={shareOpen} onClose={() => setShareOpen(false)} title="CUSTOMER LINK">
        <div className="space-y-3">
          <p className="font-mono text-xs uppercase text-grey-light">
            ANYONE WITH THIS LINK CAN VIEW THE EVENT — INTERNAL NOTES, STAFFING AND HISTORY ARE HIDDEN — AND CAN
            APPROVE, SIGN OFF OR REQUEST CHANGES.
          </p>
          <p className="font-mono text-xs uppercase text-grey-light">
            STATUS: {event.shareEnabled ? 'ACTIVE' : 'OFF'}
            {event.shareExpiresAt ? ` · EXPIRES ${event.shareExpiresAt.slice(0, 10)}` : ''}
          </p>

          {shareUrl && (
            <div className="border border-grey-mid p-2 space-y-1">
              <p className="font-mono text-xs text-white break-all">{shareUrl}</p>
              <Button size="sm" variant="ghost" onClick={() => navigator.clipboard?.writeText(shareUrl)}>
                COPY LINK
              </Button>
            </div>
          )}

          <Input label="Expiry (optional)" type="date" value={shareExpiry} onChange={(e) => setShareExpiry(e.target.value)} />

          {shareMsg && <p className="font-mono text-xs uppercase text-accent">{shareMsg}</p>}

          <div className="flex justify-end gap-2">
            {event.shareEnabled && (
              <Button size="sm" variant="danger" onClick={revokeShare} loading={shareBusy}>REVOKE</Button>
            )}
            <Button size="sm" onClick={generateShare} loading={shareBusy}>
              {event.shareEnabled ? 'REGENERATE LINK' : 'GENERATE LINK'}
            </Button>
          </div>
        </div>
      </Modal>

      {pdfTarget && <PdfViewerModal target={pdfTarget} onClose={() => setPdfTarget(null)} />}
    </div>
  )
}
