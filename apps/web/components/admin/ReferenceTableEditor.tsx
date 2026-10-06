'use client'

// Admin editor for a product-reference table. Lets a manager define the columns
// (their own plus ones derived from the linked product) and fill a row per item.
// Derived columns (MENU_FIELD) read from the linked MenuItem; the image column
// writes back to the product so the photo is shared everywhere.

import { useMemo } from 'react'
import { ImagePicker } from '@/components/ui/ImagePicker'
import {
  MENU_FIELDS,
  MENU_FIELD_LABELS,
  REFERENCE_COLUMN_TYPES,
  REFERENCE_COLUMN_TYPE_LABELS,
  displayCellText,
  type MenuField,
  type ReferenceColumn,
  type ReferenceColumnType,
  type ReferenceMenuItem,
} from '@/lib/reference-table'

export interface ReferenceRowDraft {
  id: string | null
  menuItemId: string | null
  cells: Record<string, string>
}

export interface ReferenceProductOption {
  value: string
  label: string
  name: string
  price: number
  description: string | null
  imageUrl: string | null
  dietaryInfo: string | null
  serveMethod?: string | null
  serveSummary?: string | null
}

interface Props {
  columns: ReferenceColumn[]
  rows: ReferenceRowDraft[]
  products: ReferenceProductOption[]
  onColumnsChange: (next: ReferenceColumn[]) => void
  onRowsChange: (next: ReferenceRowDraft[]) => void
  onProductImageChange?: (menuItemId: string, imageUrl: string | null) => void
}

const cellInputClass =
  'w-full bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white placeholder:text-grey-light'

