'use client'

// Focused editor for one menu line, in a popup. Edits the fields the menu owns
// (price, sizes, min/max, group, active) and shows COGS against the ex-GST price.
// Heavy product/recipe and stock details stay on their own pages via ITEM LINK.

import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { type MenuLineDraft, type MenuSize } from '@/lib/menu-lines'
import { priceExGst, grossMarginPct, type CogsResult } from '@/lib/menu-cogs'

export interface MenuLineEditorProps {
  line: MenuLineDraft
  groupOptions: { value: string; label: string }[]
  cogs: CogsResult | null
  onPatch: (key: string, patch: Partial<MenuLineDraft>) => void
  onOpenServes?: (line: { id: string; name: string }) => void
  onClose: () => void
}

export function MenuLineEditor({ line, groupOptions, cogs, onPatch, onOpenServes, onClose }: MenuLineEditorProps) {
  const basePrice = line.price ?? line.sizes[0]?.price ?? null
  const exGst = basePrice != null ? priceExGst(basePrice) : null
  const margin = cogs && exGst != null ? grossMarginPct(cogs.cost, exGst) : null

  const setSize = (index: number, patch: Partial<MenuSize>) =>
    onPatch(line.key, { sizes: line.sizes.map((s, i) => (i === index ? { ...s, ...patch } : s)), sizesDirty: true })
  const addSize = (preset?: string) =>
    onPatch(line.key, { sizes: [...line.sizes, { label: preset ?? '', price: 0 }], sizesDirty: true })
  const removeSize = (index: number) =>
    onPatch(line.key, { sizes: line.sizes.filter((_, i) => i !== index), sizesDirty: true })

  return (
    <Modal isOpen onClose={onClose} title={`EDIT — ${line.name}`} size="lg">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs uppercase border border-grey-mid px-1 text-grey-light">
            {line.kind === 'PRODUCT' ? 'PRODUCT' : 'STOCK'}
          </span>
          {line.unit && <span className="font-mono text-xs uppercase text-grey-light">UNIT: {line.unit}</span>}
        </div>

        {/* COGS vs price (ex GST) */}
        <div className="border border-grey-mid p-3">
          <div className="font-mono text-xs uppercase tracking-wider text-grey-light">COGS vs PRICE (EX GST)</div>
          <div className="grid grid-cols-3 gap-3 mt-2">
            <div>
              <div className="font-mono text-xs uppercase text-grey-light">COGS</div>
              <div className="font-mono text-sm text-white">
                {cogs ? `$${cogs.cost.toFixed(2)}${cogs.partial ? '~' : ''}` : '—'}
              </div>
            </div>
            <div>
              <div className="font-mono text-xs uppercase text-grey-light">PRICE EX GST</div>
              <div className="font-mono text-sm text-white">{exGst != null ? `$${exGst.toFixed(2)}` : '—'}</div>
            </div>
            <div>
              <div className="font-mono text-xs uppercase text-grey-light">MARGIN</div>
              <div className={`font-mono text-sm ${margin == null ? 'text-grey-light' : margin < 0 ? 'text-danger' : 'text-success'}`}>
                {margin == null ? '—' : `${margin.toFixed(0)}%`}
              </div>
            </div>
          </div>
          {cogs?.partial && (
            <p className="font-mono text-xs uppercase text-warning mt-1.5">~ SOME INGREDIENTS HAVE NO COST PRICE</p>
          )}
        </div>

        {line.kind === 'PRODUCT' && (
          <Input
            label="Base price (GST incl)"
            type="number"
            step="0.01"
            value={line.price != null ? String(line.price) : ''}
            onChange={(e) => onPatch(line.key, { price: e.target.value === '' ? null : parseFloat(e.target.value) || 0 })}
            placeholder="0.00"
          />
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="label">
              {line.kind === 'PRODUCT' ? 'SIZE OPTIONS — SHARED ON THE PRODUCT' : 'SIZE OPTIONS'}
            </span>
            <div className="flex items-center gap-1">
              {['150 ML', '500 ML', '750 ML'].map((p) => (
                <button key={p} type="button" onClick={() => addSize(p)} className="font-mono text-2xs uppercase border border-grey-mid px-1 py-0.5 text-grey-light hover:border-white hover:text-white">{`+${p}`}</button>
              ))}
              <button type="button" onClick={() => addSize()} className="font-mono text-2xs uppercase border border-gold text-gold px-1 py-0.5 hover:bg-gold hover:text-black">+ NEW</button>
            </div>
          </div>
          {line.sizes.length === 0 ? (
            <p className="font-mono text-xs text-grey-light">NO SIZES — A SINGLE PRICE APPLIES.</p>
          ) : (
            <div className="space-y-1.5">
              {line.sizes.map((s, si) => (
                <div key={si} className="flex items-center gap-2">
                  <input
                    value={s.label}
                    onChange={(e) => setSize(si, { label: e.target.value.toUpperCase() })}
                    placeholder="150 ML / LARGE"
                    className="flex-1 bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1 outline-none focus:border-white placeholder:text-grey-light"
                  />
                  <span className="font-mono text-xs text-grey-light">$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={s.price || ''}
                    onChange={(e) => setSize(si, { price: parseFloat(e.target.value) || 0 })}
                    placeholder="0.00"
                    className="w-24 bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1 outline-none focus:border-white placeholder:text-grey-light text-right"
                  />
                  <button type="button" onClick={() => removeSize(si)} className="font-mono text-xs text-grey-light hover:text-danger">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Input label="Min qty" type="number" value={line.minQty} onChange={(e) => onPatch(line.key, { minQty: e.target.value })} placeholder="—" />
          <Input label="Max qty" type="number" value={line.maxQty} onChange={(e) => onPatch(line.key, { maxQty: e.target.value })} placeholder="—" />
          <div>
            <Select
              label="Group"
              value={line.groupKey ?? ''}
              onChange={(e) => onPatch(line.key, { groupKey: e.target.value || null })}
              options={groupOptions}
            />
          </div>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-grey-mid">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onPatch(line.key, { isActive: !line.isActive })}
              className={`font-mono text-xs uppercase border px-2 py-1 ${line.isActive ? 'border-success text-success' : 'border-grey-mid text-grey-light'}`}
            >
              {line.isActive ? 'ON' : 'OFF'}
            </button>
            {line.kind === 'PRODUCT' && line.menuItemId && onOpenServes && (
              <button
                type="button"
                onClick={() => onOpenServes({ id: line.menuItemId!, name: line.name })}
                className="font-mono text-xs uppercase border border-grey-mid px-2 py-1 text-grey-light hover:border-white hover:text-white"
                title="How this product consumes stock (the item link)"
              >
                ITEM LINK
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs uppercase text-grey-light">{line.sizes.length} size{line.sizes.length === 1 ? '' : 's'}</span>
            <Button size="sm" onClick={onClose}>DONE</Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
