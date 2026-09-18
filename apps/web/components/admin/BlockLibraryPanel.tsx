'use client'

// Block library editor — the admin area for venue-authored BEO blocks. Built-in
// blocks are listed read-only (they live in code); custom defs are CRUD. A def
// is just a label, a group and a field spec, so a new block needs no deploy.

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import {
  BEO_BLOCKS,
  CUSTOM_BLOCK_GROUP,
  CUSTOM_FIELD_KINDS,
  type BeoFieldKind,
} from '@/lib/beo-blocks'
import { groupLinksByBlock } from '@/lib/beo-links'
import { BlockLinksModal } from '@/components/admin/BlockLinksModal'

interface CustomDef {
  id: string
  key: string
  label: string
  group: string
  description: string | null
  defaultConfig: Record<string, unknown>
  fields: FieldDraft[]
  sortOrder: number
  isActive: boolean
}

interface Option { value: string; label: string }
interface ColumnDraft { key: string; label: string; kind: 'text' | 'number' }
interface FieldDraft {
  key: string
  label: string
  kind: BeoFieldKind
  placeholder?: string
  options?: Option[]
  columns?: ColumnDraft[]
}

const KIND_LABEL: Record<string, string> = {
  text: 'SHORT TEXT',
  textarea: 'LONG TEXT',
  number: 'NUMBER',
  select: 'DROPDOWN',
  rows: 'TABLE ROWS',
}

const textareaClass =
  'w-full bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white placeholder:text-grey-light'