function newKey(): string {
  return `col_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`
}

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function ReferenceTableEditor({
  columns,
  rows,
  products,
  onColumnsChange,
  onRowsChange,
  onProductImageChange,
}: Props) {
  const productById = useMemo(
    () => new Map(products.map((p) => [p.value, p])),
    [products],
  )

  function menuItemOf(row: ReferenceRowDraft): ReferenceMenuItem | null {
    const p = row.menuItemId ? productById.get(row.menuItemId) : null
    if (!p) return null
    return {
      id: p.value,
      name: p.name,
      price: p.price,
      description: p.description,
      imageUrl: p.imageUrl,
      dietaryInfo: p.dietaryInfo,
      serveMethod: p.serveMethod ?? null,
      serveSummary: p.serveSummary ?? null,
    }
  }

  function updateColumn(i: number, patch: Partial<ReferenceColumn>) {
    onColumnsChange(columns.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  }

  function addColumn() {
    onColumnsChange([...columns, { key: newKey(), label: 'NEW COLUMN', type: 'TEXT' }])
  }

  function updateRow(i: number, patch: Partial<ReferenceRowDraft>) {
    onRowsChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  function setCell(i: number, key: string, value: string) {
    onRowsChange(rows.map((r, idx) => (idx === i ? { ...r, cells: { ...r.cells, [key]: value } } : r)))
  }

  return (
    <div className="space-y-4">
      {/* COLUMNS */}
      <div className="border border-grey-mid p-3 space-y-2">
        <div className="flex items-center justify-between">
          <label className="font-mono text-xs uppercase text-grey-light tracking-wider">Columns</label>
          <button type="button" onClick={addColumn} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">+ ADD COLUMN</button>
        </div>
        {columns.map((col, i) => (
          <div key={col.key} className="border border-grey-mid p-2 space-y-2">
            <div className="flex items-center gap-2">
              <input
                value={col.label}
                onChange={(e) => updateColumn(i, { label: e.target.value.toUpperCase() })}
                placeholder="COLUMN HEADING"
                className={cellInputClass}
              />
              <button type="button" onClick={() => onColumnsChange(move(columns, i, i - 1))} className="font-mono text-xs px-2 py-1.5 border border-grey-mid text-grey-light hover:text-white">↑</button>
              <button type="button" onClick={() => onColumnsChange(move(columns, i, i + 1))} className="font-mono text-xs px-2 py-1.5 border border-grey-mid text-grey-light hover:text-white">↓</button>
              <button type="button" onClick={() => onColumnsChange(columns.filter((_, idx) => idx !== i))} className="font-mono text-xs px-2 py-1.5 border border-grey-mid text-grey-light hover:text-danger">✕</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select
                value={col.type}
                onChange={(e) => {
                  const type = e.target.value as ReferenceColumnType
                  updateColumn(i, {
                    type,
                    menuField: type === 'MENU_FIELD' ? col.menuField ?? 'NAME' : undefined,
                    options: type === 'SELECT' ? col.options ?? [] : undefined,
                  })
                }}
                className={cellInputClass}
              >
                {REFERENCE_COLUMN_TYPES.map((t) => (
                  <option key={t} value={t}>{REFERENCE_COLUMN_TYPE_LABELS[t]}</option>
                ))}
              </select>
              {col.type === 'MENU_FIELD' && (
                <select
                  value={col.menuField ?? 'NAME'}
                  onChange={(e) => updateColumn(i, { menuField: e.target.value as MenuField })}
                  className={cellInputClass}
                >
                  {MENU_FIELDS.map((f) => (
                    <option key={f} value={f}>{MENU_FIELD_LABELS[f]}</option>
                  ))}
                </select>
              )}
              {col.type === 'SELECT' && (
                <input
                  value={(col.options ?? []).join(', ')}
                  onChange={(e) => updateColumn(i, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                  placeholder="CHOICES (COMMA SEPARATED)"
                  className={cellInputClass}
                />
              )}
            </div>
          </div>
        ))}
        {columns.length === 0 && (
          <p className="font-mono text-xs text-grey-light">NO COLUMNS — ADD AT LEAST ONE.</p>
        )}
      </div>

      {/* ROWS */}
      <div className="border border-grey-mid p-3 space-y-3">
        <div className="flex items-center justify-between">
          <label className="font-mono text-xs uppercase text-grey-light tracking-wider">Items ({rows.length})</label>
          <button
            type="button"
            onClick={() => onRowsChange([...rows, { id: null, menuItemId: null, cells: {} }])}
            className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors"
          >
            + ADD ITEM
          </button>
        </div>
        {rows.length === 0 && <p className="font-mono text-xs text-grey-light">NO ITEMS YET.</p>}
        {rows.map((row, i) => {
          const mi = menuItemOf(row)
          return (
            <div key={row.id ?? `new-${i}`} className="border border-grey-mid p-3 space-y-3">
              <div className="flex items-center gap-2">
                <select
                  value={row.menuItemId ?? ''}
                  onChange={(e) => updateRow(i, { menuItemId: e.target.value || null })}
                  className={cellInputClass}
                  aria-label={`Product for item ${i + 1}`}
                >
                  <option value="">— LINK A PRODUCT —</option>
                  {products.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                <button type="button" onClick={() => onRowsChange(move(rows, i, i - 1))} className="font-mono text-xs px-2 py-1.5 border border-grey-mid text-grey-light hover:text-white">↑</button>
                <button type="button" onClick={() => onRowsChange(move(rows, i, i + 1))} className="font-mono text-xs px-2 py-1.5 border border-grey-mid text-grey-light hover:text-white">↓</button>
                <button type="button" onClick={() => onRowsChange(rows.filter((_, idx) => idx !== i))} className="font-mono text-xs px-2 py-1.5 border border-grey-mid text-grey-light hover:text-danger">✕</button>
              </div>

              <div className="space-y-2">
                {columns.map((col) => (
                  <div key={col.key} className="grid grid-cols-[8rem_1fr] gap-2 items-start">
                    <span className="font-mono text-xs uppercase text-grey-light pt-1.5 truncate" title={col.label}>{col.label}</span>
                    <div>
                      {col.type === 'MENU_ITEM' ? (
                        <span className="font-mono text-xs text-grey-light">{mi?.name ?? '—'}</span>
                      ) : col.type === 'MENU_FIELD' && col.menuField === 'IMAGE' ? (
                        <div className="space-y-1">
                          <ImagePicker
                            value={mi?.imageUrl ?? null}
                            disabled={!mi}
                            onChange={(url) => { if (row.menuItemId) onProductImageChange?.(row.menuItemId, url) }}
                          />
                          <span className="font-mono text-xs text-grey-light">
                            {mi ? 'SHARED WITH THE PRODUCT' : 'LINK A PRODUCT FIRST'}
                          </span>
                        </div>
                      ) : col.type === 'MENU_FIELD' || col.type === 'METHOD' || col.type === 'SERVE' ? (
                        <span className="font-mono text-xs text-grey-light">
                          {displayCellText({ menuItem: mi, cells: row.cells }, col) ?? '—'}
                        </span>
                      ) : col.type === 'IMAGE' ? (
                        <ImagePicker value={row.cells[col.key] ?? null} onChange={(url) => setCell(i, col.key, url ?? '')} />
                      ) : col.type === 'SELECT' ? (
                        <select
                          value={row.cells[col.key] ?? ''}
                          onChange={(e) => setCell(i, col.key, e.target.value)}
                          className={cellInputClass}
                          aria-label={`${col.label} for item ${i + 1}`}
                        >
                          <option value="">—</option>
                          {(col.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : col.type === 'LONG_TEXT' ? (
                        <textarea
                          value={row.cells[col.key] ?? ''}
                          onChange={(e) => setCell(i, col.key, e.target.value)}
                          rows={2}
                          className={`${cellInputClass} font-sans resize-y`}
                          aria-label={`${col.label} for item ${i + 1}`}
                        />
                      ) : (
                        <input
                          value={row.cells[col.key] ?? ''}
                          onChange={(e) => setCell(i, col.key, e.target.value)}
                          className={cellInputClass}
                          inputMode={col.type === 'NUMBER' ? 'decimal' : undefined}
                          aria-label={`${col.label} for item ${i + 1}`}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
