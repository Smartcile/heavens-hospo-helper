'use client'

// Event templates (packages): reusable block sets with default menu / service /
// layout and headcount. Applying one creates a DRAFT event to finish off.

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { BeoBlockEditor } from '@/components/admin/BeoBlockEditor'
import { BeoBlockLibrary, BEO_BLOCK_DRAG_PREFIX } from '@/components/admin/BeoBlockLibrary'
import { blockLabel, defaultConfigFor, moveBlock } from '@/lib/beo-blocks'
import { useBlockLibrary } from '@/lib/use-block-library'

interface TemplateRow {
  id: string
  name: string
  description: string | null
  category: string | null
  defaultPax: number | null
  defaultStyle: string | null
  defaultMenuId: string | null
  defaultServiceId: string | null
  defaultSetupId: string | null
  blocks: { type: string; title: string | null; config: Record<string, unknown> }[]
  isBuiltIn: boolean
  isMaster: boolean
}

interface BlockRow {
  id: string
  type: string
  title: string | null
  config: Record<string, unknown>
  sortOrder: number
}

interface Option { id: string; name: string }

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `tpl_${crypto.randomUUID()}`
  }
  return `tpl_${Math.random().toString(36).slice(2)}`
}

async function safeArray<T>(url: string): Promise<T[]> {
  try {
    const r = await fetch(url)
    if (!r.ok) return []
    const d = await r.json()
    return Array.isArray(d) ? (d as T[]) : []
  } catch {
    return []
  }
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

export function EventTemplatesPanel({
  sessionVenueId,
  defaultVenueId,
  onApplied,
}: {
  sessionVenueId: string
  defaultVenueId?: string | null
  onApplied: (eventId: string) => void
}) {
  const venueId = defaultVenueId || sessionVenueId
  const library = useBlockLibrary(`/api/admin/beo-block-defs?venueId=${venueId}`)

  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refs, setRefs] = useState<{ menus: Option[]; services: Option[]; setups: Option[] }>({
    menus: [],
    services: [],
    setups: [],
  })
  const [error, setError] = useState('')

  const [editOpen, setEditOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [pax, setPax] = useState('')
  const [style, setStyle] = useState('')
  const [defaultMenuId, setDefaultMenuId] = useState('')
  const [defaultServiceId, setDefaultServiceId] = useState('')
  const [defaultSetupId, setDefaultSetupId] = useState('')
  const [blocks, setBlocks] = useState<BlockRow[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const [applyTarget, setApplyTarget] = useState<TemplateRow | null>(null)
  const [applyName, setApplyName] = useState('')
  const [applyDate, setApplyDate] = useState(todayKey())
  const [applying, setApplying] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const list = await safeArray<TemplateRow>(`/api/admin/event-templates?venueId=${venueId}`)
    setTemplates(list)
    setLoading(false)
  }, [venueId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [menus, services, setups] = await Promise.all([
        safeArray<Option>(`/api/admin/menus?venueId=${venueId}`),
        safeArray<Option>(`/api/admin/services?venueId=${venueId}`),
        safeArray<Option>(`/api/admin/floorplan-setups?venueId=${venueId}`),
      ])
      if (alive) setRefs({ menus, services, setups })
    })()
    return () => { alive = false }
  }, [venueId])

  function openCreate() {
    setEditingId(null)
    setName('')
    setCategory('')
    setPax('')
    setStyle('')
    setDefaultMenuId('')
    setDefaultServiceId('')
    setDefaultSetupId('')
    setBlocks([])
    setExpanded(new Set())
    setError('')
    setEditOpen(true)
  }

  function openEdit(t: TemplateRow) {
    setEditingId(t.id)
    setName(t.name)
    setCategory(t.category ?? '')
    setPax(t.defaultPax == null ? '' : String(t.defaultPax))
    setStyle(t.defaultStyle ?? '')
    setDefaultMenuId(t.defaultMenuId ?? '')
    setDefaultServiceId(t.defaultServiceId ?? '')
    setDefaultSetupId(t.defaultSetupId ?? '')
    setBlocks(
      (Array.isArray(t.blocks) ? t.blocks : []).map((b, i) => ({
        id: newId(),
        type: b.type,
        title: b.title ?? null,
        config: b.config ?? {},
        sortOrder: i,
      })),
    )
    setExpanded(new Set())
    setError('')
    setEditOpen(true)
  }

  function addBlock(type: string) {
    setBlocks((prev) => {
      const id = newId()
      setExpanded((e) => new Set(e).add(id))
      return [...prev, { id, type, title: null, config: defaultConfigFor(type, library), sortOrder: prev.length }]
    })
  }

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    setError('')
    const body = {
      venueId,
      name,
      category: category || null,
      defaultPax: pax === '' ? null : Number(pax),
      defaultStyle: style || null,
      defaultMenuId: defaultMenuId || null,
      defaultServiceId: defaultServiceId || null,
      defaultSetupId: defaultSetupId || null,
      blocks: blocks.map((b) => ({ type: b.type, title: b.title, config: b.config })),
    }
    const r = await fetch(
      editingId ? `/api/admin/event-templates/${editingId}` : '/api/admin/event-templates',
      {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    )
    setSaving(false)
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setError(d.error ?? 'COULD NOT SAVE TEMPLATE')
      return
    }
    setEditOpen(false)
    load()
  }

  async function setMaster(t: TemplateRow, isMaster: boolean) {
    setError('')
    const r = await fetch(`/api/admin/event-templates/${t.id}/master`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isMaster }),
    })
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setError(d.error ?? 'COULD NOT UPDATE MASTER')
      return
    }
    load()
  }

  async function remove(t: TemplateRow) {
    if (!confirm(`DELETE TEMPLATE "${t.name}"?`)) return
    const r = await fetch(`/api/admin/event-templates/${t.id}`, { method: 'DELETE' })
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setError(d.error ?? 'COULD NOT DELETE')
      return
    }
    load()
  }

  async function apply() {
    if (!applyTarget || !applyName.trim()) return
    setApplying(true)
    setError('')
    const r = await fetch(`/api/admin/event-templates/${applyTarget.id}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueId, name: applyName, eventDate: applyDate }),
    })
    setApplying(false)
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setError(d.error ?? 'COULD NOT CREATE EVENT')
      return
    }
    const created = (await r.json()) as { id: string }
    setApplyTarget(null)
    setApplyName('')
    onApplied(created.id)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="font-mono text-xl font-bold uppercase tracking-widest text-white">EVENT TEMPLATES</h1>
        <div className="flex-1" />
        <Button size="sm" onClick={openCreate}>+ NEW TEMPLATE</Button>
      </div>

      {error && <p className="font-mono text-xs text-danger uppercase">{error}</p>}

      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : templates.length === 0 ? (
        <div className="border border-grey-mid p-6 text-center">
          <p className="font-mono text-xs uppercase text-grey-light">NO TEMPLATES YET.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {templates.map((t) => (
            <div key={t.id} className="border border-grey-mid p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs uppercase text-white truncate">{t.name}</span>
                {t.isBuiltIn && (
                  <span className="font-mono text-[9px] uppercase text-accent border border-accent px-1">BUILT-IN</span>
                )}
                {t.isMaster && (
                  <span className="font-mono text-[9px] uppercase text-success border border-success px-1">MASTER</span>
                )}
              </div>
              <div className="font-mono text-[10px] uppercase text-grey-light">
                {[t.category, t.defaultPax ? `${t.defaultPax} PAX` : null, t.defaultStyle]
                  .filter(Boolean)
                  .join(' · ') || 'NO DEFAULTS'}
              </div>
              <div className="font-mono text-[9px] uppercase text-grey-light">
                {(Array.isArray(t.blocks) ? t.blocks : []).length} BLOCK(S)
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={() => { setApplyTarget(t); setApplyName(''); setApplyDate(todayKey()) }}>
                  APPLY
                </Button>
                {!t.isBuiltIn && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(t)}>EDIT</Button>
                    <Button size="sm" variant="ghost" onClick={() => setMaster(t, !t.isMaster)}>
                      {t.isMaster ? 'CLEAR MASTER' : 'SET MASTER'}
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => remove(t)}>✕</Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title={editingId ? 'EDIT TEMPLATE' : 'NEW TEMPLATE'} size="lg">
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input label="Name" value={name} placeholder="WEDDING PACKAGE — 100 PAX" onChange={(e) => setName(e.target.value)} />
            <Input label="Category" value={category} placeholder="WEDDING" onChange={(e) => setCategory(e.target.value)} />
            <Input label="Default guests" type="number" value={pax} onChange={(e) => setPax(e.target.value)} />
            <Input label="Default style" value={style} placeholder="PLATED" onChange={(e) => setStyle(e.target.value)} />
            <Select label="Default menu" value={defaultMenuId} options={[{ value: '', label: '— NONE —' }, ...refs.menus.map((m) => ({ value: m.id, label: m.name }))]} onChange={(e) => setDefaultMenuId(e.target.value)} />
            <Select label="Default service" value={defaultServiceId} options={[{ value: '', label: '— NONE —' }, ...refs.services.map((s) => ({ value: s.id, label: s.name }))]} onChange={(e) => setDefaultServiceId(e.target.value)} />
            <Select label="Default layout" value={defaultSetupId} options={[{ value: '', label: '— NONE —' }, ...refs.setups.map((s) => ({ value: s.id, label: s.name }))]} onChange={(e) => setDefaultSetupId(e.target.value)} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_16rem] gap-3 items-start">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const raw = e.dataTransfer.getData('text/plain')
                if (raw.startsWith(BEO_BLOCK_DRAG_PREFIX)) addBlock(raw.slice(BEO_BLOCK_DRAG_PREFIX.length))
              }}
              className="border border-grey-mid p-3 space-y-2 min-h-[6rem]"
            >
              <h3 className="font-mono text-[10px] uppercase text-grey-light tracking-wider">TEMPLATE BLOCKS</h3>
              {blocks.length === 0 && (
                <p className="font-mono text-[10px] uppercase text-grey-light py-3 text-center">DRAG OR CLICK A BLOCK TO ADD IT.</p>
              )}
              {blocks.map((b, i) => {
                const open = expanded.has(b.id)
                return (
                  <div key={b.id} className="border border-grey-mid">
                    <div className="flex items-center gap-2 px-2 py-1.5 bg-grey-dark/40">
                      <button type="button" onClick={() => setExpanded((prev) => { const n = new Set(prev); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n })} className="font-mono text-xs uppercase text-white text-left truncate">
                        {open ? '▾' : '▸'} {blockLabel(b.type, library)}
                      </button>
                      <div className="flex-1" />
                      <button type="button" disabled={i === 0} onClick={() => setBlocks((prev) => moveBlock(prev, i, -1))} className="font-mono text-xs text-grey-light hover:text-white disabled:opacity-30">↑</button>
                      <button type="button" disabled={i === blocks.length - 1} onClick={() => setBlocks((prev) => moveBlock(prev, i, 1))} className="font-mono text-xs text-grey-light hover:text-white disabled:opacity-30">↓</button>
                      <button type="button" onClick={() => setBlocks((prev) => prev.filter((x) => x.id !== b.id))} className="font-mono text-xs text-grey-light hover:text-danger">✕</button>
                    </div>
                    {open && (
                      <div className="p-3 border-t border-grey-mid">
                        <BeoBlockEditor
                          type={b.type}
                          config={b.config}
                          menus={refs.menus}
                          setups={refs.setups}
                          hideBoundFields
                          library={library}
                          onConfigChange={(config) => setBlocks((prev) => prev.map((x) => (x.id === b.id ? { ...x, config } : x)))}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <BeoBlockLibrary onAdd={addBlock} library={library} />
          </div>

          {error && <p className="font-mono text-xs text-danger uppercase">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditOpen(false)}>CANCEL</Button>
            <Button size="sm" onClick={save} loading={saving} disabled={!name.trim()}>SAVE TEMPLATE</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!applyTarget} onClose={() => setApplyTarget(null)} title="CREATE EVENT FROM TEMPLATE">
        <div className="space-y-3">
          <p className="font-mono text-[10px] uppercase text-grey-light">
            {applyTarget?.name} — BLOCKS AND DEFAULTS ARE COPIED; MAKE FINAL CHANGES AFTER.
          </p>
          <Input label="Event name" value={applyName} placeholder="SMITH WEDDING" onChange={(e) => setApplyName(e.target.value)} />
          <Input label="Date" type="date" value={applyDate} onChange={(e) => setApplyDate(e.target.value)} />
          {error && <p className="font-mono text-xs text-danger uppercase">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setApplyTarget(null)}>CANCEL</Button>
            <Button size="sm" onClick={apply} loading={applying} disabled={!applyName.trim()}>CREATE EVENT</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
