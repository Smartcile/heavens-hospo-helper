'use client'

// The Pantry Bible — the known-ingredient density / unit-weight library in its
// own tab (OPS HUB → INVENTORY & STOCKTAKE → PANTRY BIBLE). These references
// are knowledge for recipes, not stock: they can be picked as recipe
// ingredients and never enter stocktake or deduction.

import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/Input'
import { Panel } from '@/components/ui/Panel'
import { getActiveVenueId } from '@/lib/active-venue'

interface PantryRef {
  id: string
  name: string
  densityGramsPerMl: number | null
  weightPerUnitGrams: number | null
  notes: string | null
  isBuiltIn: boolean
}

export function PantryBibleClient({ role, sessionVenueId, defaultVenueId }: { role: string; sessionVenueId: string; defaultVenueId?: string | null }) {
  const venueId = getActiveVenueId(role, sessionVenueId, defaultVenueId)
  const [refs, setRefs] = useState<PantryRef[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  async function load() {
    setLoading(true)
    const r = await fetch(`/api/admin/ingredient-references${venueId ? `?venueId=${venueId}` : ''}`)
    if (r.ok) setRefs(await r.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function remove(id: string) {
    if (!confirm('DELETE THIS REFERENCE?')) return
    const r = await fetch(`/api/admin/ingredient-references?id=${id}`, { method: 'DELETE' })
    if (r.ok) load()
  }

  const filtered = refs.filter((r) => !search || r.name.includes(search))
  const customCount = refs.filter((r) => !r.isBuiltIn).length

  return (
    <div className="space-y-4 pb-12">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">PANTRY BIBLE</h1>
        <span className="font-mono text-xs text-grey-light">
          {refs.length} KNOWN INGREDIENTS{customCount > 0 ? ` · ${customCount} YOURS` : ''}
        </span>
      </div>

      <p className="font-mono text-xs text-grey-light">
        DENSITY / UNIT-WEIGHT REFERENCE VALUES FOR RECIPES — KNOWLEDGE, NOT STOCK. PICK THEM AS
        INGREDIENTS IN THE RECIPE EDITOR; THEY NEVER COUNT TOWARDS STOCKTAKE OR DEDUCTION.
      </p>

      <div className="max-w-sm">
        <Input value={search} onChange={(e) => setSearch(e.target.value.toUpperCase())} placeholder="SEARCH LIBRARY..." />
      </div>

      {loading ? (
        <p className="font-mono text-sm text-grey-light loading-cursor">LOADING</p>
      ) : (
        <Panel variant="outline" padding="none">
          {filtered.length === 0 && (
            <p className="font-mono text-xs text-grey-light px-3 py-3">{refs.length === 0 ? 'No known ingredients.' : 'No matches.'}</p>
          )}
          <div className="divide-y divide-grey-mid/50">
            {filtered.map((r) => (
              <div key={r.id} className="flex items-center gap-3 flex-wrap px-3 py-2">
                <div className="flex-1 min-w-0">
                  <span className="font-mono text-xs text-white block truncate uppercase">{r.name}</span>
                  {r.notes && <span className="font-mono text-xs text-grey-light block truncate">{r.notes}</span>}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {r.densityGramsPerMl != null && (
                    <span className="font-mono text-xs text-grey-light border border-grey-mid px-1.5 py-px">1 CUP ≈ {Math.round(r.densityGramsPerMl * 250)}G</span>
                  )}
                  {r.weightPerUnitGrams != null && (
                    <span className="font-mono text-xs text-grey-light border border-grey-mid px-1.5 py-px">1 EA ≈ {r.weightPerUnitGrams}G</span>
                  )}
                  <span className={`font-mono text-xs border px-1.5 py-px ${r.isBuiltIn ? 'text-grey-light border-grey-mid' : 'text-gold border-gold'}`}>
                    {r.isBuiltIn ? 'BUILT-IN' : 'CUSTOM'}
                  </span>
                  {!r.isBuiltIn && (
                    <button
                      type="button"
                      onClick={() => remove(r.id)}
                      aria-label={`Delete ${r.name}`}
                      className="font-mono text-xs text-grey-light hover:text-danger border border-grey-mid px-1.5 py-px"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}
