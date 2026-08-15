'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Drawer'
import { Badge } from '@/components/ui/Badge'
import {
  PERMISSION_TREE,
  PERMISSION_PRESETS,
  completeGrantSet,
  type PermissionArea,
} from '@/lib/permissions/registry'

interface AccessData {
  restricted: boolean
  venueId: string
  staffVenues: { venueId: string }[]
  permissions: { venueId: string; permissionKey: string }[]
}

interface VenueRef { id: string; name: string }

interface StaffAccessDrawerProps {
  staffId: string
  staffName: string
  staffRole: string
  venues: VenueRef[]
  onClose: () => void
}

export function StaffAccessDrawer({
  staffId,
  staffName,
  staffRole,
  venues,
  onClose,
}: StaffAccessDrawerProps) {
  const [data, setData] = useState<AccessData | null>(null)
  const [selectedVenueId, setSelectedVenueId] = useState('')
  const [keysByVenue, setKeysByVenue] = useState<Record<string, string[]>>({})
  const [restricted, setRestricted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch(`/api/admin/staff/${staffId}/permissions`)
      .then((r) => r.json())
      .then((d: AccessData) => {
        if (cancelled) return
        setData(d)
        setRestricted(d.restricted)
        setSelectedVenueId(d.venueId)
        const byVenue: Record<string, string[]> = {}
        for (const v of [d.venueId, ...d.staffVenues.map((s) => s.venueId)]) {
          byVenue[v] = d.permissions.filter((p) => p.venueId === v).map((p) => p.permissionKey)
        }
        setKeysByVenue(byVenue)
      })
      .catch(() => {
        if (!cancelled) setError('FAILED TO LOAD ACCESS SETTINGS')
      })
    return () => {
      cancelled = true
    }
  }, [staffId])

  const venueOptions = useMemo(() => {
    if (!data) return []
    const ids = new Set([data.venueId, ...data.staffVenues.map((s) => s.venueId)])
    const named = venues.filter((v) => ids.has(v.id))
    return named.length === ids.size
      ? named
      : [
          ...named,
          ...[...ids].filter((id) => !named.some((v) => v.id === id)).map((id) => ({ id, name: 'UNKNOWN VENUE' })),
        ]
  }, [data, venues])

  const activeKeys = keysByVenue[selectedVenueId] ?? []
  const activeSet = new Set(activeKeys)

  function toggleKey(key: string, on: boolean) {
    setKeysByVenue((prev) => {
      const current = prev[selectedVenueId] ?? []
      if (on) {
        // Granting any function brings its sub-area's view along.
        return { ...prev, [selectedVenueId]: completeGrantSet([...current, key]) }
      }
      let next = current.filter((k) => k !== key)
      // Removing a function also drops its sub-area's view when nothing else
      // in that sub-area remains granted.
      if (!key.endsWith('.view')) {
        const subAreaPrefix = key.slice(0, key.lastIndexOf('.'))
        const viewKey = `${subAreaPrefix}.view`
        const stillGranted = next.some((k) => k !== viewKey && k.startsWith(`${subAreaPrefix}.`))
        if (!stillGranted) next = next.filter((k) => k !== viewKey)
      }
      return { ...prev, [selectedVenueId]: next }
    })
  }

  function applyPreset(presetKeys: string[]) {
    setKeysByVenue((prev) => ({ ...prev, [selectedVenueId]: completeGrantSet(presetKeys) }))
  }

  function clearVenue() {
    setKeysByVenue((prev) => ({ ...prev, [selectedVenueId]: [] }))
  }

  async function save() {
    setSaving(true)
    setError('')
    const grants = Object.entries(keysByVenue).map(([venueId, keys]) => ({ venueId, keys }))
    const res = await fetch(`/api/admin/staff/${staffId}/permissions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restricted, grants }),
    })
    setSaving(false)
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      setError(body?.error ?? 'SAVE FAILED')
      return
    }
    onClose()
  }

  function subAreaGranted(area: PermissionArea): boolean {
    return area.subAreas.some((sub) => sub.functions.some((fn) => activeSet.has(`${area.key}.${sub.key}.${fn.key}`)))
  }

  return (
    <Drawer isOpen onClose={onClose} title={`ACCESS — ${staffName}`} width="full">
      {!data ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">
          {error || 'LOADING'}
        </p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Badge variant={staffRole === 'ADMIN' ? 'warning' : 'default'}>{staffRole}</Badge>
            <Badge variant={restricted ? 'danger' : 'success'}>
              {restricted ? 'RESTRICTED' : 'FULL ACCESS'}
            </Badge>
          </div>

          {staffRole === 'ADMIN' && (
            <p className="font-mono text-xs text-grey-light">
              ADMINS ALWAYS PASS EVERY GUARD — GRANTS DO NOT APPLY. THIS IS SHOWN FOR REFERENCE ONLY.
            </p>
          )}

          <div className="border border-grey-mid p-4 space-y-3">
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <span className="font-mono text-xs uppercase text-grey-light tracking-wider">
                RESTRICTED — GRANTS ONLY
              </span>
              <input
                type="checkbox"
                checked={restricted}
                onChange={(e) => setRestricted(e.target.checked)}
                disabled={staffRole === 'ADMIN'}
                className="accent-white"
              />
            </label>
            <p className="font-mono text-xs text-grey-light">
              OFF = THIS PERSON KEEPS FULL ACCESS (LEGACY BEHAVIOUR). ON = ACCESS IS EXACTLY THE GRANTS BELOW,
              PER VENUE. STAFF ROLE IS UNAFFECTED — FLOOR LOGINS NEVER REACH THE ADMIN PANEL.
            </p>
          </div>

          {venueOptions.length > 1 && (
            <div className="flex items-center gap-3">
              <label className="font-mono text-xs uppercase text-grey-light tracking-wider">VENUE</label>
              <select
                value={selectedVenueId}
                onChange={(e) => setSelectedVenueId(e.target.value)}
                className="bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white flex-1"
              >
                {venueOptions.map((v) => (
                  <option key={v.id} value={v.id}>{v.name.toUpperCase()}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {PERMISSION_PRESETS.map((preset) => (
              <Button
                key={preset.key}
                size="sm"
                variant="ghost"
                onClick={() => applyPreset(preset.keys)}
              >
                {preset.label}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={clearVenue}>CLEAR ALL</Button>
          </div>

          <div className="space-y-3">
            {PERMISSION_TREE.map((area) => {
              const granted = subAreaGranted(area)
              return (
                <div key={area.key} className={`border p-3 ${granted ? 'border-white/40' : 'border-grey-mid'}`}>
                  <h3 className="font-mono text-xs uppercase tracking-wider text-grey-light mb-2">
                    {area.label}
                    {granted && <span className="text-success ml-2">✓</span>}
                  </h3>
                  <div className="space-y-2">
                    {area.subAreas.map((sub) => (
                      <div key={sub.key} className="border-l border-grey-mid ml-2 pl-3">
                        <div className="font-mono text-[11px] uppercase text-grey-light tracking-wider mb-1">{sub.label}</div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {sub.functions.map((fn) => {
                            const key = `${area.key}.${sub.key}.${fn.key}`
                            const checked = activeSet.has(key)
                            return (
                              <label
                                key={key}
                                className={`flex items-center gap-1.5 font-mono text-[11px] uppercase cursor-pointer transition-colors ${checked ? 'text-white' : 'text-grey-light hover:text-white'}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => toggleKey(key, e.target.checked)}
                                  className="accent-white"
                                />
                                {fn.label}
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {error && <p className="font-mono text-xs text-danger">{error}</p>}

          <div className="border-t border-grey-mid pt-3 flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>CANCEL</Button>
            <Button onClick={save} loading={saving}>SAVE ACCESS</Button>
          </div>
        </div>
      )}
    </Drawer>
  )
}
