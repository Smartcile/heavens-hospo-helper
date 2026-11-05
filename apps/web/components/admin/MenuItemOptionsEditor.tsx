'use client'

// Product-level option groups — "SIDE: FRIES / SALAD / FRIES + SALAD (+$3)".
// Options live on the product, so every menu the product appears on shows the
// same choices. Opened from a product menu line's OPTIONS button. See MENUS.md.

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { pushToast } from '@/components/ui/Toast'
import {
  normaliseOptionGroups,
  validateOptionGroups,
  describeOptionGroup,
  formatPriceDelta,
  type MenuOptionGroup,
} from '@/lib/menu-options'

interface DraftChoice {
  key: string
  id?: string
  name: string
  priceDelta: string
  isDefault: boolean
}

interface DraftGroup {
  key: string
  id?: string
  name: string
  minSelect: string
  maxSelect: string
  choices: DraftChoice[]
}

const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `k${Math.random().toString(36).slice(2)}`)

function emptyChoice(): DraftChoice {
  return { key: uid(), name: '', priceDelta: '0', isDefault: false }
}

function emptyGroup(): DraftGroup {
  return { key: uid(), name: '', minSelect: '0', maxSelect: '1', choices: [emptyChoice()] }
}

function toDraft(groups: MenuOptionGroup[]): DraftGroup[] {
  return groups.map((g) => ({
    key: g.id ?? uid(),
    id: g.id,
    name: g.name,
    minSelect: String(g.minSelect),
    maxSelect: String(g.maxSelect),
    choices: g.choices.map((c) => ({
      key: c.id ?? uid(),
      id: c.id,
      name: c.name,
      priceDelta: String(c.priceDelta),
      isDefault: c.isDefault,
    })),
  }))
}

