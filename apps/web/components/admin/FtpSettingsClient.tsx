'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { GuestParkingSettings } from '@/components/admin/GuestParkingSettings'
import { StaffPlatesPanel } from '@/components/admin/StaffPlatesPanel'
import {
  DEFAULT_FOUR_HOUR_MINUTES,
  DEFAULT_FOUR_HOUR_NAME,
  DEFAULT_KIOSK_RESET_SECONDS,
  DEFAULT_STAFF_CARPARK_NAME,
  MAX_KIOSK_RESET_SECONDS,
  MIN_KIOSK_RESET_SECONDS,
} from '@/lib/ftp-settings'

interface Venue {
  id: string
  name: string
}

interface FtpSettings {
  contactEmail: string | null
  kioskEnabled: boolean
  kioskRequireCode: boolean
  kioskCodeHint: string | null
  kioskAutoResetSeconds: number
  fourHourName: string
  fourHourEnabled: boolean
  fourHourEntryUrl: string | null
  fourHourDurationMinutes: number
  staffParkingEnabled: boolean
  staffCarparkName: string
  staffCarparkNotes: string | null
}

interface FtpData {
  settings: FtpSettings
  parking: { enabled: boolean; carparkName: string | null; durationMinutes: number }
  kioskUrl: string
}

const EMPTY: FtpSettings = {
  contactEmail: null,
  kioskEnabled: false,
  kioskRequireCode: false,
  kioskCodeHint: null,
  kioskAutoResetSeconds: DEFAULT_KIOSK_RESET_SECONDS,
  fourHourName: DEFAULT_FOUR_HOUR_NAME,
  fourHourEnabled: false,
  fourHourEntryUrl: null,
  fourHourDurationMinutes: DEFAULT_FOUR_HOUR_MINUTES,
  staffParkingEnabled: false,
  staffCarparkName: DEFAULT_STAFF_CARPARK_NAME,
  staffCarparkNotes: null,
}

