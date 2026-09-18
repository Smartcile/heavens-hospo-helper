'use client'

// The generic config editor for one BEO block. It renders purely from the
// block library definition, so a new block type needs no new UI code. A field
// may bind to an Event column (`eventField`) instead of the block config —
// those are owned by the event header and edited through `onEventFieldChange`.

import { blockDef, type BeoBlockField, type BeoRowColumn, type BlockLibrary } from '@/lib/beo-blocks'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'

export interface BeoMenuOption { id: string; name: string; price?: number }
export interface BeoSetupOption { id: string; name: string }

export interface BeoBlockEditorProps {
  type: string
  config: Record<string, unknown>
  /** Bound-field source values (the Event row). */
  eventValues?: Record<string, unknown>
  onConfigChange: (config: Record<string, unknown>) => void
  onEventFieldChange?: (field: string, value: unknown) => void
  menus?: BeoMenuOption[]
  menuItems?: BeoMenuOption[]
  setups?: BeoSetupOption[]
  disabled?: boolean
  /** Templates have no Event row — skip fields bound to one. */
  hideBoundFields?: boolean
  /** The resolved library (built-ins + custom defs) to render from. */
  library?: BlockLibrary
}

const inputClass =
  'w-full bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white placeholder:text-grey-light disabled:opacity-40'

function fieldValue(field: BeoBlockField, config: Record<string, unknown>, eventValues: Record<string, unknown>): unknown {
  if (field.eventField) return eventValues[field.eventField] ?? ''
  return config[field.key] ?? ''
}

function setField(
  field: BeoBlockField,
  value: unknown,
  config: Record<string, unknown>,
  onConfigChange: (c: Record<string, unknown>) => void,
  onEventFieldChange?: (f: string, v: unknown) => void,
) {
  if (field.eventField) {
    onEventFieldChange?.(field.eventField, value)
    return
  }
  onConfigChange({ ...config, [field.key]: value })
}

