'use client'

// Product-reference table renderer, shared by the admin VIEW preview and the
// worker reader. A real table on wider screens, one card per product on a phone
// (a wide table is unusable there), both driven by the same column definitions.

import { useMemo, useState } from 'react'
import {
  columnTypeLabel,
  displayCellImage,
  displayCellText,
  menuFieldLabel,
  type ReferenceColumn,
  type ReferenceRowLike,
} from '@/lib/reference-table'

export interface ReferenceTableRow extends ReferenceRowLike {
  id: string
}

function CellValue({ row, col, onImage }: { row: ReferenceTableRow; col: ReferenceColumn; onImage: (url: string) => void }) {
  const image = displayCellImage(row, col)
  if (image) {
    return (
      <button type="button" onClick={() => onImage(image)} className="block cursor-zoom-in" aria-label={`View ${col.label} image`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt={col.label} className="h-16 w-16 object-cover border border-grey-mid" />
      </button>
    )
  }
  const text = displayCellText(row, col)
  if (!text) return <span className="text-grey-light">—</span>
  return <span className="whitespace-pre-wrap break-words">{text}</span>
}

export function ReferenceTable({ columns, rows }: { columns: ReferenceColumn[]; rows: ReferenceTableRow[] }) {
  const [query, setQuery] = useState('')
  const [lightbox, setLightbox] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) =>
      columns.some((col) => {
        const text = displayCellText(row, col) ?? ''
        return text.toLowerCase().includes(q)
      }),
    )
  }, [rows, columns, query])

  if (columns.length === 0) return null

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="SEARCH ITEMS…"
        className="w-full bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white placeholder:text-grey-light"
      />

      {filtered.length === 0 ? (
        <p className="font-mono text-xs text-grey-light">NO MATCHING ITEMS.</p>
      ) : (
        <>
          {/* Wide screens: the table. */}
          <div className="hidden md:block overflow-x-auto border border-grey-mid">
            <table className="w-full border-collapse font-mono text-xs">
              <thead>
                <tr className="bg-grey-dark/40">
                  {columns.map((col) => (
                    <th key={col.key} className="text-left uppercase tracking-wider text-grey-light px-3 py-2 border-b border-grey-mid whitespace-nowrap">
                      {col.label}
                      {(col.type === 'MENU_FIELD' || col.type === 'MENU_ITEM') && (
                        <span className="ml-1 text-xs text-grey-light/70">
                          ({col.type === 'MENU_FIELD' ? menuFieldLabel(col.menuField) ?? columnTypeLabel(col.type) : 'LINKED'})
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} className="align-top border-b border-grey-mid last:border-b-0">
                    {columns.map((col) => (
                      <td key={col.key} className="px-3 py-2 text-white align-top">
                        <CellValue row={row} col={col} onImage={setLightbox} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phones: one card per item. */}
          <div className="md:hidden space-y-3">
            {filtered.map((row) => (
              <div key={row.id} className="border border-grey-mid p-3 space-y-2">
                {columns.map((col, idx) => (
                  <div key={col.key} className={idx === 0 ? '' : 'border-t border-grey-mid pt-2'}>
                    <div className="font-mono text-xs uppercase tracking-wider text-grey-light">{col.label}</div>
                    <div className="font-sans text-sm text-white">
                      <CellValue row={row} col={col} onImage={setLightbox} />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-2"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full object-contain" />
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 font-mono text-xs uppercase border border-grey-mid bg-black/70 px-3 py-2 text-white hover:border-white transition-colors"
          >
            ✕ CLOSE
          </button>
        </div>
      )}
    </div>
  )
}
