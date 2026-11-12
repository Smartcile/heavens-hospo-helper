'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'

interface ParkingConfig {
  enabled: boolean
  entryUrl: string | null
  carparkId: number | null
  carparkName: string | null
  durationMinutes: number
  healthCheckMode: string
  healthPlate: string
  lastCheckAt: string | null
  lastCheckOk: boolean | null
  lastCheckMessage: string | null
}

interface ParkingHealth {
  ok: boolean
  stale: boolean
  message: string
}

interface ParkingRegistration {
  id: string
  licensePlate: string
  status: string
  createdAt: string
  expiresAt: string
  staff?: { firstName: string; lastName: string } | null
}

const EMPTY: ParkingConfig = {
  enabled: false,
  entryUrl: null,
  carparkId: null,
  carparkName: null,
  durationMinutes: 90,
  healthCheckMode: 'READINESS',
  healthPlate: 'STELLA',
  lastCheckAt: null,
  lastCheckOk: null,
  lastCheckMessage: null,
}

function formatDateTime(value: string | null, timezone: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-NZ', {
    timeZone: timezone,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

export function GuestParkingSettings({ venueId, role }: { venueId: string; role: string }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(false)
  const [config, setConfig] = useState<ParkingConfig>(EMPTY)
  const [health, setHealth] = useState<ParkingHealth | null>(null)
  const [registrations, setRegistrations] = useState<ParkingRegistration[]>([])
  const [timezone, setTimezone] = useState('Pacific/Auckland')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const [entryUrl, setEntryUrl] = useState('')
  const [durationMinutes, setDurationMinutes] = useState('90')
  const [healthCheckMode, setHealthCheckMode] = useState('READINESS')
  const [healthPlate, setHealthPlate] = useState('STELLA')

  const apply = useCallback((next: { config?: Partial<ParkingConfig> | null; health?: ParkingHealth | null }) => {
    const cfg: ParkingConfig = { ...EMPTY, ...(next.config ?? {}) }
    setConfig(cfg)
    setHealth(next.health ?? null)
    setEntryUrl(cfg.entryUrl ?? '')
    setDurationMinutes(String(cfg.durationMinutes ?? 90))
    setHealthCheckMode(cfg.healthCheckMode ?? 'READINESS')
    setHealthPlate(cfg.healthPlate ?? 'STELLA')
  }, [])

  const loadRegistrations = useCallback(async () => {
    const res = await fetch(`/api/admin/parking/registrations?venueId=${encodeURIComponent(venueId)}&limit=20`)
    if (!res.ok) return
    const body = await res.json()
    setRegistrations(body.registrations ?? [])
    if (body.timezone) setTimezone(body.timezone)
  }, [venueId])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/parking/config?venueId=${encodeURIComponent(venueId)}`)
      if (!res.ok) {
        setError('COULD NOT LOAD PARKING CONFIG')
        return
      }
      const body = await res.json()
      apply(body)
      setError('')
      if (body.config?.enabled) await loadRegistrations()
      else setRegistrations([])
    } catch {
      setError('COULD NOT LOAD PARKING CONFIG')
    } finally {
      setLoading(false)
    }
  }, [venueId, apply, loadRegistrations])

  useEffect(() => {
    void load()
  }, [load])

  async function save(enabled: boolean) {
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const res = await fetch('/api/admin/parking/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venueId,
          enabled,
          entryUrl,
          durationMinutes: Number(durationMinutes) || 90,
          healthCheckMode,
          healthPlate,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || 'SAVE FAILED')
        return
      }
      apply(body)
      setMessage(body.warning ? `SAVED — ${body.warning}` : 'SAVED')
      if (enabled) await loadRegistrations()
    } catch {
      setError('SAVE FAILED')
    } finally {
      setSaving(false)
    }
  }

  async function runCheck() {
    setChecking(true)
    setMessage('')
    setError('')
    try {
      const res = await fetch('/api/admin/parking/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || 'CHECK FAILED')
        return
      }
      if (body.health) setHealth(body.health)
      setMessage(body.result?.message ? `CHECK: ${body.result.message}` : 'CHECK COMPLETE')
    } catch {
      setError('CHECK FAILED')
    } finally {
      setChecking(false)
    }
  }

  const healthTone = health?.ok
    ? 'border-success/40 text-success'
    : 'border-danger/40 text-danger'

  return (
    <div className="max-w-2xl border-l-4 border-l-grey-mid pl-4 space-y-3">
      <h2 className="font-mono text-sm uppercase tracking-widest text-white mb-1">GUEST PARKING</h2>
      <p className="font-mono text-xs text-grey-light">
        OPTIONAL SCAN2PAY AUTOMATION. DISABLED AND INVISIBLE BY DEFAULT — SAVE THE CARPARK URL
        AND ENABLE IT TO SHOW THE WORKER TILE. ONLY SCAN2PAY.NZ URLS ARE ACCEPTED. THIS REPLAYS
        THE PUBLIC FORM; KEEP THE URL PRIVATE.
      </p>

      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              id="parking-enabled"
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => void save(e.target.checked)}
              disabled={saving}
              className="w-4 h-4 accent-white"
            />
            <label htmlFor="parking-enabled" className="font-mono text-xs uppercase text-white">
              ENABLE GUEST PARKING
            </label>
            {saving && <span className="font-mono text-2xs text-grey-light loading-cursor">SAVING</span>}
          </div>

          <Input
            label="Carpark URL"
            value={entryUrl}
            onChange={(e) => setEntryUrl(e.target.value)}
            placeholder="https://scan2pay.nz/Parking/Scan?carparkId=19"
          />
          {config.carparkName && (
            <p className="font-mono text-2xs text-grey-light">CARPARK: {config.carparkName}</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Duration (minutes)"
              type="number"
              min="15"
              max="1440"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
            />
            <Select
              label="Health check"
              value={healthCheckMode}
              onChange={(e) => setHealthCheckMode(e.target.value)}
              options={[
                { value: 'READINESS', label: 'READINESS (GET ONLY)' },
                { value: 'FULL', label: 'FULL (TEST PLATE)' },
                { value: 'OFF', label: 'OFF' },
              ]}
            />
          </div>

          <Input
            label="Health check plate"
            value={healthPlate}
            onChange={(e) => setHealthPlate(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="STELLA"
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void save(config.enabled)} loading={saving} size="sm">
              SAVE
            </Button>
            <Button
              onClick={() => void runCheck()}
              loading={checking}
              size="sm"
              variant="ghost"
              disabled={!config.enabled}
            >
              RUN CHECK NOW
            </Button>
          </div>

          <div className={`border p-3 ${healthTone}`}>
            <p className="font-mono text-xs font-bold uppercase">
              {health?.ok ? 'LAST CHECK: OK' : 'LAST CHECK: NEEDS ATTENTION'}
            </p>
            <p className="font-mono text-2xs mt-1">
              {health?.message || 'NO CHECK HAS RUN YET'}
              {config.lastCheckAt ? ` · ${formatDateTime(config.lastCheckAt, timezone)}` : ''}
            </p>
          </div>

          {message && <p className="font-mono text-xs text-success">{message}</p>}
          {error && <p className="font-mono text-xs text-danger">{error}</p>}

          {config.enabled && (
            <div className="border border-grey-mid">
              <div className="px-3 py-2 border-b border-grey-mid">
                <h3 className="font-mono text-xs uppercase tracking-wider text-grey-light">
                  RECENT REGISTRATIONS
                </h3>
              </div>
              {registrations.length === 0 ? (
                <p className="px-3 py-3 font-mono text-xs text-grey-light">NONE YET.</p>
              ) : (
                <div className="divide-y divide-grey-mid">
                  {registrations.map((registration) => (
                    <div key={registration.id} className="px-3 py-2 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-sm text-white tracking-wider">
                          {registration.licensePlate}
                        </p>
                        <p className="font-mono text-2xs text-grey-light">
                          {registration.status.replace('_', ' ')} · UNTIL{' '}
                          {formatDateTime(registration.expiresAt, timezone)}
                          {registration.staff
                            ? ` · ${registration.staff.firstName} ${registration.staff.lastName}`
                            : ''}
                        </p>
                      </div>
                      <span className="shrink-0 font-mono text-2xs text-grey-light">
                        {formatDateTime(registration.createdAt, timezone)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <p className="font-mono text-2xs text-grey-light">
            {role === 'ADMIN' ? '' : 'VENUE MANAGERS CAN EDIT THIS INTEGRATION FOR THEIR OWN VENUE. '}
            READINESS ONLY FETCHES THE FORM. FULL SUBMITS THE TEST PLATE AND CREATES A REAL $0
            SESSION.
          </p>
        </div>
      )}
    </div>
  )
}