export function FtpSettingsClient({
  role,
  sessionVenueId,
  initialVenueId,
}: {
  role: string
  sessionVenueId: string
  initialVenueId?: string
}) {
  const [venues, setVenues] = useState<Venue[]>([])
  const [venueId, setVenueId] = useState(initialVenueId || sessionVenueId)
  const [data, setData] = useState<FtpData | null>(null)
  const [form, setForm] = useState<FtpSettings>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [codeBusy, setCodeBusy] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/admin/venues')
        if (!res.ok) return
        const body = await res.json()
        const raw: Venue[] = Array.isArray(body) ? body : (body.venues ?? [])
        const list: Venue[] = raw.map((venue) => ({ id: venue.id, name: venue.name }))
        setVenues(list)
        if (!list.some((venue) => venue.id === venueId) && list[0]) {
          setVenueId(list[0].id)
        }
      } catch {
        // The selector is optional; the session venue still works.
      }
    })()
  }, [venueId])

  const apply = useCallback((next: FtpData) => {
    setData(next)
    setForm({ ...EMPTY, ...next.settings })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/parking/ftp?venueId=${encodeURIComponent(venueId)}`)
      if (!res.ok) {
        setError('COULD NOT LOAD FTP SETTINGS')
        return
      }
      apply(await res.json())
      setError('')
    } catch {
      setError('COULD NOT LOAD FTP SETTINGS')
    } finally {
      setLoading(false)
    }
  }, [venueId, apply])

  useEffect(() => {
    void load()
  }, [load])

  function patch<K extends keyof FtpSettings>(key: K, value: FtpSettings[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function save() {
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const res = await fetch('/api/admin/parking/ftp', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueId, ...form }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || 'SAVE FAILED')
        return
      }
      setData((current) =>
        current ? { ...current, settings: body.settings, kioskUrl: body.kioskUrl } : current,
      )
      setForm({ ...EMPTY, ...body.settings })
      setMessage('SAVED')
    } catch {
      setError('SAVE FAILED')
    } finally {
      setSaving(false)
    }
  }

  async function rotateCode() {
    setCodeBusy(true)
    setMessage('')
    setError('')
    setNewCode('')
    try {
      const res = await fetch('/api/admin/parking/ftp/kiosk-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || 'COULD NOT CREATE A KIOSK CODE')
        return
      }
      setNewCode(body.code)
      await load()
    } catch {
      setError('COULD NOT CREATE A KIOSK CODE')
    } finally {
      setCodeBusy(false)
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setError('COPY FAILED — SELECT THE TEXT MANUALLY')
    }
  }

  const parkingEnabled = data?.parking.enabled ?? false

  return (
    <div className="max-w-3xl space-y-5" id="ftp-settings">
      <div>
        <h1 className="font-mono text-xl font-bold uppercase tracking-widest text-white">
          FREE THE CARPARK (FTP)
        </h1>
        <p className="font-mono text-xs text-grey-light">
          THE CUSTOMER KIOSK, THE CUSTOM EMAIL, THE 4 HOUR CARPARK AND STAFF NUMBER PLATES.
        </p>
      </div>

      {venues.length > 1 && role === 'ADMIN' && (
        <Select
          label="Venue"
          value={venueId}
          onChange={(e) => setVenueId(e.target.value)}
          options={venues.map((venue) => ({ value: venue.id, label: venue.name }))}
        />
      )}

      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : (
        <>
          {/* CUSTOMER KIOSK */}
          <section className="border border-grey-mid p-4 space-y-3">
            <h2 className="font-mono text-sm uppercase tracking-widest text-white">
              CUSTOMER KIOSK
            </h2>
            <p className="font-mono text-xs text-grey-light">
              A BIG, SIMPLE SCREEN ON AN iPAD. GUESTS TYPE THEIR PLATE, SEE THE END TIME AND A
              QR CODE, AND THE SCREEN CLEARS ITSELF ON A VISIBLE TIMER.
            </p>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.kioskEnabled}
                onChange={(e) => patch('kioskEnabled', e.target.checked)}
                disabled={!parkingEnabled}
                className="h-4 w-4 accent-white"
              />
              <span className="font-mono text-xs uppercase text-white">ENABLE THE KIOSK</span>
            </label>
            {!parkingEnabled && (
              <p className="font-mono text-2xs uppercase text-warning">
                ENABLE 90 MINUTE PARKING FIRST.
              </p>
            )}

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.kioskRequireCode}
                onChange={(e) => patch('kioskRequireCode', e.target.checked)}
                disabled={!form.kioskCodeHint}
                className="h-4 w-4 accent-white"
              />
              <span className="font-mono text-xs uppercase text-white">REQUIRE KIOSK CODE</span>
            </label>
            <p className="font-mono text-2xs uppercase text-grey-light">
              {form.kioskRequireCode
                ? 'THE iPAD ASKS FOR THE CODE BEFORE THE PLATE SCREEN.'
                : 'THE KIOSK OPENS DIRECTLY — NO CODE NEEDED.'}
              {!form.kioskCodeHint ? ' SET A CODE FIRST TO TURN THIS ON.' : ''}
            </p>

            <div className="grid gap-3 md:grid-cols-2">
              <Input
                label={`Auto-reset seconds (${MIN_KIOSK_RESET_SECONDS}–${MAX_KIOSK_RESET_SECONDS})`}
                type="number"
                min={MIN_KIOSK_RESET_SECONDS}
                max={MAX_KIOSK_RESET_SECONDS}
                value={String(form.kioskAutoResetSeconds)}
                onChange={(e) => patch('kioskAutoResetSeconds', Number(e.target.value))}
              />
              <div className="space-y-1">
                <p className="font-mono text-xs uppercase text-grey-light">Kiosk code</p>
                <p className="font-mono text-sm text-white">
                  {form.kioskCodeHint ? `••••${form.kioskCodeHint}` : 'NOT SET'}
                </p>
                {role === 'ADMIN' ? (
                  <Button onClick={() => void rotateCode()} loading={codeBusy} size="sm" variant="ghost">
                    {form.kioskCodeHint ? 'ROTATE CODE' : 'SET CODE'}
                  </Button>
                ) : (
                  <p className="font-mono text-2xs uppercase text-grey-light">
                    ONLY AN ADMIN CAN CHANGE THE KIOSK CODE.
                  </p>
                )}
              </div>
            </div>

            {newCode && (
              <div className="border border-success/50 bg-success/5 p-3 space-y-2">
                <p className="font-mono text-xs font-bold uppercase text-success">
                  NEW KIOSK CODE — SHOWN ONCE
                </p>
                <p className="font-mono text-2xl tracking-[0.3em] text-white">{newCode}</p>
                <p className="font-mono text-2xs uppercase text-grey-light">
                  WRITE IT DOWN. ROTATING IT LOCKS EVERY EXISTING iPAD.
                </p>
                <Button size="sm" variant="ghost" onClick={() => void copy(newCode)}>
                  {copied ? 'COPIED' : 'COPY CODE'}
                </Button>
              </div>
            )}

            <div className="space-y-1 border-t border-grey-mid pt-3">
              <p className="font-mono text-xs uppercase text-grey-light">Kiosk URL</p>
              <p className="break-all font-mono text-xs text-white">{data?.kioskUrl}</p>
              <Button size="sm" variant="ghost" onClick={() => void copy(data?.kioskUrl ?? '')}>
                COPY URL
              </Button>
              <p className="font-mono text-2xs uppercase text-grey-light">
                OPEN THIS URL ON THE iPAD ONCE AND UNLOCK IT WITH THE KIOSK CODE. FOR THE HARDEST
                LOCK, TURN ON iPAD GUIDED ACCESS (TRIPLE-CLICK THE SIDE BUTTON).
              </p>
            </div>
          </section>

          {/* 90 MINUTE */}
          <section className="border border-grey-mid p-4 space-y-3">
            <h2 className="font-mono text-sm uppercase tracking-widest text-white">
              90 MINUTE CAR PARK
            </h2>
            <Input
              label="Custom email (used when a carpark form requires one)"
              type="email"
              value={form.contactEmail ?? ''}
              onChange={(e) => patch('contactEmail', e.target.value || null)}
              placeholder="carpark@venue.nz"
            />
            <p className="font-mono text-2xs uppercase text-grey-light">
              {data?.parking.carparkName
                ? `CONNECTED TO ${data.parking.carparkName}`
                : 'NOT CONNECTED YET'}
            </p>
            <GuestParkingSettings venueId={venueId} role={role} />
          </section>

          {/* 4 HOUR */}
          <section className="border border-grey-mid p-4 space-y-3">
            <h2 className="font-mono text-sm uppercase tracking-widest text-white">
              4 HOUR CAR PARK
            </h2>
            <p className="font-mono text-xs text-grey-light">
              SETTINGS ONLY FOR NOW. THE FLOW OPENS ONCE YOU HAVE THE CARPARK URL.
            </p>
            <Input
              label="Name"
              value={form.fourHourName}
              onChange={(e) => patch('fourHourName', e.target.value)}
              placeholder={DEFAULT_FOUR_HOUR_NAME}
            />
            <Input
              label="Carpark URL"
              value={form.fourHourEntryUrl ?? ''}
              onChange={(e) => patch('fourHourEntryUrl', e.target.value || null)}
              placeholder="https://…"
            />
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                label="Duration (minutes)"
                type="number"
                min="15"
                max="1440"
                value={String(form.fourHourDurationMinutes)}
                onChange={(e) => patch('fourHourDurationMinutes', Number(e.target.value))}
              />
              <label className="flex items-end gap-2 pb-2">
                <input
                  type="checkbox"
                  checked={form.fourHourEnabled}
                  onChange={(e) => patch('fourHourEnabled', e.target.checked)}
                  disabled={!form.fourHourEntryUrl}
                  className="h-4 w-4 accent-white"
                />
                <span className="font-mono text-xs uppercase text-white">ENABLE THE 4 HOUR TAB</span>
              </label>
            </div>
            {!form.fourHourEntryUrl && (
              <p className="font-mono text-2xs uppercase text-warning">
                PASTE THE URL BEFORE ENABLING. THE KIOSK SHOWS THE TAB AS “SOON” UNTIL THEN.
              </p>
            )}
          </section>

          {/* STAFF */}
          <section className="border border-grey-mid p-4 space-y-3">
            <h2 className="font-mono text-sm uppercase tracking-widest text-white">
              STAFF CAR PARK
            </h2>
            <p className="font-mono text-xs text-grey-light">
              STAFF ADD OR CHANGE THEIR PLATE IN THE WORKER APP. EVERY ADD/CHANGE NEEDS A NOTE AND
              YOUR APPROVAL. TICK A PLATE ONCE YOU HAVE ENTERED IT INTO THE PARKING SYSTEM.
            </p>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.staffParkingEnabled}
                onChange={(e) => patch('staffParkingEnabled', e.target.checked)}
                className="h-4 w-4 accent-white"
              />
              <span className="font-mono text-xs uppercase text-white">
                ENABLE STAFF NUMBER PLATES
              </span>
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                label="Name"
                value={form.staffCarparkName}
                onChange={(e) => patch('staffCarparkName', e.target.value)}
                placeholder={DEFAULT_STAFF_CARPARK_NAME}
              />
              <Input
                label="Note for staff (optional)"
                value={form.staffCarparkNotes ?? ''}
                onChange={(e) => patch('staffCarparkNotes', e.target.value || null)}
                placeholder="REAR GATE — SPACES 1–6"
              />
            </div>
            <div className="border-t border-grey-mid pt-3">
              <StaffPlatesPanel venueId={venueId} />
            </div>
          </section>

          <div className="border-t border-grey-mid pt-3 flex flex-wrap items-center gap-2">
            <Button onClick={() => void save()} loading={saving}>
              SAVE FTP SETTINGS
            </Button>
            <Button onClick={() => void load()} variant="ghost" size="sm">
              ↻ RELOAD
            </Button>
            {message && <p className="font-mono text-xs text-success">{message}</p>}
            {error && <p className="font-mono text-xs text-danger">{error}</p>}
          </div>
        </>
      )}
    </div>
  )
}
