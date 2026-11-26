'use client'

// The generic config editor for one BEO block. It renders purely from the
// block library definition, so a new block type needs no new UI code. A field
// may bind to an Event column (`eventField`) instead of the block config —
// those are owned by the event header and edited through `onEventFieldChange`.

import {
  blockDef,
  type BeoBlockField,
  type BeoRowColumn,
  type BlockLibrary,
} from '@/lib/beo-blocks'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { RoomSetupCard, type RoomSetupOption } from '@/components/RoomSetupCard'
import { roomSetupLabel } from '@/lib/room-setup'
import {
  PRICING_UNITS,
  describeLineUnit,
  parsePricingUnit,
  pricingWarnings,
  suggestPlatterCount,
  type PricingUnit,
} from '@/lib/event-pricing'

export interface BeoMenuOption {
  id: string
  name: string
  price?: number
  // Event-pricing metadata (#192) — present on the admin menu-items feed.
  pricingMode?: string | null
  servesMin?: number | null
  servesMax?: number | null
  minQty?: number | null
  leadTimeDays?: number | null
}
export type BeoSetupOption = RoomSetupOption

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
  /** Guest count — drives PER_PERSON lines and the USE PAX helper. */
  guestCount?: number | null
  /** Venue-local event date + today (`YYYY-MM-DD`) for the lead-time warning. */
  eventDate?: string | null
  today?: string | null
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
          <span key={c.key} className="flex-1 font-mono text-xs uppercase text-grey-light">{c.label}</span>
        ))}
        <span className="w-6" />
      </div>
      {rows.length === 0 && <p className="font-mono text-xs text-grey-light">NO ROWS YET.</p>}
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

interface ItemDraft {
  menuItemId: string
  qty: number
  unit?: PricingUnit
  servesMin?: number
  servesMax?: number
}

function unitOf(item: ItemDraft, product: BeoMenuOption | undefined): PricingUnit {
  return item.unit ?? parsePricingUnit(product?.pricingMode)
}

function yieldOf(item: ItemDraft, product: BeoMenuOption | undefined) {
  return {
    servesMin: item.servesMin ?? product?.servesMin ?? undefined,
    servesMax: item.servesMax ?? product?.servesMax ?? undefined,
  }
}

