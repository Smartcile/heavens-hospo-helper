'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'

interface ParkingRegistration {
  id: string
  licensePlate: string
  status: string
  startsAt: string
  expiresAt: string
  durationMinutes: number
  confirmationRef: string | null
  createdAt: string
  staff?: { firstName: string; lastName: string } | null
}

interface ParkingHealth {
  ok: boolean
  stale: boolean
  message: string
}

interface ParkingConfigView {
  carparkId: number | null
  carparkName: string | null
  durationMinutes: number
}

interface ParkingData {
  enabled: boolean
  config?: ParkingConfigView
  health?: ParkingHealth | null
  timezone?: string
  today?: string
  registrations?: ParkingRegistration[]
}

interface Outcome {
  kind: 'success' | 'duplicate' | 'error'
  text: string
  registration?: ParkingRegistration
  extendUrl?: string
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function toLocalInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function shiftMinutes(value: string, minutes: number): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  date.setMinutes(date.getMinutes() + minutes)
  return toLocalInputValue(date)
}

function formatTime(iso: string, timezone: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-NZ', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function statusTone(status: string): string {
  if (status === 'CONFIRMED') return 'text-success border-success/40'
  if (status === 'ALREADY_ACTIVE') return 'text-warning border-warning/40'
  return 'text-danger border-danger/40'
}

