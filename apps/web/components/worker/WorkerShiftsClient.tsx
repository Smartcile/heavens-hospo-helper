'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/Modal'
import {
  firstOfMonthKey,
  formatDateLong,
  keyOfDay,
  mondayOf,
  MONTH_ABBR,
  monthGrid,
  parseDay,
  shiftDay,
  shiftMonth,
  weekKeys,
} from '@/lib/date-nav'

interface OpenShiftCard {
  id: string
  date: string
  startTime: string
  endTime: string
  breakMinutes: number
  note: string | null
  positionId: string | null
  positionName: string | null
  positionColour: string | null
  label: string | null
  eventId: string | null
  eventTitle: string | null
  eventLocation: string | null
  conflicts: boolean
}

interface MyClaim {
  id: string
  openShiftId: string
  status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'WITHDRAWN'
  note: string | null
  reviewNote: string | null
  shiftId: string | null
  createdAt: string
  date: string
  startTime: string
  endTime: string
  positionName: string | null
  label: string | null
  openShiftStatus: 'OPEN' | 'FILLED' | 'CANCELLED'
}

interface ShiftsData {
  today: string
  shifts: OpenShiftCard[]
  myClaims: MyClaim[]
}

const WEEKDAY_HEADS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

function roleName(s: { positionName: string | null; label: string | null }): string {
  return s.positionName ?? s.label ?? 'SHIFT'
}