function RowsEditor({
  columns,
  rows,
  onChange,
  disabled,
}: {
  columns: BeoRowColumn[]
  rows: Record<string, unknown>[]
  onChange: (rows: Record<string, unknown>[]) => void
  disabled?: boolean
}) {
  function update(index: number, key: string, value: unknown) {
    const next = rows.map((r, i) => (i === index ? { ...r, [key]: value } : r))
    onChange(next)
  }
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {columns.map((c) => (
          <span key={c.key} className="flex-1 font-mono text-[9px] uppercase text-grey-light">{c.label}</span>
        ))}
        <span className="w-6" />
      </div>
      {rows.length === 0 && <p className="font-mono text-[10px] text-grey-light">NO ROWS YET.</p>}
      {rows.map((row, i) => (
        <div key={i} className="flex gap-1 items-center">
          {columns.map((c) => (
            <input
              key={c.key}
              type={c.kind === 'number' ? 'number' : 'text'}
              value={String(row[c.key] ?? '')}
              disabled={disabled}
              onChange={(e) => update(i, c.key, c.kind === 'number' ? Number(e.target.value) : e.target.value)}
              className={`${inputClass} flex-1`}
            />
          ))}
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
            className="w-6 font-mono text-xs text-grey-light hover:text-danger disabled:opacity-40"
            aria-label="Remove row"
          >
            ✕
          </button>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={disabled}
        onClick={() => onChange([...rows, Object.fromEntries(columns.map((c) => [c.key, c.kind === 'number' ? 0 : '']))])}
      >
        + ADD ROW
      </Button>
    </div>
  )
}

function ItemsEditor({
  items,
  menuItems,
  onChange,
  disabled,
}: {
  items: { menuItemId: string; qty: number }[]
  menuItems: BeoMenuOption[]
  onChange: (items: { menuItemId: string; qty: number }[]) => void
  disabled?: boolean
}) {
  const options = [{ value: '', label: '— PICK —' }, ...menuItems.map((m) => ({ value: m.id, label: m.name }))]
  function update(index: number, patch: Partial<{ menuItemId: string; qty: number }>) {
    onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it)))
  }
  return (
    <div className="space-y-1">
      {items.length === 0 && <p className="font-mono text-[10px] text-grey-light">NO ITEMS YET.</p>}
      {items.map((it, i) => (
        <div key={i} className="flex gap-1 items-center">
          <div className="flex-1">
            <Select
              value={it.menuItemId}
              disabled={disabled}
              onChange={(e) => update(i, { menuItemId: e.target.value })}
              options={options}
            />
          </div>
          <input
            type="number"
            min={1}
            value={it.qty}
            disabled={disabled}
            onChange={(e) => update(i, { qty: Number(e.target.value) })}
            className={`${inputClass} w-16 text-right`}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="w-6 font-mono text-xs text-grey-light hover:text-danger disabled:opacity-40"
            aria-label="Remove item"
          >
            ✕
          </button>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={disabled}
        onClick={() => onChange([...items, { menuItemId: '', qty: 1 }])}
      >
        + ADD ITEM
      </Button>
    </div>
  )
}

export function BeoBlockEditor({
  type,
  config,
  eventValues = {},
  onConfigChange,
  onEventFieldChange,
  menus = [],
  menuItems = [],
  setups = [],
  disabled,
  hideBoundFields,
  library,
}: BeoBlockEditorProps) {
  const def = blockDef(type, library)
  if (!def) {
    return <p className="font-mono text-xs text-danger">UNKNOWN BLOCK TYPE: {type}</p>
  }
  if (def.readOnly) {
    return <p className="font-mono text-[10px] text-grey-light">THIS BLOCK IS AUTOMATIC AND READ-ONLY.</p>
  }

  const fields = hideBoundFields ? def.fields.filter((f) => !f.eventField) : def.fields
  if (fields.length === 0) {
    return <p className="font-mono text-[10px] text-grey-light">NO CONFIGURABLE FIELDS — THE EVENT FILLS THIS IN.</p>
  }

  return (
    <div className="space-y-3">
      {fields.map((field) => {
        const value = fieldValue(field, config, eventValues)
        const set = (v: unknown) => setField(field, v, config, onConfigChange, onEventFieldChange)

        return (
          <div key={field.key}>
            <label className="block font-mono text-[10px] uppercase text-grey-light mb-1">{field.label}</label>
            {field.kind === 'text' && (
              <Input value={String(value ?? '')} placeholder={field.placeholder} disabled={disabled} onChange={(e) => set(e.target.value)} />
            )}
            {field.kind === 'number' && (
              <Input type="number" value={String(value ?? '')} disabled={disabled} onChange={(e) => set(e.target.value === '' ? null : Number(e.target.value))} />
            )}
            {field.kind === 'textarea' && (
              <textarea
                value={String(value ?? '')}
                rows={3}
                disabled={disabled}
                placeholder={field.placeholder}
                onChange={(e) => set(e.target.value)}
                className={`${inputClass} resize-y`}
              />
            )}
            {field.kind === 'select' && (
              <Select value={String(value ?? '')} disabled={disabled} onChange={(e) => set(e.target.value)} options={field.options ?? []} />
            )}
            {field.kind === 'menu' && (
              <Select
                value={String(value ?? '')}
                disabled={disabled}
                onChange={(e) => set(e.target.value)}
                options={[{ value: '', label: '— NONE —' }, ...menus.map((m) => ({ value: m.id, label: m.name }))]}
              />
            )}
            {field.kind === 'setup' && (
              <Select
                value={String(value ?? '')}
                disabled={disabled}
                onChange={(e) => set(e.target.value)}
                options={[{ value: '', label: '— NONE —' }, ...setups.map((s) => ({ value: s.id, label: s.name }))]}
              />
            )}
            {field.kind === 'rows' && (
              <RowsEditor
                columns={field.columns ?? []}
                rows={Array.isArray(config[field.key]) ? (config[field.key] as Record<string, unknown>[]) : []}
                disabled={disabled}
                onChange={(rows) => onConfigChange({ ...config, [field.key]: rows })}
              />
            )}
            {field.kind === 'items' && (
              <ItemsEditor
                items={Array.isArray(config[field.key]) ? (config[field.key] as { menuItemId: string; qty: number }[]) : []}
                menuItems={menuItems}
                disabled={disabled}
                onChange={(items) => onConfigChange({ ...config, [field.key]: items })}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
