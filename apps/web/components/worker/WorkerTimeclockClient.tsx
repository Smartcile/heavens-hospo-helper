'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { TimeClockStatus } from '@hospo-ops/types'

let inactivityTimer: ReturnType<typeof setTimeout> | null = null

export function WorkerTimeclockClient() {
  const router = useRouter()
  const [status, setStatus] = useState<TimeClockStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [clocking, setClocking] = useState(false)
  const [error, setError] = useState('')
  const [gpsDenied, setGpsDenied] = useState(false)

  const expiryMinutes = Number(process.env.NEXT_PUBLIC_WORKER_SESSION_EXPIRY_MINUTES ?? 15)

  function resetInactivity() {
    if (inactivityTimer) clearTimeout(inactivityTimer)
    inactivityTimer = setTimeout(async () => {
      await fetch('/api/worker/logout', { method: 'POST' })
      router.push('/w/login')
    }, expiryMinutes * 60 * 1000)
  }

  useEffect(() => {
    const events = ['click', 'touchstart', 'keydown']
    events.forEach((e) => document.addEventListener(e, resetInactivity, { passive: true }))
    resetInactivity()
    return () => {
      events.forEach((e) => document.removeEventListener(e, resetInactivity))
      if (inactivityTimer) clearTimeout(inactivityTimer)
    }
  }, [])

  async function load() {
    const r = await fetch('/api/worker/timeclock/status')
    if (r.status === 401) { router.push('/w/login'); return }
    const data = await r.json()
    setStatus(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function getPosition(): Promise<{ lat: number; lon: number } | null> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) { resolve(null); return }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => { setGpsDenied(true); resolve(null) },
        { timeout: 5000, enableHighAccuracy: false }
      )
    })
  }

  async function clockIn() {
    setClocking(true); setError('')
    const pos = await getPosition()
    const r = await fetch('/api/worker/timeclock/in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pos ? { lat: pos.lat, lon: pos.lon } : {}),
    })
    setClocking(false)
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'FAILED'); return }
    await load()
  }

  async function clockOut() {
    setClocking(true); setError('')
    const pos = await getPosition()
    const r = await fetch('/api/worker/timeclock/out', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pos ? { lat: pos.lat, lon: pos.lon } : {}),
    })
    setClocking(false)
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'FAILED'); return }
    await load()
  }

  async function takeBreak() {
    setClocking(true); setError('')
    const r = await fetch('/api/worker/timeclock/break', { method: 'POST' })
    setClocking(false)
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'FAILED'); return }
    await load()
  }

  async function backToWork() {
    setClocking(true); setError('')
    const r = await fetch('/api/worker/timeclock/break', { method: 'PATCH' })
    setClocking(false)
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'FAILED'); return }
    await load()
  }

  function formatDuration(minutes: number): string {
    const h = Math.floor(minutes / 60)
    const m = Math.floor(minutes % 60)
    if (h > 0) return `${h}H ${m}M`
    return `${m}M`
  }

  function getActiveDuration(): string {
    if (!status?.activeSession) return ''
    const start = new Date(status.activeSession.clockIn).getTime()
    const diff = (Date.now() - start) / 60000
    return formatDuration(diff)
  }

  function getBreakDuration(): string {
    if (!status?.activeBreak) return ''
    const start = new Date(status.activeBreak.startAt).getTime()
    return formatDuration((Date.now() - start) / 60000)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="font-mono text-sm text-grey-light loading-cursor">LOADING</p>
      </div>
    )
  }

  const isClockedIn = status?.isClockedIn ?? false

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <div className="px-4 pt-6 pb-4 border-b border-grey-mid">
        <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">TIME CLOCK</h1>
        <p className="font-mono text-xs text-grey-light mt-0.5 uppercase">
          {isClockedIn ? 'YOU ARE CLOCKED IN' : 'YOU ARE NOT CLOCKED IN'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">

        {/* Clock in/out button */}
        <div className="flex flex-col gap-3">
          {isClockedIn ? (
            <>
              <div className="border border-grey-mid p-4 bg-grey-dark">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`inline-block w-2 h-2 ${status?.activeBreak ? 'bg-warning' : 'bg-success'} animate-pulse`} />
                  <span className="font-mono text-xs uppercase text-grey-light tracking-wider">
                    {status?.activeBreak ? 'ON BREAK' : 'CLOCKED IN'}
                  </span>
                </div>
                <div className="font-mono text-2xl font-bold text-white">
                  {status?.activeBreak ? getBreakDuration() : getActiveDuration()}
                </div>
                <p className="font-mono text-xs text-grey-light mt-1">
                  {status?.activeBreak
                    ? `BREAK SINCE ${new Date(status.activeBreak.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : `SINCE ${status?.activeSession ? new Date(status.activeSession.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}`}
                </p>
                {status?.activeSession && !status.activeSession.geoValid && (
                  <p className="font-mono text-xs text-danger mt-1">OUTSIDE VENUE GEO-FENCE</p>
                )}
                {gpsDenied && (
                  <p className="font-mono text-xs text-grey-light mt-1">GPS NOT AVAILABLE — PUNCH LOGGED WITHOUT LOCATION</p>
                )}
              </div>
              {status?.activeBreak ? (
                <button
                  onClick={backToWork}
                  disabled={clocking}
                  className="w-full h-16 bg-success text-black font-mono font-bold text-lg uppercase tracking-widest hover:opacity-90 disabled:opacity-40"
                >
                  {clocking ? 'BACK IN_' : 'BACK TO WORK'}
                </button>
              ) : (
                <button
                  onClick={takeBreak}
                  disabled={clocking}
                  className="w-full h-16 bg-warning text-black font-mono font-bold text-lg uppercase tracking-widest hover:opacity-90 disabled:opacity-40"
                >
                  {clocking ? 'STARTING_' : 'TAKE BREAK'}
                </button>
              )}
              <button
                onClick={clockOut}
                disabled={clocking}
                className="w-full h-16 bg-danger text-black font-mono font-bold text-lg uppercase tracking-widest hover:opacity-90 disabled:opacity-40"
              >
                {clocking ? 'CLOCKING OUT_' : 'CLOCK OUT'}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={clockIn}
                disabled={clocking}
                className="w-full h-16 bg-success text-black font-mono font-bold text-lg uppercase tracking-widest hover:opacity-90 disabled:opacity-40"
              >
                {clocking ? 'CLOCKING IN_' : 'CLOCK IN'}
              </button>
              {gpsDenied && (
                <p className="font-mono text-xs text-grey-light">GPS NOT AVAILABLE — PUNCH LOGGED WITHOUT LOCATION</p>
              )}
            </>
          )}

          {error && (
            <div className="border-l-4 border-l-danger pl-3 py-1">
              <p className="font-mono text-xs text-danger">{error}</p>
            </div>
          )}
        </div>

        {/* Today minutes */}
        {status && (status.todayMinutes > 0) && (
          <div className="border border-grey-mid p-4 bg-grey-dark">
            <div className="font-mono text-xs uppercase text-grey-light tracking-wider mb-1">TODAY</div>
            <div className="font-mono text-sm text-white">{formatDuration(status.todayMinutes)} WORKED</div>
          </div>
        )}

        {/* Recent history */}
        {status && status.recentSessions.length > 0 && (
          <div className="space-y-2">
            <h2 className="font-mono text-xs uppercase text-grey-light tracking-wider">RECENT</h2>
            <div className="space-y-1">
              {status.recentSessions.map((s) => {
                const dur = s.clockOut
                  ? Math.round((new Date(s.clockOut).getTime() - new Date(s.clockIn).getTime()) / 60000)
                  : 0
                return (
                  <div key={s.id} className="bg-grey-dark border border-grey-mid p-3 flex items-center justify-between gap-2">
                    <div>
                      <div className="font-mono text-xs text-white">
                        {new Date(s.clockIn).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                      </div>
                      <div className="font-mono text-xs text-grey-light">
                        {new Date(s.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {s.clockOut ? ` — ${new Date(s.clockOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ' — ACTIVE'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {s.clockOut && <span className="font-mono text-xs text-white">{formatDuration(dur)}</span>}
                      {!s.geoValid && <span className="font-mono text-xs text-danger">OFFSITE</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