function keyFromLabel(label: string): string {
  return label
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

function fieldKeyFromLabel(label: string): string {
  const parts = label.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  return parts[0].toLowerCase() + parts.slice(1).map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join('')
}

function emptyField(): FieldDraft {
  return { key: '', label: '', kind: 'text' }
}

function normaliseFields(fields: FieldDraft[]): FieldDraft[] {
  return fields.map((f) => ({
    key: f.key.trim(),
    label: f.label.trim().toUpperCase(),
    kind: f.kind,
    ...(f.placeholder ? { placeholder: f.placeholder } : {}),
    ...(f.kind === 'select' ? { options: (f.options ?? []).filter((o) => o.value && o.label) } : {}),
    ...(f.kind === 'rows'
      ? { columns: (f.columns ?? []).filter((c) => c.key && c.label) }
      : {}),
  }))
}

/** Empty default config derived from the field spec. */
function defaultConfigForFields(fields: FieldDraft[]): Record<string, unknown> {
  const config: Record<string, unknown> = {}
  for (const f of normaliseFields(fields)) {
    config[f.key] = f.kind === 'rows' ? [] : f.kind === 'number' ? 0 : ''
  }
  return config
}

export function BlockLibraryPanel({ sessionVenueId, defaultVenueId }: {
  sessionVenueId: string
  defaultVenueId?: string | null
}) {
  const venueId = defaultVenueId || sessionVenueId

  const [defs, setDefs] = useState<CustomDef[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [linkCounts, setLinkCounts] = useState<Record<string, number>>({})
  const [linkTarget, setLinkTarget] = useState<{ blockType: string; label: string } | null>(null)

  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [key, setKey] = useState('')
  const [keyTouched, setKeyTouched] = useState(false)
  const [group, setGroup] = useState(CUSTOM_BLOCK_GROUP)
  const [description, setDescription] = useState('')
  const [fields, setFields] = useState<FieldDraft[]>([])
  const [saving, setSaving] = useState(false)

  const loadLinks = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/beo-block-links?venueId=${venueId}`)
      const rows = r.ok ? ((await r.json()) as { blockType: string; kind: string; targetId: string }[]) : []
      const grouped = groupLinksByBlock(rows)
      const counts: Record<string, number> = {}
      for (const [type, sets] of grouped) {
        counts[type] = sets.guideIds.length + sets.taskIds.length + sets.checklistIds.length
      }
      setLinkCounts(counts)
    } catch {
      setLinkCounts({})
    }
  }, [venueId])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/admin/beo-block-defs?venueId=${venueId}`)
      const d = r.ok ? await r.json() : []
      setDefs(Array.isArray(d) ? (d as CustomDef[]) : [])
    } catch {
      setDefs([])
    }
    await loadLinks()
    setLoading(false)
  }, [venueId, loadLinks])

  useEffect(() => { load() }, [load])

  function openCreate() {
    setEditingId(null)
    setLabel('')
    setKey('')
    setKeyTouched(false)
    setGroup(CUSTOM_BLOCK_GROUP)
    setDescription('')
    setFields([emptyField()])
    setError('')
    setOpen(true)
  }

  function openEdit(def: CustomDef) {
    setEditingId(def.id)
    setLabel(def.label)
    setKey(def.key)
    setKeyTouched(true)
    setGroup(def.group || CUSTOM_BLOCK_GROUP)
    setDescription(def.description ?? '')
    setFields(
      Array.isArray(def.fields) && def.fields.length > 0
        ? def.fields.map((f) => ({ ...f }))
        : [emptyField()],
    )
    setError('')
    setOpen(true)
  }

  function patchField(index: number, p: Partial<FieldDraft>) {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...p } : f)))
  }

  function onLabelChange(v: string) {
    setLabel(v)
    if (!keyTouched && !editingId) setKey(keyFromLabel(v))
  }

  async function save() {
    const clean = normaliseFields(fields)
    if (!label.trim()) { setError('LABEL IS REQUIRED'); return }
    if (!key.trim()) { setError('KEY IS REQUIRED'); return }
    if (clean.length === 0) { setError('ADD AT LEAST ONE FIELD'); return }
    if (clean.some((f) => !f.key || !f.label)) { setError('EVERY FIELD NEEDS A KEY AND LABEL'); return }

    setSaving(true)
    setError('')
    const body = {
      venueId,
      key: key.trim().toUpperCase(),
      label: label.trim(),
      group: group.trim() || CUSTOM_BLOCK_GROUP,
      description: description.trim() || null,
      fields: clean,
      defaultConfig: defaultConfigForFields(clean),
    }
    const r = await fetch(
      editingId ? `/api/admin/beo-block-defs/${editingId}` : '/api/admin/beo-block-defs',
      {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    )
    setSaving(false)
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setError(String(d.error ?? 'COULD NOT SAVE').toUpperCase())
      return
    }
    setOpen(false)
    load()
  }

  async function remove(def: CustomDef) {
    if (!confirm(`DELETE BLOCK "${def.label}"? EXISTING EVENTS KEEP THEIR DATA.`)) return
    const r = await fetch(`/api/admin/beo-block-defs/${def.id}`, { method: 'DELETE' })
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setError(String(d.error ?? 'COULD NOT DELETE').toUpperCase())
      return
    }
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="font-mono text-xl font-bold uppercase tracking-widest text-white">BLOCK LIBRARY</h1>
        <div className="flex-1" />
        <Button size="sm" onClick={openCreate}>+ NEW BLOCK</Button>
      </div>

      <p className="font-mono text-[10px] uppercase text-grey-light">
        CUSTOM BLOCKS APPEAR IN THE BUILDER&apos;S LIBRARY ALONGSIDE THE BUILT-INS. BUILT-INS ARE FIXED IN CODE.
      </p>

      {error && !open && <p className="font-mono text-xs text-danger uppercase">{error}</p>}

      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="font-mono text-xs uppercase text-grey-light tracking-wider">CUSTOM BLOCKS</h2>
            {defs.length === 0 ? (
              <div className="border border-grey-mid p-6 text-center">
                <p className="font-mono text-xs uppercase text-grey-light">NO CUSTOM BLOCKS YET.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {defs.map((d) => (
                  <div key={d.id} className="border border-grey-mid p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs uppercase text-white truncate">{d.label}</span>
                      <div className="flex-1" />
                      <span className="font-mono text-[9px] uppercase text-grey-light border border-grey-mid px-1">{d.group}</span>
                    </div>
                    <div className="font-mono text-[9px] uppercase text-grey-light truncate">{d.key}</div>
                    <div className="font-mono text-[9px] uppercase text-grey-light">
                      {(Array.isArray(d.fields) ? d.fields : []).length} FIELD(S)
                      {linkCounts[d.key] ? ` · ${linkCounts[d.key]} REF` : ''}
                      {d.description ? ` · ${d.description}` : ''}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(d)}>EDIT</Button>
                      <Button size="sm" variant="ghost" onClick={() => setLinkTarget({ blockType: d.key, label: d.label })}>LINKS</Button>
                      <Button size="sm" variant="danger" onClick={() => remove(d)}>✕</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="font-mono text-xs uppercase text-grey-light tracking-wider">BUILT-IN BLOCKS</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {BEO_BLOCKS.map((b) => (
                <div key={b.type} className="border border-grey-mid p-2 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] uppercase text-white truncate">{b.label}</span>
                    <div className="flex-1" />
                    <span className="font-mono text-[8px] uppercase text-grey-light border border-grey-mid px-1">BUILT-IN</span>
                  </div>
                  <div className="font-mono text-[9px] uppercase text-grey-light truncate">
                    {b.description}
                    {linkCounts[b.type] ? ` · ${linkCounts[b.type]} REF` : ''}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setLinkTarget({ blockType: b.type, label: b.label })}>LINKS</Button>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      <Modal isOpen={open} onClose={() => setOpen(false)} title={editingId ? 'EDIT BLOCK' : 'NEW BLOCK'} size="lg">
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input label="Label" value={label} placeholder="BAR TAB" onChange={(e) => onLabelChange(e.target.value)} />
            <Input
              label="Key"
              value={key}
              placeholder="BAR_TAB"
              disabled={!!editingId}
              onChange={(e) => { setKeyTouched(true); setKey(e.target.value.toUpperCase()) }}
            />
            <Input label="Group" value={group} placeholder={CUSTOM_BLOCK_GROUP} onChange={(e) => setGroup(e.target.value)} />
            <Input label="Description" value={description} placeholder="WHAT THIS BLOCK CAPTURES" onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="border border-grey-mid p-3 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-[10px] uppercase text-grey-light tracking-wider">FIELDS</h3>
              <Button size="sm" variant="ghost" onClick={() => setFields((p) => [...p, emptyField()])}>+ ADD FIELD</Button>
            </div>

            {fields.map((f, i) => (
              <div key={i} className="border border-grey-mid p-2 space-y-2">
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Input
                      label="Field label"
                      value={f.label}
                      placeholder="TAB TOTAL"
                      onChange={(e) => {
                        const v = e.target.value
                        patchField(i, { label: v, ...(f.key ? {} : { key: fieldKeyFromLabel(v) }) })
                      }}
                    />
                  </div>
                  <div className="flex-1">
                    <Input label="Key" value={f.key} placeholder="tabTotal" onChange={(e) => patchField(i, { key: e.target.value })} />
                  </div>
                  <div className="w-40">
                    <Select
                      label="Type"
                      value={f.kind}
                      options={CUSTOM_FIELD_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] ?? k }))}
                      onChange={(e) => patchField(i, { kind: e.target.value as BeoFieldKind })}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setFields((p) => p.filter((_, j) => j !== i))}
                    className="h-8 px-2 font-mono text-xs text-grey-light hover:text-danger"
                    aria-label="Remove field"
                  >✕</button>
                </div>

                {(f.kind === 'text' || f.kind === 'textarea') && (
                  <Input label="Placeholder (optional)" value={f.placeholder ?? ''} onChange={(e) => patchField(i, { placeholder: e.target.value })} />
                )}

                {f.kind === 'select' && (
                  <div className="space-y-1 border-l border-grey-mid ml-2 pl-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[9px] uppercase text-grey-light">OPTIONS</span>
                      <button type="button" className="font-mono text-[9px] uppercase text-grey-light hover:text-white"
                        onClick={() => patchField(i, { options: [...(f.options ?? []), { value: '', label: '' }] })}>+ OPTION</button>
                    </div>
                    {(f.options ?? []).map((o, oi) => (
                      <div key={oi} className="flex gap-1 items-center">
                        <input
                          className={`${textareaClass} flex-1`}
                          placeholder="VALUE"
                          value={o.value}
                          onChange={(e) => patchField(i, { options: (f.options ?? []).map((x, j) => (j === oi ? { ...x, value: e.target.value } : x)) })}
                        />
                        <input
                          className={`${textareaClass} flex-1`}
                          placeholder="LABEL"
                          value={o.label}
                          onChange={(e) => patchField(i, { options: (f.options ?? []).map((x, j) => (j === oi ? { ...x, label: e.target.value } : x)) })}
                        />
                        <button type="button" className="font-mono text-xs text-grey-light hover:text-danger"
                          onClick={() => patchField(i, { options: (f.options ?? []).filter((_, j) => j !== oi) })}>✕</button>
                      </div>
                    ))}
                  </div>
                )}

                {f.kind === 'rows' && (
                  <div className="space-y-1 border-l border-grey-mid ml-2 pl-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[9px] uppercase text-grey-light">COLUMNS</span>
                      <button type="button" className="font-mono text-[9px] uppercase text-grey-light hover:text-white"
                        onClick={() => patchField(i, { columns: [...(f.columns ?? []), { key: '', label: '', kind: 'text' }] })}>+ COLUMN</button>
                    </div>
                    {(f.columns ?? []).map((c, ci) => (
                      <div key={ci} className="flex gap-1 items-center">
                        <input
                          className={`${textareaClass} flex-1`}
                          placeholder="key"
                          value={c.key}
                          onChange={(e) => patchField(i, { columns: (f.columns ?? []).map((x, j) => (j === ci ? { ...x, key: e.target.value } : x)) })}
                        />
                        <input
                          className={`${textareaClass} flex-1`}
                          placeholder="LABEL"
                          value={c.label}
                          onChange={(e) => patchField(i, { columns: (f.columns ?? []).map((x, j) => (j === ci ? { ...x, label: e.target.value } : x)) })}
                        />
                        <select
                          className={`${textareaClass} w-24`}
                          value={c.kind}
                          onChange={(e) => patchField(i, { columns: (f.columns ?? []).map((x, j) => (j === ci ? { ...x, kind: e.target.value as 'text' | 'number' } : x)) })}
                        >
                          <option value="text">TEXT</option>
                          <option value="number">NUMBER</option>
                        </select>
                        <button type="button" className="font-mono text-xs text-grey-light hover:text-danger"
                          onClick={() => patchField(i, { columns: (f.columns ?? []).filter((_, j) => j !== ci) })}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {error && <p className="font-mono text-xs text-danger uppercase">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>CANCEL</Button>
            <Button size="sm" onClick={save} loading={saving} disabled={!label.trim() || !key.trim()}>SAVE BLOCK</Button>
          </div>
        </div>
      </Modal>

      {linkTarget && (
        <BlockLinksModal
          venueId={venueId}
          blockType={linkTarget.blockType}
          label={linkTarget.label}
          onClose={() => setLinkTarget(null)}
          onSaved={() => { setLinkTarget(null); loadLinks() }}
        />
      )}
    </div>
  )
}
