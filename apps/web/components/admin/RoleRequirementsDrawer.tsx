'use client'

// Role (Position) requirements editor — the sections a role must be fully
// trained in, extra required guides, and the role's default admin access.
// Shows the guides a section already carries (so you can see what's required)
// and each holder's readiness.

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Drawer'
import { PERMISSION_PRESETS, completeGrantSet } from '@/lib/permissions/registry'
import { readinessLabel } from '@/lib/position-requirements'

interface RequirementData {
  sectionIds: string[]
  guideIds: string[]
  permissionKeys: string[]
  derived: { guideId: string; sectionId: string; title: string }[]
  explicit: { id: string; title: string }[]
}

interface ReadinessRow {
  staffId: string
  name: string
  readiness: {
    requiredCount: number
    completedCount: number
    missing: string[]
    ready: boolean
    percent: number
  }
}

interface SectionLite { id: string; name: string }
interface GuideLite { id: string; title: string; status: string }

export function RoleRequirementsDrawer({
  positionId,
  positionName,
  venueId,
  onClose,
}: {
  positionId: string
  positionName: string
  venueId: string
  onClose: () => void
}) {
  const [data, setData] = useState<RequirementData | null>(null)
  const [readiness, setReadiness] = useState<ReadinessRow[]>([])
  const [sections, setSections] = useState<SectionLite[]>([])
  const [guides, setGuides] = useState<GuideLite[]>([])
  const [sectionIds, setSectionIds] = useState<string[]>([])
  const [guideIds, setGuideIds] = useState<string[]>([])
  const [permissionKeys, setPermissionKeys] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [assignMsg, setAssignMsg] = useState('')

  async function load() {
    const [reqR, readyR, secR, guideR] = await Promise.all([
      fetch(`/api/admin/positions/${positionId}/requirements`),
      fetch(`/api/admin/positions/${positionId}/readiness`),
      fetch(`/api/admin/sections?venueId=${encodeURIComponent(venueId)}`),
      fetch(`/api/admin/guides?venueId=${encodeURIComponent(venueId)}`),
    ])
    const [req, ready, secs, gs] = await Promise.all([reqR.json(), readyR.json(), secR.json(), guideR.json()])
    setData(req)
    setReadiness(Array.isArray(ready) ? ready : [])
    setSections(Array.isArray(secs) ? secs : [])
    setGuides(
      (Array.isArray(gs) ? gs : [])
        .filter((g: GuideLite) => g.status === 'PUBLISHED')
        .map((g: GuideLite) => ({ id: g.id, title: g.title, status: g.status })),
    )
    setSectionIds(req.sectionIds ?? [])
    setGuideIds(req.guideIds ?? [])
    setPermissionKeys(req.permissionKeys ?? [])
  }

  useEffect(() => { load() }, [positionId])

  const sectionName = useMemo(() => new Map(sections.map((s) => [s.id, s.name])), [sections])
  const derivedBySection = useMemo(() => {
    const map = new Map<string, { guideId: string; title: string }[]>()
    for (const d of data?.derived ?? []) {
      const list = map.get(d.sectionId) ?? []
      list.push({ guideId: d.guideId, title: d.title })
      map.set(d.sectionId, list)
    }
    return map
  }, [data])

  const filteredGuides = guides.filter((g) => g.title.toLowerCase().includes(search.trim().toLowerCase()))

  function toggleSection(id: string) {
    setSectionIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }
  function toggleGuide(id: string) {
    setGuideIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function assignMissing() {
    setAssigning(true); setAssignMsg(''); setError('')
    // Persist the on-screen requirements first so the assignment matches them.
    const saveRes = await fetch(`/api/admin/positions/${positionId}/requirements`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sectionIds, guideIds, permissionKeys }),
    })
    if (!saveRes.ok) {
      setAssigning(false)
      setError('SAVE REQUIREMENTS FIRST')
      return
    }
    const r = await fetch(`/api/admin/positions/${positionId}/assign-missing`, { method: 'POST' })
    setAssigning(false)
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setError(d.error ?? 'ASSIGN FAILED')
      return
    }
    const d = await r.json()
    setAssignMsg(`${d.assigned} GUIDE${d.assigned === 1 ? '' : 'S'} ASSIGNED ACROSS ${d.staff} STAFF.`)
    await load()
  }

  async function save() {
    setSaving(true); setError('')
    const r = await fetch(`/api/admin/positions/${positionId}/requirements`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sectionIds, guideIds, permissionKeys }),
    })
    setSaving(false)
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setError(d.error ?? 'SAVE FAILED')
      return
    }
    await load()
  }

  return (
    <Drawer isOpen onClose={onClose} title={`REQUIREMENTS — ${positionName}`} width="lg">
      <div className="space-y-6">
        {/* REQUIRED SECTIONS */}
        <div className="border border-grey-mid p-3 space-y-2">
          <label className="font-mono text-xs uppercase text-grey-light tracking-wider">Sections to be fully trained in</label>
          {sections.length === 0 ? (
            <p className="font-mono text-xs text-grey-light">NO SECTIONS FOR THIS VENUE.</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {sections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleSection(s.id)}
                  className={`font-mono text-xs px-2 py-1.5 border transition-colors ${
                    sectionIds.includes(s.id)
                      ? 'bg-white text-black border-white'
                      : 'bg-transparent text-grey-light border-grey-mid hover:border-white hover:text-white'
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* GUIDES ALREADY REQUIRED BY THE SECTIONS */}
        {sectionIds.length > 0 && (
          <div className="border border-grey-mid p-3 space-y-2">
            <label className="font-mono text-xs uppercase text-grey-light tracking-wider">Required by these sections</label>
            {sectionIds.map((sid) => {
              const list = derivedBySection.get(sid) ?? []
              return (
                <div key={sid} className="space-y-1">
                  <div className="font-mono text-xs uppercase text-grey-light">{sectionName.get(sid) ?? 'SECTION'}</div>
                  {list.length === 0 ? (
                    <p className="font-mono text-xs text-grey-light">NO GUIDES TARGET THIS SECTION YET.</p>
                  ) : (
                    <ul className="space-y-0.5">
                      {list.map((g) => (
                        <li key={g.guideId} className="font-mono text-xs text-white">• {g.title}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* EXTRA REQUIRED GUIDES */}
        <div className="border border-grey-mid p-3 space-y-2">
          <label className="font-mono text-xs uppercase text-grey-light tracking-wider">Extra required guides</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="SEARCH PUBLISHED GUIDES…"
            className="w-full bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white placeholder:text-grey-light"
          />
          <div className="max-h-56 overflow-y-auto divide-y divide-grey-mid border border-grey-mid">
            {filteredGuides.length === 0 ? (
              <p className="font-mono text-xs text-grey-light p-2">NO PUBLISHED GUIDES.</p>
            ) : (
              filteredGuides.map((g) => (
                <label key={g.id} className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-black/20">
                  <input
                    type="checkbox"
                    checked={guideIds.includes(g.id)}
                    onChange={() => toggleGuide(g.id)}
                    className="accent-white"
                  />
                  <span className="font-mono text-xs text-white">{g.title}</span>
                </label>
              ))
            )}
          </div>
        </div>

        {/* DEFAULT ACCESS */}
        <div className="border border-grey-mid p-3 space-y-2">
          <label className="font-mono text-xs uppercase text-grey-light tracking-wider">Default access for this role</label>
          <div className="flex flex-wrap gap-1">
            {PERMISSION_PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => setPermissionKeys(completeGrantSet(preset.keys))}
                className="font-mono text-xs uppercase border border-grey-mid px-2 py-1.5 text-grey-light hover:border-white hover:text-white transition-colors"
              >
                {preset.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPermissionKeys([])}
              className="font-mono text-xs uppercase border border-grey-mid px-2 py-1.5 text-grey-light hover:text-danger transition-colors"
            >
              CLEAR
            </button>
          </div>
          <p className="font-mono text-xs uppercase text-grey-light">
            {permissionKeys.length} PERMISSION{permissionKeys.length === 1 ? '' : 'S'} SELECTED — APPLY TO STAFF WITH THIS ROLE FROM THEIR ACCESS DRAWER.
          </p>
        </div>

        {/* READINESS */}
        <div className="border border-grey-mid p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className="font-mono text-xs uppercase text-grey-light tracking-wider">Team readiness</label>
            {readiness.length > 0 && (
              <button
                type="button"
                onClick={assignMissing}
                disabled={assigning}
                className="font-mono text-xs uppercase border border-grey-mid px-2 py-1.5 text-grey-light hover:border-white hover:text-white transition-colors disabled:opacity-40"
              >
                {assigning ? 'ASSIGNING…' : 'ASSIGN MISSING GUIDES'}
              </button>
            )}
          </div>
          {assignMsg && <p className="font-mono text-xs text-success">{assignMsg}</p>}
          {readiness.length === 0 ? (
            <p className="font-mono text-xs text-grey-light">NOBODY HOLDS THIS ROLE YET.</p>
          ) : (
            <div className="divide-y divide-grey-mid border border-grey-mid">
              {readiness.map((r) => (
                <div key={r.staffId} className="flex items-center justify-between px-3 py-2 gap-2">
                  <span className="font-mono text-xs uppercase text-white">{r.name}</span>
                  <span className={`font-mono text-xs uppercase ${r.readiness.ready ? 'text-success' : 'text-warning'}`}>
                    {readinessLabel(r.readiness)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <p className="font-mono text-xs text-danger">{error}</p>}
        <div className="flex gap-2 pt-2">
          <Button onClick={save} loading={saving}>SAVE REQUIREMENTS</Button>
          <Button variant="ghost" onClick={onClose}>CLOSE</Button>
        </div>
      </div>
    </Drawer>
  )
}