export function WorkerShiftsClient() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')
  const [view, setView] = useState<'month' | 'week'>('month')
  const [data, setData] = useState<ShiftsData | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [claimNote, setClaimNote] = useState('')

  const [month, setMonth] = useState(() => {
    const d = parseDay(keyOfDay(new Date()))
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
  })
  const [weekStart, setWeekStart] = useState(() => mondayOf(keyOfDay(new Date())))

  const monthKey = `${month.year}-${String(month.month).padStart(2, '0')}`
  const today = data?.today ?? keyOfDay(new Date())

  const range = useMemo(() => {
    if (view === 'week') return { start: weekStart, end: shiftDay(weekStart, 6) }
    const lastDay = new Date(Date.UTC(month.year, month.month, 0)).getUTCDate()
    return {
      start: firstOfMonthKey(`${monthKey}-01`),
      end: `${monthKey}-${String(lastDay).padStart(2, '0')}`,
    }
  }, [view, weekStart, monthKey, month.year, month.month])

  async function load() {
    const r = await fetch(`/api/worker/shifts?start=${range.start}&end=${range.end}`)
    if (r.status === 401) { router.push('/w/login'); return }
    const d = await r.json()
    setData(d)
    setLoading(false)
  }

  useEffect(() => { load() }, [range.start, range.end]) // eslint-disable-line react-hooks/exhaustive-deps

  const shiftsByDay = useMemo(() => {
    const map = new Map<string, OpenShiftCard[]>()
    for (const s of data?.shifts ?? []) {
      const list = map.get(s.date) ?? []
      list.push(s)
      map.set(s.date, list)
    }
    return map
  }, [data])

  const claimByShift = useMemo(() => {
    const map = new Map<string, MyClaim>()
    for (const c of data?.myClaims ?? []) {
      if (c.status === 'PENDING' || c.status === 'APPROVED') map.set(c.openShiftId, c)
    }
    return map
  }, [data])

  const pendingClaims = useMemo(
    () => (data?.myClaims ?? []).filter((c) => c.status === 'PENDING'),
    [data],
  )

  const cells = useMemo(() => monthGrid(month.year, month.month), [month])
  const weekDays = useMemo(() => (view === 'week' ? weekKeys(weekStart) : []), [view, weekStart])

  async function claim(shiftId: string) {
    setBusy(true); setError('')
    const r = await fetch(`/api/worker/shifts/${shiftId}/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: claimNote || null }),
    })
    setBusy(false)
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setError((d.error ?? 'COULD NOT CLAIM THE SHIFT').toUpperCase())
      return
    }
    setSelected(null)
    setClaimNote('')
    setFlash('CLAIM SENT — A MANAGER WILL CONFIRM')
    load()
  }

  async function withdraw(claimId: string) {
    setBusy(true); setError('')
    const r = await fetch(`/api/worker/shifts/claims/${claimId}`, { method: 'DELETE' })
    setBusy(false)
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setError((d.error ?? 'COULD NOT WITHDRAW THE CLAIM').toUpperCase())
      return
    }
    setFlash('CLAIM WITHDRAWN')
    load()
  }

  function renderShiftCard(s: OpenShiftCard, inSheet = false) {
    const myClaim = claimByShift.get(s.id)
    const claimNow = () => {
      if (inSheet) { void claim(s.id); return }
      setClaimNote('')
      setSelected(s.date)
      setError('')
    }
    return (
      <div key={s.id} className="border border-grey-mid bg-black p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-mono text-sm font-bold text-white">
              {s.startTime}–{s.endTime} · {roleName(s)}
            </div>
            {s.eventTitle && (
              <div className="font-mono text-2xs uppercase text-accent mt-0.5">
                {s.eventTitle}
                {s.eventLocation ? ` · ${s.eventLocation}` : ''}
              </div>
            )}
            <div className="font-mono text-2xs uppercase text-grey-light mt-0.5">
              {formatDateLong(s.date)}
              {s.breakMinutes ? ` · ${s.breakMinutes}M BREAK` : ''}
              {s.note ? ` · ${s.note}` : ''}
            </div>
            {s.conflicts && (
              <div className="font-mono text-2xs uppercase text-warning mt-1">
                ⚠ YOU MARKED YOURSELF UNAVAILABLE AT THIS TIME — YOU CAN STILL ASK
              </div>
            )}
          </div>
          <div className="shrink-0">
            {myClaim?.status === 'APPROVED' ? (
              <span className="font-mono text-2xs uppercase border border-success text-success px-2 py-1">CONFIRMED</span>
            ) : myClaim?.status === 'PENDING' ? (
              <span className="font-mono text-2xs uppercase border border-warning text-warning px-2 py-1">WAITING</span>
            ) : (
              <button
                onClick={claimNow}
                disabled={busy}
                className="h-9 px-3 bg-white text-black font-mono text-xs font-bold uppercase border border-white hover:bg-accent transition-colors disabled:opacity-40"
              >
                CLAIM
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (loading || !data) {
    return <div className="min-h-screen bg-black flex items-center justify-center"><p className="font-mono text-sm text-grey-light loading-cursor">LOADING</p></div>
  }

  const selectedShifts = selected ? shiftsByDay.get(selected) ?? [] : []
  const totalOpen = data.shifts.length

  return (
    <div className="min-h-screen bg-black pb-10">
      <div className="px-4 pt-6 pb-4 border-b border-grey-mid">
        <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">AVAILABLE SHIFTS</h1>
        <p className="font-mono text-xs text-grey-light mt-1 uppercase">
          {totalOpen > 0
            ? `${totalOpen} SHIFT${totalOpen !== 1 ? 'S' : ''} YOU CAN PICK UP — TAP A DAY`
            : 'NO SHIFTS FOR YOUR ROLES RIGHT NOW'}
        </p>
      </div>

      {/* View toggle + navigation */}
      <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-grey-mid">
        <div className="flex border border-grey-mid">
          {(['month', 'week'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`h-9 px-3 font-mono text-xs uppercase tracking-wider transition-colors ${
                view === v ? 'bg-white text-black' : 'text-grey-light hover:text-white'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        {view === 'month' ? (
          <div className="flex items-center gap-2">
            <button onClick={() => setMonth(shiftMonth(month.year, month.month, -1))} className="font-mono text-xs text-grey-light border border-grey-mid px-3 py-1.5 hover:border-white hover:text-white">&lt;</button>
            <span className="font-mono text-sm text-white tracking-widest uppercase">{MONTH_ABBR[month.month - 1]} {month.year}</span>
            <button onClick={() => setMonth(shiftMonth(month.year, month.month, 1))} className="font-mono text-xs text-grey-light border border-grey-mid px-3 py-1.5 hover:border-white hover:text-white">&gt;</button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button onClick={() => setWeekStart(shiftDay(weekStart, -7))} className="font-mono text-xs text-grey-light border border-grey-mid px-3 py-1.5 hover:border-white hover:text-white">&lt;&lt;</button>
            <button onClick={() => setWeekStart(mondayOf(today))} className="font-mono text-xs text-grey-light border border-grey-mid px-3 py-1.5 hover:border-white hover:text-white">TODAY</button>
            <button onClick={() => setWeekStart(shiftDay(weekStart, 7))} className="font-mono text-xs text-grey-light border border-grey-mid px-3 py-1.5 hover:border-white hover:text-white">&gt;&gt;</button>
          </div>
        )}
      </div>

      {flash && (
        <p className="mx-4 mt-3 font-mono text-xs uppercase text-success border border-success/50 bg-success/10 px-3 py-2">{flash}</p>
      )}
      {error && (
        <p className="mx-4 mt-3 font-mono text-xs uppercase text-danger border border-danger/50 bg-danger/10 px-3 py-2">{error}</p>
      )}

      {/* My pending claims */}
      {pendingClaims.length > 0 && (
        <div className="mx-4 mt-3 border border-warning/50 bg-warning/5 p-3 space-y-2">
          <h2 className="font-mono text-xs uppercase tracking-wider text-warning">WAITING FOR A MANAGER</h2>
          {pendingClaims.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 border border-grey-mid bg-black p-2">
              <div>
                <div className="font-mono text-xs text-white uppercase">{formatDateLong(c.date)} · {c.startTime}–{c.endTime}</div>
                <div className="font-mono text-2xs uppercase text-grey-light">{roleName(c)}</div>
              </div>
              <button
                type="button"
                onClick={() => withdraw(c.id)}
                disabled={busy}
                className="h-9 px-3 border border-danger text-danger font-mono text-xs uppercase hover:bg-danger hover:text-black transition-colors disabled:opacity-40"
              >
                WITHDRAW
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Confirmed claims */}
      {(data.myClaims.some((c) => c.status === 'APPROVED')) && (
        <div className="mx-4 mt-3 border border-success/50 bg-success/5 p-3 space-y-2">
          <h2 className="font-mono text-xs uppercase tracking-wider text-success">CONFIRMED FOR YOU</h2>
          {data.myClaims.filter((c) => c.status === 'APPROVED').map((c) => (
            <div key={c.id} className="font-mono text-xs text-white uppercase border border-grey-mid bg-black p-2">
              {formatDateLong(c.date)} · {c.startTime}–{c.endTime} · {roleName(c)}
              <span className="text-grey-light"> — ON YOUR SCHEDULE ONCE THE WEEK IS PUBLISHED</span>
            </div>
          ))}
        </div>
      )}

      {/* Month grid */}
      {view === 'month' && (
        <div className="p-4">
          <div className="grid grid-cols-7 gap-px bg-grey-mid border border-grey-mid">
            {WEEKDAY_HEADS.map((w) => (
              <div key={w} className="bg-black py-1.5 text-center font-mono text-2xs uppercase text-grey-light tracking-wider">{w}</div>
            ))}
            {cells.map((c, i) => {
              if (!c.inMonth || !c.key) return <div key={`blank-${i}`} className="bg-black min-h-[64px]" />
              const shifts = shiftsByDay.get(c.key) ?? []
              const isToday = c.key === today
              return (
                <button
                  key={c.key}
                  onClick={() => { if (shifts.length > 0) { setSelected(c.key); setClaimNote(''); setError('') } }}
                  disabled={shifts.length === 0}
                  className={`bg-black min-h-[64px] flex flex-col items-start pt-1.5 px-1 gap-0.5 transition-colors ${
                    shifts.length > 0 ? 'hover:ring-1 hover:ring-inset hover:ring-white' : 'opacity-50'
                  }`}
                >
                  <span className={`font-mono text-2xs ${isToday ? 'text-accent font-bold' : 'text-white'}`}>{c.day}</span>
                  {shifts.length > 0 && (
                    <>
                      <span className="font-mono text-2xs font-bold text-accent border border-accent px-1">{shifts.length}</span>
                      <span className="font-mono text-2xs text-grey-light leading-tight truncate w-full text-left">
                        {roleName(shifts[0])}
                        {shifts.length > 1 ? ` +${shifts.length - 1}` : ''}
                      </span>
                    </>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Week view */}
      {view === 'week' && (
        <div className="p-4 space-y-2">
          {weekDays.map((d, di) => {
            const shifts = shiftsByDay.get(d) ?? []
            const dObj = parseDay(d)
            const isToday = d === today
            return (
              <div key={d} className="border border-grey-mid p-3 space-y-2">
                <div className={`font-mono text-xs uppercase ${isToday ? 'text-accent font-bold' : 'text-white'}`}>
                  {WEEKDAY_HEADS[di]} {dObj.getUTCDate()} {MONTH_ABBR[dObj.getUTCMonth()]}
                  {shifts.length > 0 ? <span className="text-grey-light"> · {shifts.length} SHIFT{shifts.length !== 1 ? 'S' : ''}</span> : null}
                </div>
                {shifts.length === 0 ? (
                  <div className="font-mono text-2xs uppercase text-grey-light">NOTHING TO PICK UP</div>
                ) : (
                  shifts.map((s) => renderShiftCard(s))
                )}
              </div>
            )
          })}
        </div>
      )}

      <p className="px-4 font-mono text-2xs uppercase text-grey-light">
        YOU ONLY SEE SHIFTS FOR YOUR ROLES. A MANAGER CONFIRMS EVERY CLAIM — CHECK “MY SCHEDULE” ONCE CONFIRMED.
      </p>

      {/* Day sheet */}
      <Modal
        isOpen={!!selected}
        onClose={() => { if (!busy) { setSelected(null); setError('') } }}
        title={selected ? `SHIFTS — ${formatDateLong(selected)}` : 'SHIFTS'}
        size="lg"
      >
        {selected && (
          <div className="space-y-3">
            {selectedShifts.map((s) => renderShiftCard(s, true))}
            <div>
              <label className="font-mono text-xs uppercase text-grey-light block mb-1">Note for the manager (optional)</label>
              <textarea
                value={claimNote}
                onChange={(e) => setClaimNote(e.target.value)}
                rows={2}
                className="w-full bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white placeholder:text-grey-light"
                placeholder="ANYTHING THEY SHOULD KNOW"
              />
            </div>
            <p className="font-mono text-2xs uppercase text-grey-light">
              THE NOTE IS ATTACHED TO EVERY CLAIM YOU SEND FROM HERE.
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}
