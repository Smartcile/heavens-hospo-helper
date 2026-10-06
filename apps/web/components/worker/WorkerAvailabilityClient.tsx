'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TimeInput } from '@/components/ui/TimeInput'
import {
  allowedTypes,
  availabilityMeta,
  availabilityState,
  availabilityTimeLabel,
  isCasual,
  isDateLocked,
  repeatWeekly,
  type AvailabilityEntry,
  type AvailabilityType,
} from '@/lib/availability'
import {
  formatDateLong,
  firstOfMonthKey,
  keyOfDay,
  MONTH_ABBR,
  monthGrid,
  parseDay,
  shiftMonth,
} from '@/lib/date-nav'

const WEEKDAY_HEADS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
const REPEAT_OPTIONS = [
  { value: 1, label: 'JUST THIS DAY' },
  { value: 2, label: 'REPEAT WEEKLY ×2' },
  { value: 3, label: 'REPEAT WEEKLY ×3' },
  { value: 4, label: 'REPEAT WEEKLY ×4' },
  { value: 6, label: 'REPEAT WEEKLY ×6' },
  { value: 8, label: 'REPEAT WEEKLY ×8' },
]

export function WorkerAvailabilityClient() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [employmentType, setEmploymentType] = useState<string | null>(null)
  const [lockDays, setLockDays] = useState(0)
  const [today, setToday] = useState(() => keyOfDay(new Date()))
  const [entries, setEntries] = useState<AvailabilityEntry[]>([])

  const todayDate = parseDay(today)
  const [month, setMonth] = useState({ year: todayDate.getUTCFullYear(), month: todayDate.getUTCMonth() + 1 })
  const [selected, setSelected] = useState<string | null>(null)

  // Editor state for the selected day.
  const [type, setType] = useState<AvailabilityType>('UNAVAILABLE')
  const [isAllDay, setIsAllDay] = useState(true)
  const [startTime, setStartTime] = useState('17:00')
  const [endTime, setEndTime] = useState('22:00')
  const [notes, setNotes] = useState('')
  const [occurrences, setOccurrences] = useState(1)

  const casual = isCasual(employmentType)
  const monthKey = `${month.year}-${String(month.month).padStart(2, '0')}`
  const cells = useMemo(() => monthGrid(month.year, month.month), [month])
  const entryByDate = useMemo(() => {
    const map = new Map<string, AvailabilityEntry>()
    for (const e of entries) map.set(e.date, e)
    return map
  }, [entries])

  async function load() {
    const start = firstOfMonthKey(`${monthKey}-01`)
    const lastDay = new Date(Date.UTC(month.year, month.month, 0)).getUTCDate()
    const end = `${monthKey}-${String(lastDay).padStart(2, '0')}`
    const r = await fetch(`/api/worker/availability?start=${start}&end=${end}`)
    if (r.status === 401) { router.push('/w/login'); return }
    const data = await r.json()
    setEmploymentType(data.employmentType ?? null)
    setLockDays(data.lockDays ?? 0)
    setToday(data.today ?? keyOfDay(new Date()))
    setEntries(data.entries ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [monthKey]) // eslint-disable-line react-hooks/exhaustive-deps

  function pick(dateKey: string) {
    if (isDateLocked(dateKey, lockDays, today)) return
    setSelected(dateKey)
    setError('')
    const existing = entryByDate.get(dateKey)
    setType(existing?.type ?? (casual ? 'PREFERRED' : 'UNAVAILABLE'))
    setIsAllDay(existing?.isAllDay ?? true)
    setStartTime(existing?.startTime ?? '17:00')
    setEndTime(existing?.endTime ?? '22:00')
    setNotes(existing?.notes ?? '')
    setOccurrences(1)
  }

  async function save() {
    if (!selected) return
    setSaving(true); setError('')
    const r = await fetch('/api/worker/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dates: repeatWeekly(selected, occurrences),
        type,
        isAllDay,
        startTime: isAllDay ? null : startTime,
        endTime: isAllDay ? null : endTime,
        notes: notes || null,
      }),
    })
    setSaving(false)
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'SAVE FAILED'); return }
    setSelected(null)
    load()
  }

  async function clearDay() {
    const existing = selected ? entryByDate.get(selected) : undefined
    if (!existing) { setSelected(null); return }
    setSaving(true); setError('')
    const r = await fetch(`/api/worker/availability/${existing.id}`, { method: 'DELETE' })
    setSaving(false)
    if (!r.ok) { setError('CLEAR FAILED'); return }
    setSelected(null)
    load()
  }

  if (loading) {
    return <div className="min-h-screen bg-black flex items-center justify-center"><p className="font-mono text-sm text-grey-light loading-cursor">LOADING</p></div>
  }

  const selectedMeta = selected ? availabilityMeta(availabilityState(entryByDate.get(selected)), employmentType) : null
  const selectedHasEntry = selected ? !!entryByDate.get(selected) : false

  return (
    <div className="min-h-screen bg-black pb-10">
      <div className="px-4 pt-6 pb-4 border-b border-grey-mid">
        <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">MY AVAILABILITY</h1>
        <p className="font-mono text-xs text-grey-light mt-1 uppercase">
          {casual ? 'TAP THE DAYS YOU CAN WORK' : 'TAP THE DAYS YOU CANNOT WORK'}
        </p>
        {lockDays > 0 && (
          <p className="font-mono text-xs text-warning mt-1 uppercase">
            ▒ DAYS WITHIN {lockDays} DAYS CANNOT BE CHANGED
          </p>
        )}
      </div>

      {/* Month navigation */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-grey-mid">
        <button onClick={() => setMonth(shiftMonth(month.year, month.month, -1))} className="font-mono text-xs uppercase text-grey-light border border-grey-mid px-3 py-1.5 hover:border-white hover:text-white">&lt;</button>
        <span className="font-mono text-sm text-white tracking-widest uppercase">{MONTH_ABBR[month.month - 1]} {month.year}</span>
        <button onClick={() => setMonth(shiftMonth(month.year, month.month, 1))} className="font-mono text-xs uppercase text-grey-light border border-grey-mid px-3 py-1.5 hover:border-white hover:text-white">&gt;</button>
      </div>

      {/* Grid */}
      <div className="p-4">
        <div className="grid grid-cols-7 gap-px bg-grey-mid border border-grey-mid">
          {WEEKDAY_HEADS.map((w) => (
            <div key={w} className="bg-black py-1.5 text-center font-mono text-xs uppercase text-grey-light tracking-wider">{w}</div>
          ))}
          {cells.map((c, i) => {
            if (!c.inMonth || !c.key) return <div key={`blank-${i}`} className="bg-black min-h-[52px]" />
            const entry = entryByDate.get(c.key)
            const meta = availabilityMeta(availabilityState(entry), employmentType)
            const locked = isDateLocked(c.key, lockDays, today)
            const isToday = c.key === today
            const isSelected = c.key === selected
            return (
              <button
                key={c.key}
                onClick={() => pick(c.key)}
                disabled={locked}
                className={`bg-black min-h-[52px] flex flex-col items-center justify-start pt-1.5 px-0.5 transition-colors ${locked ? 'opacity-40 cursor-not-allowed' : 'hover:border-white'} ${meta.tint} ${isSelected ? 'ring-1 ring-inset ring-white' : ''}`}
              >
                <span className={`font-mono text-xs ${isToday ? 'text-accent font-bold' : 'text-white'}`}>{c.day}</span>
                {!locked && (
                  <span className={`mt-1 w-2 h-2 ${meta.dot}`} />
                )}
                {!entry?.isAllDay && entry?.startTime && entry?.endTime && (
                  <span className="font-mono text-xs text-grey-light leading-none mt-0.5">{entry.startTime.slice(0, 5)}–{entry.endTime.slice(0, 5)}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 mt-3">
          {casual && (
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-success" /><span className="font-mono text-xs uppercase text-grey-light">Preferred</span></span>
          )}
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-danger" /><span className="font-mono text-xs uppercase text-grey-light">Unavailable</span></span>
          <span className="flex items-center gap-1.5"><span className={`w-2 h-2 ${casual ? 'bg-warning' : 'bg-grey-mid'}`} /><span className="font-mono text-xs uppercase text-grey-light">{casual ? 'Unset' : 'Available'}</span></span>
        </div>
      </div>

      {/* Editor */}
      {selected ? (
        <div className="mx-4 border border-grey-mid bg-grey-dark p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-mono text-xs uppercase text-white tracking-wider">{formatDateLong(selected)}</div>
            <button onClick={() => setSelected(null)} className="font-mono text-xs uppercase text-grey-light hover:text-white">CLOSE</button>
          </div>

          <div className={`grid ${casual ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
            {allowedTypes(employmentType).includes('PREFERRED') && (
              <button onClick={() => setType('PREFERRED')}
                className={`h-11 border font-mono text-xs uppercase tracking-wider transition-colors ${type === 'PREFERRED' ? 'bg-success text-black border-success' : 'border-grey-mid text-grey-light hover:border-success hover:text-success'}`}>
                PREFERRED
              </button>
            )}
            <button onClick={() => setType('UNAVAILABLE')}
              className={`h-11 border font-mono text-xs uppercase tracking-wider transition-colors ${type === 'UNAVAILABLE' ? 'bg-danger text-black border-danger' : 'border-grey-mid text-grey-light hover:border-danger hover:text-danger'}`}>
              UNAVAILABLE
            </button>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isAllDay} onChange={(e) => setIsAllDay(e.target.checked)} className="accent-white" />
            <span className="font-mono text-xs uppercase text-grey-light">All day</span>
          </label>

          {!isAllDay && (
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="label">From</label>
                <TimeInput value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="label">To</label>
                <TimeInput value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
          )}

          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="NOTE (OPTIONAL)" className="field" />

          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs uppercase text-grey-light">
              Repeat — every {formatDateLong(selected).split(',')[0]}
            </label>
            <select value={occurrences} onChange={(e) => setOccurrences(Number(e.target.value))}
              className="field">
              {REPEAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {error && <p className="font-mono text-xs text-danger">{error}</p>}

          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="flex-1 h-12 bg-white text-black font-mono font-bold text-sm uppercase tracking-widest hover:bg-accent transition-colors disabled:opacity-40">
              {saving ? 'SAVING_' : 'SAVE'}
            </button>
            {selectedHasEntry && (
              <button onClick={clearDay} disabled={saving} className="h-12 px-4 border border-danger text-danger font-mono font-bold text-sm uppercase hover:bg-danger hover:text-black transition-colors disabled:opacity-40">
                CLEAR
              </button>
            )}
          </div>
          {selectedMeta && selectedHasEntry && (
            <p className="font-mono text-xs text-grey-light uppercase">CURRENT: <span className={selectedMeta.badge.split(' ')[1]}>{selectedMeta.label}</span></p>
          )}
        </div>
      ) : (
        <p className="mx-4 font-mono text-xs text-grey-light">SELECT A DAY TO SET YOUR AVAILABILITY.</p>
      )}
    </div>
  )
}
