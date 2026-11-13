'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  KIOSK_EXIT_HOLD_MS,
  KIOSK_EXIT_LOCKOUT_MS,
  KIOSK_EXIT_MAX_ATTEMPTS,
} from '@/lib/parking-kiosk'

interface KioskStaffSheetProps {
  open: boolean
  onClose: () => void
  requireCode: boolean
  plate: string | null
  endTime: string | null
  linkUrl: string | null
  qrDataUrl: string | null
}

export function KioskStaffSheet({
  open,
  onClose,
  requireCode,
  plate,
  endTime,
  linkUrl,
  qrDataUrl,
}: KioskStaffSheetProps) {
  const [holdMs, setHoldMs] = useState(0)
  const [armed, setArmed] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [lockedUntil, setLockedUntil] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [exiting, setExiting] = useState(false)
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const heldRef = useRef(false)

  const locked = lockedUntil > now

  function stopHold() {
    if (holdTimer.current) clearInterval(holdTimer.current)
    holdTimer.current = null
    heldRef.current = false
    if (!armed) setHoldMs(0)
  }

  useEffect(() => {
    return () => {
      if (holdTimer.current) clearInterval(holdTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!lockedUntil) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [lockedUntil])

  function beginHold() {
    if (armed || locked || holdTimer.current) return
    heldRef.current = true
    setHoldMs(0)
    const started = Date.now()
    holdTimer.current = setInterval(() => {
      if (!heldRef.current) return
      const elapsed = Date.now() - started
      setHoldMs(elapsed)
      if (elapsed >= KIOSK_EXIT_HOLD_MS) {
        if (holdTimer.current) clearInterval(holdTimer.current)
        holdTimer.current = null
        setHoldMs(KIOSK_EXIT_HOLD_MS)
        setArmed(true)
      }
    }, 50)
  }

  async function exit(event: FormEvent) {
    event.preventDefault()
    if (locked) return
    setError('')
    setExiting(true)
    try {
      const res = await fetch('/api/public/parking/kiosk/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      if (res.ok) {
        window.location.href = '/'
        return
      }
      const nextAttempts = attempts + 1
      setAttempts(nextAttempts)
      setCode('')
      if (nextAttempts >= KIOSK_EXIT_MAX_ATTEMPTS) {
        setLockedUntil(Date.now() + KIOSK_EXIT_LOCKOUT_MS)
        setError('TOO MANY ATTEMPTS — WAIT A MINUTE')
      } else {
        setError('WRONG KIOSK CODE')
      }
    } catch {
      setError('COULD NOT CONNECT — TRY AGAIN')
    } finally {
      setExiting(false)
    }
  }

  if (!open) return null

  const holdProgress = Math.min(1, holdMs / KIOSK_EXIT_HOLD_MS)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-3 md:items-center">
      <div className="w-full max-w-lg space-y-5 border border-grey-mid bg-black p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-mono text-xl font-bold uppercase tracking-widest text-white">
              STAFF
            </h2>
            <p className="font-mono text-xs uppercase text-grey-light">
              PLEASE SPEAK WITH A STAFF MEMBER TO PAY OR EXTEND.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 border border-grey-mid px-3 py-2 font-mono text-xs uppercase tracking-wider text-white"
          >
            BACK
          </button>
        </div>

        {plate && (
          <div className="border border-grey-mid p-4">
            <p className="font-mono text-3xl tracking-[0.3em] text-white">{plate}</p>
            {endTime && (
              <p className="mt-1 font-mono text-sm uppercase text-grey-light">
                FREE UNTIL <span className="text-white">{endTime}</span>
              </p>
            )}
          </div>
        )}

        {qrDataUrl && (
          <div className="flex items-center gap-4 border border-grey-mid p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="Scan to open this parking session" className="h-28 w-28" />
            <div className="space-y-2">
              <p className="font-mono text-xs uppercase text-grey-light">
                SCAN OR OPEN THE SESSION TO PAY / EXTEND
              </p>
              {linkUrl && (
                <a
                  href={linkUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block border border-grey-mid px-3 py-2 font-mono text-xs uppercase text-white"
                >
                  OPEN SCAN2PAY ↗
                </a>
              )}
            </div>
          </div>
        )}

        <div className="border-t border-grey-mid pt-4 space-y-3">
          <p className="font-mono text-2xs uppercase tracking-widest text-grey-light">
            MANAGER ONLY
          </p>

          {!armed ? (
            <button
              type="button"
              onPointerDown={beginHold}
              onPointerUp={stopHold}
              onPointerLeave={stopHold}
              onPointerCancel={stopHold}
              disabled={locked}
              className="relative w-full overflow-hidden border border-danger/60 py-4 font-mono text-sm font-bold uppercase tracking-widest text-danger disabled:opacity-40"
            >
              <span
                className="absolute inset-y-0 left-0 bg-danger/25"
                style={{ width: `${holdProgress * 100}%` }}
                aria-hidden
              />
              <span className="relative">
                {locked ? `LOCKED — ${Math.ceil((lockedUntil - now) / 1000)}S` : 'HOLD 5 SECONDS TO EXIT'}
              </span>
            </button>
          ) : !requireCode ? (
            <div className="space-y-3">
              <p className="font-mono text-xs uppercase text-grey-light">
                THE KIOSK CODE IS OFF. THIS CLOSES KIOSK MODE.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setArmed(false)
                    setHoldMs(0)
                  }}
                  className="border border-grey-mid py-3 font-mono text-xs uppercase tracking-wider text-white"
                >
                  CANCEL
                </button>
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = '/'
                  }}
                  className="border border-danger bg-danger/10 py-3 font-mono text-xs font-bold uppercase tracking-wider text-danger"
                >
                  EXIT KIOSK
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={exit} className="space-y-3">
              <p className="font-mono text-xs uppercase text-grey-light">
                ENTER THE KIOSK CODE TO LEAVE KIOSK MODE.
              </p>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="KIOSK CODE"
                disabled={locked}
                className="w-full border border-grey-mid bg-black px-3 py-3 text-center font-mono text-xl uppercase tracking-[0.3em] text-white outline-none focus:border-white disabled:opacity-40"
              />
              {error && <p className="font-mono text-xs text-danger">{error}</p>}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setArmed(false)
                    setHoldMs(0)
                    setCode('')
                    setError('')
                  }}
                  className="border border-grey-mid py-3 font-mono text-xs uppercase tracking-wider text-white"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={exiting || locked || code.trim().length < 6}
                  className="border border-danger bg-danger/10 py-3 font-mono text-xs font-bold uppercase tracking-wider text-danger disabled:opacity-40"
                >
                  {exiting ? 'CHECKING…' : 'EXIT KIOSK'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
