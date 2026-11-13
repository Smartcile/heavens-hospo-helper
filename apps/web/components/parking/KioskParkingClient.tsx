'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  appendPlateKey,
  formatKioskCountdown,
  kioskCountdownProgress,
  removeLastPlateKey,
} from '@/lib/parking-kiosk'
import { PlateKeypad } from './PlateKeypad'
import { KioskStaffSheet } from './KioskStaffSheet'

export interface KioskParkingConfig {
  venueId: string
  requireCode: boolean
  venueName: string
  carparkName: string
  durationMinutes: number
  timezone: string
  resetSeconds: number
  fourHourName: string
  fourHourEnabled: boolean
}

interface KioskResult {
  status: string
  ok?: boolean
  message?: string
  plate: string
  endTime: string | null
  expiresAt?: string | null
  existingExpiry?: string | null
  alreadyActive?: boolean
  qrDataUrl: string | null
  linkUrl: string | null
}

type Stage = 'entry' | 'submitting' | 'result'

const RESULT_TIMEOUT_MS = 20_000

export function KioskParkingClient({ config }: { config: KioskParkingConfig }) {
  const [tab, setTab] = useState<'guest' | 'four'>('guest')
  const [plate, setPlate] = useState('')
  const [stage, setStage] = useState<Stage>('entry')
  const [result, setResult] = useState<KioskResult | null>(null)
  const [error, setError] = useState('')
  const [staffOpen, setStaffOpen] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(config.resetSeconds)
  const abortRef = useRef<AbortController | null>(null)

  // A customer must not be able to browse away from the kiosk.
  useEffect(() => {
    const guard = () => window.history.pushState(null, '', window.location.href)
    window.history.pushState(null, '', window.location.href)
    window.addEventListener('popstate', guard)
    return () => window.removeEventListener('popstate', guard)
  }, [])

  const reset = useCallback(() => {
    setPlate('')
    setResult(null)
    setError('')
    setStaffOpen(false)
    setSecondsLeft(config.resetSeconds)
    setStage('entry')
  }, [config.resetSeconds])

  // Visible reset timer: the plate/QR disappear when it reaches zero.
  useEffect(() => {
    if (stage !== 'result') return
    setSecondsLeft(config.resetSeconds)
    const timer = setInterval(() => {
      setSecondsLeft((current) => (current <= 1 ? 0 : current - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [stage, config.resetSeconds])

  useEffect(() => {
    if (stage === 'result' && secondsLeft === 0) reset()
  }, [stage, secondsLeft, reset])

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  function press(key: string) {
    setError('')
    setPlate((current) => appendPlateKey(current, key))
  }

  async function submit() {
    if (stage !== 'entry' || !plate) return
    setError('')
    setStage('submitting')
    const controller = new AbortController()
    abortRef.current = controller
    const timeout = setTimeout(() => controller.abort(), RESULT_TIMEOUT_MS)

    try {
      const res = await fetch('/api/public/parking/kiosk/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licensePlate: plate, venueId: config.venueId }),
        cache: 'no-store',
        signal: controller.signal,
      })
      const body = await res.json().catch(() => ({}))

      if (res.status === 401) {
        window.location.reload()
        return
      }
      if (res.status === 422) {
        setError(body.error || 'CHECK THE NUMBER PLATE')
        setStage('entry')
        return
      }
      if (!res.ok) {
        setResult({
          status: 'FAILED',
          ok: false,
          message: body.error || 'COULD NOT REGISTER',
          plate,
          endTime: null,
          qrDataUrl: body.qrDataUrl ?? null,
          linkUrl: body.linkUrl ?? null,
        })
        setStage('result')
        return
      }

      setResult(body as KioskResult)
      setStage('result')
    } catch (caught) {
      const aborted = caught instanceof Error && caught.name === 'AbortError'
      setError(
        aborted
          ? 'TIMED OUT — PLEASE SPEAK WITH STAFF'
          : 'COULD NOT CONNECT — PLEASE SPEAK WITH STAFF',
      )
      setStage('entry')
    } finally {
      clearTimeout(timeout)
      abortRef.current = null
    }
  }

  const slots = Array.from({ length: 6 }, (_, index) => plate[index] ?? '')
  const title = result?.status === 'CONFIRMED'
    ? 'PARKING REGISTERED'
    : result?.status === 'ALREADY_ACTIVE'
      ? 'ALREADY REGISTERED'
      : 'COULD NOT REGISTER'

  return (
    <div className="flex h-full w-full select-none flex-col overflow-hidden bg-black text-white">
      <header className="shrink-0 border-b border-grey-mid px-5 py-3">
        <div className="flex items-baseline justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate font-mono text-sm uppercase tracking-widest text-grey-light">
              {config.venueName || 'VENUE'}
            </p>
            <h1 className="truncate font-mono text-xl font-bold uppercase tracking-widest">
              {config.carparkName || 'CARPARK'}
            </h1>
          </div>
          <p className="shrink-0 border border-success/50 px-3 py-1.5 font-mono text-sm font-bold uppercase tracking-wider text-success">
            {config.durationMinutes} MIN FREE
          </p>
        </div>
      </header>

      <div className="shrink-0 border-b border-grey-mid">
        <div className="flex">
          <button
            type="button"
            onClick={() => setTab('guest')}
            className={`flex-1 border-r border-grey-mid py-2 font-mono text-xs font-bold uppercase tracking-widest ${
              tab === 'guest' ? 'bg-white text-black' : 'text-grey-light'
            }`}
          >
            {config.durationMinutes} MINUTE
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('four')
              reset()
            }}
            disabled={!config.fourHourEnabled}
            className="flex-1 py-2 font-mono text-xs font-bold uppercase tracking-widest text-grey-light/50 disabled:cursor-not-allowed"
          >
            {config.fourHourName || '4 HOUR'} {config.fourHourEnabled ? '' : '— SOON'}
          </button>
        </div>
      </div>

      <main className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-3">
        {tab === 'four' ? (
          <div className="text-center space-y-3">
            <p className="font-mono text-2xl font-bold uppercase tracking-widest">
              {config.fourHourName || '4 HOUR CAR PARK'}
            </p>
            <p className="font-mono text-sm uppercase text-grey-light">
              NOT AVAILABLE YET — PLEASE SPEAK WITH STAFF.
            </p>
            <button
              type="button"
              onClick={() => setTab('guest')}
              className="border border-grey-mid px-4 py-3 font-mono text-xs uppercase tracking-wider text-white"
            >
              BACK TO {config.durationMinutes} MINUTE PARKING
            </button>
          </div>
        ) : stage === 'entry' || stage === 'submitting' ? (
          <div className="flex w-full max-w-3xl flex-col gap-3">
            <p className="text-center font-mono text-base uppercase tracking-widest text-grey-light">
              ENTER YOUR NUMBER PLATE
            </p>

            <div className="flex justify-center gap-2" aria-live="polite">
              {slots.map((char, index) => (
                <div
                  key={index}
                  className={`flex h-16 w-12 items-center justify-center border-2 font-mono text-4xl font-bold tracking-wider md:h-20 md:w-16 ${
                    char ? 'border-white text-white' : 'border-grey-mid text-grey-light/30'
                  }`}
                >
                  {char || '·'}
                </div>
              ))}
            </div>

            <PlateKeypad
              onKey={press}
              onBackspace={() => {
                setError('')
                setPlate((current) => removeLastPlateKey(current))
              }}
              onClear={() => {
                setError('')
                setPlate('')
              }}
              disabled={stage === 'submitting'}
            />

            {error && (
              <p className="text-center font-mono text-sm text-danger" role="alert">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={() => void submit()}
              disabled={!plate || stage === 'submitting'}
              className="mt-1 w-full border border-white bg-white py-5 font-mono text-xl font-bold uppercase tracking-widest text-black disabled:opacity-30"
            >
              {stage === 'submitting'
                ? 'REGISTERING…'
                : `REGISTER ${config.durationMinutes} MINUTES`}
            </button>
          </div>
        ) : (
          result && (
            <div className="flex w-full max-w-3xl flex-col items-center gap-3" aria-live="polite">
              <p
                className={`text-center font-mono text-2xl font-bold uppercase tracking-widest md:text-3xl ${
                  result.status === 'CONFIRMED'
                    ? 'text-success'
                    : result.status === 'ALREADY_ACTIVE'
                      ? 'text-warning'
                      : 'text-danger'
                }`}
              >
                {title}
              </p>

              <p className="font-mono text-4xl font-bold tracking-[0.35em] text-white md:text-5xl">
                {result.plate}
              </p>

              {result.status === 'CONFIRMED' && result.endTime && (
                <p className="text-center font-mono text-xl uppercase tracking-wider text-white">
                  FREE PARKING UNTIL{' '}
                  <span className="font-bold text-success">{result.endTime}</span>
                </p>
              )}

              {result.status === 'ALREADY_ACTIVE' && (
                <p className="text-center font-mono text-lg uppercase tracking-wider text-white">
                  THIS PLATE ALREADY HAS A SESSION TODAY
                  {result.existingExpiry ? ` — UNTIL ${result.existingExpiry}` : ''}
                </p>
              )}

              {result.status === 'FAILED' && (
                <p className="text-center font-mono text-lg uppercase text-danger">
                  {result.message || 'PLEASE SPEAK WITH STAFF'}
                </p>
              )}

              {result.qrDataUrl && (
                <div className="flex flex-col items-center gap-2 rounded-sm bg-white p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={result.qrDataUrl}
                    alt="QR code to open this parking session on your phone"
                    className="h-40 w-40 md:h-48 md:w-48"
                  />
                </div>
              )}

              <p className="max-w-md text-center font-mono text-sm uppercase leading-relaxed text-grey-light">
                SCAN ME WITH YOUR PHONE CAMERA TO VIEW OR EXTEND
              </p>

              <div className="w-full max-w-md">
                <div className="h-3 w-full border border-grey-mid bg-grey-dark">
                  <div
                    className="h-full bg-warning transition-[width] duration-1000 ease-linear"
                    style={{
                      width: `${kioskCountdownProgress(secondsLeft, config.resetSeconds) * 100}%`,
                    }}
                  />
                </div>
                <p className="mt-1 text-center font-mono text-xs uppercase tracking-widest text-grey-light">
                  STARTS AGAIN IN {formatKioskCountdown(secondsLeft)}
                </p>
              </div>

              <button
                type="button"
                onClick={reset}
                className="w-full max-w-md border border-white bg-white py-4 font-mono text-lg font-bold uppercase tracking-widest text-black"
              >
                START AGAIN
              </button>
            </div>
          )
        )}
      </main>

      <footer className="shrink-0 border-t border-grey-mid p-3">
        <button
          type="button"
          onClick={() => setStaffOpen(true)}
          className="w-full border border-grey-mid py-4 font-mono text-base font-semibold uppercase tracking-widest text-white"
        >
          SPEAK WITH STAFF
        </button>
      </footer>

      <KioskStaffSheet
        open={staffOpen}
        onClose={() => setStaffOpen(false)}
        requireCode={config.requireCode}
        plate={result?.plate ?? (plate || null)}
        endTime={result?.endTime ?? null}
        linkUrl={result?.linkUrl ?? null}
        qrDataUrl={result?.qrDataUrl ?? null}
      />
    </div>
  )
}