function ItemsEditor({
  items,
  menuItems,
  guestCount,
  eventDate,
  today,
  onChange,
  disabled,
}: {
  items: ItemDraft[]
  menuItems: BeoMenuOption[]
  guestCount?: number | null
  eventDate?: string | null
  today?: string | null
  onChange: (items: ItemDraft[]) => void
  disabled?: boolean
}) {
  const options = [{ value: '', label: '— PICK —' }, ...menuItems.map((m) => ({ value: m.id, label: m.name }))]
  function update(index: number, patch: Partial<ItemDraft>) {
    onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it)))
  }
  const pax = Number(guestCount)
  const paxCount = Number.isFinite(pax) && pax > 0 ? Math.round(pax) : 0

  return (
    <div className="space-y-1">
      {items.length === 0 && <p className="font-mono text-xs text-grey-light">NO ITEMS YET.</p>}
      {items.map((it, i) => {
        const product = menuItems.find((m) => m.id === it.menuItemId)
        const unit = unitOf(it, product)
        const yieldValues = yieldOf(it, product)
        const effectiveQty = unit === 'PER_PERSON' && paxCount > 0 ? paxCount : it.qty
        const warnings = product
          ? pricingWarnings({
              name: product.name,
              menuItemId: product.id,
              qty: it.qty,
              unit,
              minQty: product.minQty,
              leadTimeDays: product.leadTimeDays,
              guestCount,
              eventDate,
              today,
            })
          : []
        const platterSuggestion =
          unit === 'PER_PLATTER' ? suggestPlatterCount(paxCount, yieldValues.servesMin) : null
        const usePaxQty = unit === 'PER_PLATTER' ? platterSuggestion ?? paxCount : paxCount

        return (
          <div key={i} className="border border-grey-mid p-1.5 space-y-1">
            <div className="flex gap-1 items-center">
              <div className="flex-1 min-w-0">
                <Select
                  value={it.menuItemId}
                  disabled={disabled}
                  onChange={(e) => {
                    const picked = menuItems.find((m) => m.id === e.target.value)
                    update(i, {
                      menuItemId: e.target.value,
                      unit: parsePricingUnit(picked?.pricingMode),
                      servesMin: picked?.servesMin ?? undefined,
                      servesMax: picked?.servesMax ?? undefined,
                    })
                  }}
                  options={options}
                />
              </div>
              <select
                aria-label="Pricing unit"
                value={unit}
                disabled={disabled}
                onChange={(e) => update(i, { unit: parsePricingUnit(e.target.value) })}
                className={`${inputClass} w-24`}
              >
                {PRICING_UNITS.map((u) => (
                  <option key={u} value={u}>{u === 'PER_PERSON' ? 'PER PERSON' : u === 'PER_PLATTER' ? 'PER PLATTER' : 'EACH'}</option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                aria-label="Quantity"
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
            <div className="flex items-center gap-2 flex-wrap font-mono text-2xs uppercase text-grey-light">
              {it.menuItemId && (
                <span className="text-white">
                  {describeLineUnit({ unit, qty: effectiveQty, ...yieldValues })}
                </span>
              )}
              {unit === 'PER_PERSON' && paxCount > 0 && <span>USES PAX</span>}
              {product?.minQty != null && <span>MIN {product.minQty}</span>}
              {product?.leadTimeDays != null && product.leadTimeDays > 0 && (
                <span>{product.leadTimeDays}D NOTICE</span>
              )}
              <button
                type="button"
                disabled={disabled || usePaxQty <= 0}
                onClick={() => update(i, { qty: usePaxQty })}
                className="border border-grey-mid px-1.5 py-0.5 text-grey-light hover:border-white hover:text-white disabled:opacity-40"
              >
                USE PAX
              </button>
            </div>
            {warnings.length > 0 && (
              <p className="font-mono text-2xs uppercase text-danger">
                {warnings.map((w) => w.message).join(' · ')}
              </p>
            )}
          </div>
        )
      })}
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
  guestCount,
  eventDate,
  today,
}: BeoBlockEditorProps) {
  const def = blockDef(type, library)
  if (!def) {
    return <p className="font-mono text-xs text-danger">UNKNOWN BLOCK TYPE: {type}</p>
  }
  if (def.readOnly) {
    return <p className="font-mono text-xs text-grey-light">THIS BLOCK IS AUTOMATIC AND READ-ONLY.</p>
  }

  const fields = hideBoundFields ? def.fields.filter((f) => !f.eventField) : def.fields
  if (fields.length === 0) {
    return <p className="font-mono text-xs text-grey-light">NO CONFIGURABLE FIELDS — THE EVENT FILLS THIS IN.</p>
  }

  return (
    <div className="space-y-3">
      {fields.map((field) => {
        const value = fieldValue(field, config, eventValues)
        const set = (v: unknown) => setField(field, v, config, onConfigChange, onEventFieldChange)

        return (
          <div key={field.key}>
            <label className="block font-mono text-xs uppercase text-grey-light mb-1">{field.label}</label>
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
              <div className="space-y-2">
                <Select
                  value={String(value ?? '')}
                  disabled={disabled}
                  onChange={(e) => set(e.target.value)}
                  options={[{ value: '', label: '— NONE —' }, ...setups.map((s) => ({ value: s.id, label: roomSetupLabel(s) }))]}
                />
                {(() => {
                  const picked = setups.find((s) => s.id === String(value ?? ''))
                  return picked ? <RoomSetupCard setup={picked} /> : null
                })()}
              </div>
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
                items={Array.isArray(config[field.key]) ? (config[field.key] as ItemDraft[]) : []}
                menuItems={menuItems}
                guestCount={guestCount}
                eventDate={eventDate}
                today={today}
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
