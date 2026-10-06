'use client'

// The serve spec editor — how a product is consumed (the app's POS item link).
// One product can have several serves (tap beer 400ML / 1.4L, wine GLASS /
// CARAFE / BOTTLE). Each points at a recipe or a stock item + qty + unit.
// Opened from the Menus page. See MENUS.md.

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { pushToast } from '@/components/ui/Toast'
import { SERVE_METHODS, SERVE_METHOD_LABELS, type ServeMethod } from '@/lib/menu-serves'

interface DraftServe {
  key: string
  label: string
  method: ServeMethod
  targetType: 'RECIPE' | 'STOCK'
  recipeId: string
  inventoryItemId: string
  qty: string
  uomId: string
}

interface Option { id: string; name: string }
interface UomOption { id: string; name: string; kind: string | null }

function emptyServe(): DraftServe {
  return {
    key: crypto.randomUUID(),
    label: '',
    method: 'POURED',
    targetType: 'STOCK',
    recipeId: '',
    inventoryItemId: '',
    qty: '1',
    uomId: '',
  }
}

export function MenuItemServesEditor({
  menuItemId,
  menuItemName,
  venueId,
  onSaved,
}: {
  menuItemId: string
  menuItemName: string
  venueId: string
  onSaved?: () => void
}) {
  const [serves, setServes] = useState<DraftServe[]>([])
  const [recipes, setRecipes] = useState<Option[]>([])
  const [invItems, setInvItems] = useState<Option[]>([])
  const [uoms, setUoms] = useState<UomOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const venueParam = venueId ? `?venueId=${encodeURIComponent(venueId)}` : ''

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const [sRes, rRes, iRes, uRes] = await Promise.all([
        fetch(`/api/admin/menu-items/${menuItemId}/serves`),
        fetch(`/api/admin/recipes${venueParam}`),
        fetch(`/api/admin/inventory${venueParam}`),
        fetch(`/api/admin/uoms${venueParam}`),
      ])
      if (cancelled) return
      if (sRes.ok) {
        const data = (await sRes.json()) as {
          label: string | null
          method: string
          qty: number
          uomId: string | null
          recipeId: string | null
          inventoryItemId: string | null
        }[]
        setServes(
          data.map((s) => ({
            key: crypto.randomUUID(),
            label: s.label ?? '',
            method: (s.method as ServeMethod) ?? 'OTHER',
            targetType: s.recipeId ? 'RECIPE' : 'STOCK',
            recipeId: s.recipeId ?? '',
            inventoryItemId: s.inventoryItemId ?? '',
            qty: String(s.qty ?? 1),
            uomId: s.uomId ?? '',
          })),
        )
      }
      if (rRes.ok) setRecipes((await rRes.json()).map((r: { id: string; name: string }) => ({ id: r.id, name: r.name })))
      if (iRes.ok) setInvItems((await iRes.json()).map((i: { id: string; name: string }) => ({ id: i.id, name: i.name })))
      if (uRes.ok) setUoms((await uRes.json()).map((u: { id: string; name: string; kind: string | null }) => ({ id: u.id, name: u.name, kind: u.kind ?? null })))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [menuItemId, venueParam])

  function patch(i: number, p: Partial<DraftServe>) {
    setServes((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...p } : s)))
  }

  async function save() {
    setSaving(true)
    const payload = {
      serves: serves.map((s) => ({
        label: s.label || null,
        method: s.method,
        recipeId: s.targetType === 'RECIPE' ? s.recipeId || null : null,
        inventoryItemId: s.targetType === 'STOCK' ? s.inventoryItemId || null : null,
        qty: parseFloat(s.qty) || 1,
        uomId: s.targetType === 'STOCK' ? s.uomId || null : null,
      })),
    }
    const res = await fetch(`/api/admin/menu-items/${menuItemId}/serves`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (res.ok) {
      pushToast('SERVES SAVED', 'success')
      onSaved?.()
    } else {
      const err = await res.json().catch(() => ({}))
      pushToast((err.error ?? 'SAVE FAILED').toUpperCase(), 'error')
    }
  }

  if (loading) {
    return <p className="font-mono text-xs text-grey-light loading-cursor">LOADING SERVES</p>
  }

  return (
    <div className="space-y-4">
      <p className="font-mono text-xs text-grey-light uppercase leading-tight">
        HOW SELLING ONE {menuItemName.toUpperCase()} DRAWS STOCK — A POURED/BOTTLED SERVE POINTS AT A STOCK ITEM + UNIT; A
        MADE DRINK POINTS AT A RECIPE. THE UNIT MUST MATCH THE STOCK ITEM&apos;S TYPE (VOLUME/WEIGHT/COUNT).
      </p>

      {serves.length === 0 && (
        <p className="font-mono text-xs text-grey-light">NO SERVES YET.</p>
      )}

      {serves.map((s, i) => (
        <div key={s.key} className="border border-grey-mid p-3 space-y-3">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                label="LABEL (OPTIONAL)"
                value={s.label}
                onChange={(e) => patch(i, { label: e.target.value.toUpperCase() })}
                placeholder="400ML / GLASS / BOTTLE"
              />
            </div>
            <Button
              size="sm"
              variant="danger"
              onClick={() => setServes((prev) => prev.filter((_, idx) => idx !== i))}
            >
              ✕
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="METHOD"
              value={s.method}
              onChange={(e) => patch(i, { method: e.target.value as ServeMethod })}
              options={SERVE_METHODS.map((m) => ({ value: m, label: SERVE_METHOD_LABELS[m] }))}
            />
            <Select
              label="DRAWS FROM"
              value={s.targetType}
              onChange={(e) => patch(i, { targetType: e.target.value as 'RECIPE' | 'STOCK' })}
              options={[
                { value: 'STOCK', label: 'A STOCK ITEM (POUR / BOTTLE)' },
                { value: 'RECIPE', label: 'A RECIPE (MADE)' },
              ]}
            />
          </div>

          {s.targetType === 'RECIPE' ? (
            <Select
              label="RECIPE"
              value={s.recipeId}
              onChange={(e) => patch(i, { recipeId: e.target.value })}
              options={[{ value: '', label: '— PICK A RECIPE —' }, ...recipes.map((r) => ({ value: r.id, label: r.name }))]}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-1">
                <Select
                  label="STOCK ITEM"
                  value={s.inventoryItemId}
                  onChange={(e) => patch(i, { inventoryItemId: e.target.value })}
                  options={[{ value: '', label: '— PICK —' }, ...invItems.map((it) => ({ value: it.id, label: it.name }))]}
                />
              </div>
              <Input
                label="QTY"
                type="number"
                value={s.qty}
                onChange={(e) => patch(i, { qty: e.target.value })}
                placeholder="400"
              />
              <Select
                label="UNIT"
                value={s.uomId}
                onChange={(e) => patch(i, { uomId: e.target.value })}
                options={[{ value: '', label: '— PICK —' }, ...uoms.map((u) => ({ value: u.id, label: u.name }))]}
              />
            </div>
          )}
        </div>
      ))}

      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => setServes((prev) => [...prev, emptyServe()])}>
          + ADD SERVE
        </Button>
        <Button size="sm" onClick={save} loading={saving}>SAVE SERVES</Button>
      </div>
    </div>
  )
}