export function MenuItemOptionsEditor({
  menuItemId,
  menuItemName,
  initialOptions,
  onSaved,
}: {
  menuItemId: string
  menuItemName: string
  initialOptions?: MenuOptionGroup[]
  onSaved?: (groups: MenuOptionGroup[]) => void
}) {
  const [groups, setGroups] = useState<DraftGroup[]>(() => toDraft(initialOptions ?? []))
  const [loading, setLoading] = useState(initialOptions === undefined)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (initialOptions !== undefined) return
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const res = await fetch(`/api/admin/menu-items/${menuItemId}/options`)
        if (res.ok) {
          const data = normaliseOptionGroups(await res.json())
          if (!cancelled) setGroups(toDraft(data))
        } else {
          if (!cancelled) setError('COULD NOT LOAD OPTIONS')
        }
      } catch {
        if (!cancelled) setError('COULD NOT LOAD OPTIONS')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [menuItemId, initialOptions])

  function patchGroup(gi: number, patch: Partial<DraftGroup>) {
    setGroups((prev) => prev.map((g, i) => (i === gi ? { ...g, ...patch } : g)))
  }

  function patchChoice(gi: number, ci: number, patch: Partial<DraftChoice>) {
    setGroups((prev) =>
      prev.map((g, i) =>
        i === gi ? { ...g, choices: g.choices.map((c, j) => (j === ci ? { ...c, ...patch } : c)) } : g,
      ),
    )
  }

  function toggleDefault(gi: number, ci: number, checked: boolean) {
    setGroups((prev) =>
      prev.map((g, i) => {
        if (i !== gi) return g
        const single = (parseInt(g.maxSelect, 10) || 1) === 1
        return {
          ...g,
          choices: g.choices.map((c, j) => ({
            ...c,
            isDefault: j === ci ? checked : single ? false : c.isDefault,
          })),
        }
      }),
    )
  }

  function moveGroup(gi: number, dir: -1 | 1) {
    setGroups((prev) => {
      const next = [...prev]
      const j = gi + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[gi], next[j]] = [next[j], next[gi]]
      return next
    })
  }

  function moveChoice(gi: number, ci: number, dir: -1 | 1) {
    setGroups((prev) =>
      prev.map((g, i) => {
        if (i !== gi) return g
        const next = [...g.choices]
        const j = ci + dir
        if (j < 0 || j >= next.length) return g
        ;[next[ci], next[j]] = [next[j], next[ci]]
        return { ...g, choices: next }
      }),
    )
  }

  async function save() {
    setMessage('')
    setError('')
    const payload = normaliseOptionGroups(
      groups.map((g) => ({
        id: g.id,
        name: g.name,
        minSelect: g.minSelect === '' ? 0 : parseInt(g.minSelect, 10),
        maxSelect: g.maxSelect === '' ? 1 : parseInt(g.maxSelect, 10),
        choices: g.choices.map((c) => ({
          id: c.id,
          name: c.name,
          priceDelta: c.priceDelta === '' ? 0 : parseFloat(c.priceDelta),
          isDefault: c.isDefault,
        })),
      })),
    )
    const errors = validateOptionGroups(payload)
    if (errors.length > 0) {
      setError(errors[0])
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/admin/menu-items/${menuItemId}/options`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groups: payload }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(String(body.error ?? 'SAVE FAILED').toUpperCase())
        return
      }
      const saved = normaliseOptionGroups(await res.json())
      setGroups(toDraft(saved))
      setMessage('OPTIONS SAVED')
      pushToast('OPTIONS SAVED', 'success')
      onSaved?.(saved)
    } catch {
      setError('SAVE FAILED')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="font-mono text-xs text-grey-light loading-cursor">LOADING OPTIONS</p>
  }

  return (
    <div className="space-y-4">
      <p className="font-mono text-xs text-grey-light uppercase leading-tight">
        CUSTOMER CHOICES UNDER ONE PRODUCT — E.G. SIDE: FRIES / SALAD / FRIES + SALAD (+$3). OPTIONS ARE SHARED ON{' '}
        {menuItemName.toUpperCase()} ACROSS EVERY MENU IT APPEARS ON. UPCHARGES ARE ADDITIVE ONLY.
      </p>

      {groups.length === 0 && (
        <p className="font-mono text-xs text-grey-light">NO OPTION GROUPS YET.</p>
      )}

      {groups.map((group, gi) => (
        <div key={group.key} className="border border-grey-mid p-3 space-y-3">
          <div className="flex items-end gap-2 flex-wrap">
            <div className="flex-1 min-w-[12rem]">
              <Input
                label="GROUP NAME"
                value={group.name}
                onChange={(e) => patchGroup(gi, { name: e.target.value.toUpperCase() })}
                placeholder="SIDE / COOKING / EXTRA"
              />
            </div>
            <div className="w-20">
              <Input
                label="MIN"
                type="number"
                value={group.minSelect}
                onChange={(e) => patchGroup(gi, { minSelect: e.target.value })}
              />
            </div>
            <div className="w-20">
              <Input
                label="MAX"
                type="number"
                value={group.maxSelect}
                onChange={(e) => patchGroup(gi, { maxSelect: e.target.value })}
              />
            </div>
            <button
              type="button"
              onClick={() => moveGroup(gi, -1)}
              className="font-mono text-xs border border-grey-mid px-1.5 py-1.5 text-grey-light hover:border-white hover:text-white"
              aria-label="MOVE GROUP UP"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => moveGroup(gi, 1)}
              className="font-mono text-xs border border-grey-mid px-1.5 py-1.5 text-grey-light hover:border-white hover:text-white"
              aria-label="MOVE GROUP DOWN"
            >
              ↓
            </button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => setGroups((prev) => prev.filter((_, i) => i !== gi))}
              aria-label="REMOVE GROUP"
            >
              ✕
            </Button>
          </div>

          <p className="font-mono text-2xs uppercase text-grey-light">
            {describeOptionGroup({
              name: group.name || 'UNTITLED',
              minSelect: parseInt(group.minSelect, 10) || 0,
              maxSelect: parseInt(group.maxSelect, 10) || 1,
            })}
          </p>

          <div className="space-y-2">
            {group.choices.map((choice, ci) => (
              <div key={choice.key} className="flex items-center gap-2 flex-wrap">
                <input
                  value={choice.name}
                  onChange={(e) => patchChoice(gi, ci, { name: e.target.value.toUpperCase() })}
                  placeholder="CHOICE NAME"
                  className="flex-1 min-w-[10rem] bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white placeholder:text-grey-light uppercase"
                />
                <span className="font-mono text-xs text-grey-light">+$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={choice.priceDelta}
                  onChange={(e) => patchChoice(gi, ci, { priceDelta: e.target.value })}
                  aria-label="UPCHARGE"
                  className="w-24 bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white text-right"
                />
                <label className="font-mono text-2xs uppercase text-grey-light flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={choice.isDefault}
                    onChange={(e) => toggleDefault(gi, ci, e.target.checked)}
                  />
                  DEFAULT
                </label>
                <button
                  type="button"
                  onClick={() => moveChoice(gi, ci, -1)}
                  className="font-mono text-xs text-grey-light hover:text-white"
                  aria-label="MOVE CHOICE UP"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveChoice(gi, ci, 1)}
                  className="font-mono text-xs text-grey-light hover:text-white"
                  aria-label="MOVE CHOICE DOWN"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setGroups((prev) =>
                      prev.map((g, i) =>
                        i === gi ? { ...g, choices: g.choices.filter((_, j) => j !== ci) } : g,
                      ),
                    )
                  }
                  className="font-mono text-xs text-grey-light hover:text-danger"
                  aria-label="REMOVE CHOICE"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setGroups((prev) => prev.map((g, i) => (i === gi ? { ...g, choices: [...g.choices, emptyChoice()] } : g)))}
            >
              + ADD CHOICE
            </Button>
            <span className="font-mono text-2xs uppercase text-grey-light">
              {group.choices.length} CHOICE{group.choices.length === 1 ? '' : 'S'}
              {group.choices.some((c) => c.isDefault) && ` · DEFAULT ${group.choices.find((c) => c.isDefault)?.name || '—'}`}
              {group.choices.length > 0 && ` · ${group.choices.map((c) => formatPriceDelta(parseFloat(c.priceDelta) || 0)).join(' / ')}`}
            </span>
          </div>
        </div>
      ))}

      <div className="flex items-center gap-2 border-t border-grey-mid pt-3 flex-wrap">
        <Button size="sm" variant="ghost" onClick={() => setGroups((prev) => [...prev, emptyGroup()])}>
          + ADD GROUP
        </Button>
        <Button size="sm" onClick={save} loading={saving}>SAVE OPTIONS</Button>
        {message && <span className="font-mono text-xs uppercase text-success">{message}</span>}
        {error && <span className="font-mono text-xs uppercase text-danger">{error}</span>}
      </div>
    </div>
  )
}
