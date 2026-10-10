'use client'

// Equipment links on a product — "the glass this wine is served in".
// Self-contained: loads the venue's stock list + the product's current links,
// saves the whole set on SAVE. Used from the Recipes page and the menu line
// editor. Mirrors the guide step-link interaction (optional qty + note).

import { useEffect, useState } from 'react'
import { SearchSelect } from '@/components/ui/SearchSelect'
import { Button } from '@/components/ui/Button'

interface DraftRow {
  inventoryItemId: string
  qty: string
  note: string
}

interface Props {
  menuItemId: string
  venueId?: string | null
}

export function MenuItemEquipmentEditor({ menuItemId, venueId }: Props) {
  const [options, setOptions] = useState<{ value: string; label: string }[]>([])
  const [rows, setRows] = useState<DraftRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => { load() }, [menuItemId])

  async function load() {
    setLoading(true)
    const venueParam = venueId ? `?venueId=${venueId}` : ''
    const [invRes, linkRes] = await Promise.all([
      fetch(`/api/admin/inventory${venueParam}`),
      fetch(`/api/admin/menu-items/${menuItemId}/equipment`),
    ])
    if (invRes.ok) {
      const items = await invRes.json()
      setOptions(
        (Array.isArray(items) ? items : [])
          .map((i: { id: string; name: string; category?: { name: string } | null }) => ({
            value: i.id,
            label: i.category?.name ? `${i.name} — ${i.category.name}` : i.name,
          }))
          .sort((a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label)),
      )
    }
    if (linkRes.ok) {
      const links = await linkRes.json()
      setRows(
        (Array.isArray(links) ? links : []).map((l: { inventoryItemId: string; qty: number | null; note: string | null }) => ({
          inventoryItemId: l.inventoryItemId,
          qty: l.qty != null ? String(l.qty) : '',
          note: l.note ?? '',
        })),
      )
    }
    setLoading(false)
  }

  function patchRow(i: number, patch: Partial<DraftRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  async function save() {
    setSaving(true)
    setMessage('')
    const r = await fetch(`/api/admin/menu-items/${menuItemId}/equipment`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        links: rows
          .filter((row) => row.inventoryItemId)
          .map((row) => ({ inventoryItemId: row.inventoryItemId, qty: row.qty || null, note: row.note || null })),
      }),
    })
    if (r.ok) {
      const links = await r.json()
      setRows(
        (Array.isArray(links) ? links : []).map((l: { inventoryItemId: string; qty: number | null; note: string | null }) => ({
          inventoryItemId: l.inventoryItemId,
          qty: l.qty != null ? String(l.qty) : '',
          note: l.note ?? '',
        })),
      )
      setMessage('EQUIPMENT SAVED')
    } else {
      setMessage('SAVE FAILED')
    }
    setSaving(false)
  }

  if (loading) return <p className="font-mono text-xs text-grey-light loading-cursor">LOADING EQUIPMENT…</p>

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <SearchSelect
              options={options}
              value={row.inventoryItemId}
              onChange={(v) => patchRow(i, { inventoryItemId: v })}
              placeholder="SEARCH STOCK ITEM (GLASS, TOOL…)"
            />
          </div>
          <input
            type="number"
            min="1"
            value={row.qty}
            onChange={(e) => patchRow(i, { qty: e.target.value })}
            placeholder="1"
            className="w-14 bg-black border border-grey-mid text-white font-mono text-xs px-2 py-2 text-right outline-none focus:border-white placeholder:text-grey-light"
          />
          <input
            value={row.note}
            onChange={(e) => patchRow(i, { note: e.target.value })}
            placeholder="NOTE"
            className="w-32 bg-black border border-grey-mid text-white font-mono text-xs px-2 py-2 outline-none focus:border-white placeholder:text-grey-light"
          />
          <button
            type="button"
            onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
            className="font-mono text-xs text-grey-light hover:text-danger"
          >
            ✕
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setRows((prev) => [...prev, { inventoryItemId: '', qty: '', note: '' }])}
          className="font-mono text-xs uppercase text-info hover:text-white transition-colors"
        >
          + ADD EQUIPMENT
        </button>
        <Button size="sm" variant="ghost" onClick={save} disabled={saving}>
          {saving ? 'SAVING…' : 'SAVE EQUIPMENT'}
        </Button>
        {message && <span className="font-mono text-xs uppercase text-success">{message}</span>}
      </div>
    </div>
  )
}