export function WorkerParkingClient() {
  const [data, setData] = useState<ParkingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [plate, setPlate] = useState('')
  const [arrival, setArrival] = useState(() => toLocalInputValue(new Date()))
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/worker/parking')
      if (res.status === 401) {
        window.location.href = '/w/login'
        return
      }
      if (!res.ok) {
        setLoading(false)
        return
      }
      setData(await res.json())
    } catch {
      // Leave the last payload mounted; a retry updates it.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const timezone = data?.timezone || 'Pacific/Auckland'
  const durationMinutes = data?.config?.durationMinutes ?? 90

  async function submit(event: FormEvent) {
    event.preventDefault()
    setMessage('')
    setOutcome(null)

    const arrived = new Date(arrival)
    if (Number.isNaN(arrived.getTime())) {
      setMessage('ENTER THE ARRIVAL TIME')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/worker/parking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licensePlate: plate, arrivedAt: arrived.toISOString() }),
      })
      const body = await res.json().catch(() => ({}))

      if (res.status === 409) {
        setOutcome({
          kind: 'duplicate',
          text: body.error || 'THIS PLATE IS ALREADY REGISTERED TODAY',
          registration: body.registration,
          extendUrl: body.extendUrl,
        })
        await load()
        return
      }

      if (!res.ok) {
        setMessage(body.error || 'COULD NOT REGISTER PARKING')
        setOutcome({
          kind: 'error',
          text: body.error || 'COULD NOT REGISTER PARKING',
          registration: body.registration,
          extendUrl: body.extendUrl,
        })
        if (body.registration) await load()
        return
      }

      setOutcome({
        kind: 'success',
        text: body.result?.message || 'PARKING REGISTERED',
        registration: body.registration,
        extendUrl: body.extendUrl,
      })
      setPlate('')
      setArrival(toLocalInputValue(new Date()))
      await load()
    } catch {
      setMessage('COULD NOT CONNECT — TRY AGAIN')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="font-mono text-sm text-grey-light loading-cursor">LOADING</p>
      </div>
    )
  }

  if (!data?.enabled) {
    return (
      <div className="min-h-screen bg-black p-4">
        <div className="border border-grey-mid p-4">
          <h1 className="font-mono text-sm font-bold uppercase tracking-widest text-white">GUEST PARKING</h1>
          <p className="font-mono text-xs text-grey-light mt-2">
            GUEST PARKING IS NOT ENABLED FOR THIS VENUE.
          </p>
        </div>
      </div>
    )
  }

  const registrations = data.registrations ?? []
  const health = data.health
  const warning = health && !health.ok

  return (
    <div className="min-h-screen bg-black p-4 pb-28 space-y-4">
      <div>
        <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">GUEST PARKING</h1>
        <p className="font-mono text-xs text-grey-light mt-0.5 uppercase">
          {data.config?.carparkName || 'CARPARK'} · {durationMinutes} MINUTE FREE WINDOW
        </p>
      </div>

      {warning && (
        <div className="border border-danger/50 bg-danger/10 p-3 space-y-1">
          <p className="font-mono text-xs font-bold uppercase text-danger">SERVICE WARNING</p>
          <p className="font-mono text-xs text-danger/80">{health?.message}</p>
          <p className="font-mono text-2xs text-grey-light">
            IF REGISTRATION FAILS, USE THE SCAN2PAY WEBSITE DIRECTLY.
          </p>
        </div>
      )}

      <form onSubmit={submit} className="border border-grey-mid p-4 space-y-4">
        <div className="space-y-2">
          <label htmlFor="plate" className="font-mono text-xs uppercase text-grey-light tracking-wider block">
            NUMBER PLATE
          </label>
          <input
            id="plate"
            value={plate}
            onChange={(e) => setPlate(e.target.value.toUpperCase())}
            maxLength={6}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="ABC123"
            className="w-full bg-black border border-grey-mid text-white font-mono text-2xl tracking-[0.3em] text-center uppercase px-3 py-3 outline-none focus:border-white placeholder:text-grey-light/50"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="arrival" className="font-mono text-xs uppercase text-grey-light tracking-wider block">
            ARRIVAL TIME
          </label>
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => setArrival((v) => shiftMinutes(v, -30))}
              className="h-10 border border-grey-mid text-grey-light font-mono text-xs uppercase hover:border-white hover:text-white transition-colors"
            >
              -30
            </button>
            <button
              type="button"
              onClick={() => setArrival((v) => shiftMinutes(v, -15))}
              className="h-10 border border-grey-mid text-grey-light font-mono text-xs uppercase hover:border-white hover:text-white transition-colors"
            >
              -15
            </button>
            <button
              type="button"
              onClick={() => setArrival((v) => shiftMinutes(v, -5))}
              className="h-10 border border-grey-mid text-grey-light font-mono text-xs uppercase hover:border-white hover:text-white transition-colors"
            >
              -5
            </button>
            <button
              type="button"
              onClick={() => setArrival(toLocalInputValue(new Date()))}
              className="h-10 border border-grey-mid text-grey-light font-mono text-xs uppercase hover:border-white hover:text-white transition-colors"
            >
              NOW
            </button>
          </div>
          <input
            id="arrival"
            type="datetime-local"
            value={arrival}
            onChange={(e) => setArrival(e.target.value)}
            className="w-full bg-black border border-grey-mid text-white font-mono text-sm px-3 py-3 outline-none focus:border-white"
          />
        </div>

        <Button type="submit" loading={submitting} size="lg" className="w-full">
          REGISTER {durationMinutes} MINUTES
        </Button>

        {message && !outcome && (
          <p className="font-mono text-xs text-danger">{message}</p>
        )}
      </form>

      {outcome && (
        <div
          className={`border p-4 space-y-2 ${
            outcome.kind === 'success'
              ? 'border-success/50 bg-success/5'
              : outcome.kind === 'duplicate'
                ? 'border-warning/50 bg-warning/5'
                : 'border-danger/50 bg-danger/5'
          }`}
        >
          <p
            className={`font-mono text-sm font-bold uppercase ${
              outcome.kind === 'success'
                ? 'text-success'
                : outcome.kind === 'duplicate'
                  ? 'text-warning'
                  : 'text-danger'
            }`}
          >
            {outcome.kind === 'success'
              ? 'PARKING REGISTERED'
              : outcome.kind === 'duplicate'
                ? 'ALREADY REGISTERED TODAY'
                : 'PARKING NOT REGISTERED'}
          </p>

          {outcome.registration && (
            <div className="font-mono text-xs text-white space-y-1">
              <div className="text-lg tracking-[0.2em]">{outcome.registration.licensePlate}</div>
              <div className="text-grey-light">
                UNTIL {formatTime(outcome.registration.expiresAt, timezone)}
                {outcome.registration.confirmationRef ? ` · REF ${outcome.registration.confirmationRef}` : ''}
              </div>
            </div>
          )}

          {outcome.kind !== 'success' && (
            <p className="font-mono text-xs text-grey-light">{outcome.text}</p>
          )}

          {outcome.extendUrl && (
            <a
              href={outcome.extendUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-block border border-grey-mid px-3 py-2 font-mono text-xs uppercase text-white hover:border-white transition-colors"
            >
              EXTEND ON SCAN2PAY ↗
            </a>
          )}
        </div>
      )}

      <div className="border border-grey-mid">
        <div className="px-3 py-2 border-b border-grey-mid">
          <h2 className="font-mono text-xs uppercase tracking-wider text-grey-light">
            TODAY&apos;S REGISTRATIONS ({registrations.length})
          </h2>
        </div>
        {registrations.length === 0 ? (
          <p className="px-3 py-4 font-mono text-xs text-grey-light">NO REGISTRATIONS YET TODAY.</p>
        ) : (
          <div className="divide-y divide-grey-mid">
            {registrations.map((registration) => (
              <div key={registration.id} className="px-3 py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm text-white tracking-wider">{registration.licensePlate}</p>
                  <p className="font-mono text-2xs text-grey-light">
                    UNTIL {formatTime(registration.expiresAt, timezone)}
                    {registration.staff ? ` · ${registration.staff.firstName} ${registration.staff.lastName}` : ''}
                  </p>
                </div>
                <span
                  className={`shrink-0 border px-2 py-1 font-mono text-2xs uppercase ${statusTone(registration.status)}`}
                >
                  {registration.status.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
