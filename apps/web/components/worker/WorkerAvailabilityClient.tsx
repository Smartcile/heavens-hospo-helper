'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/Modal'
import { AvailabilityBar } from '@/components/availability/AvailabilityBar'
import { AvailabilityDayEditor, type EditorDraft, type EditorSaveOptions } from '@/components/availability/AvailabilityDayEditor'
import {
  availabilityMeta,
  availabilityState,
  canWorkerEditDate,
  describeSeriesEnd,
  describeWindows,
  type AvailabilityEntry,
  type AvailabilityPreset,
  type AvailabilityScope,
  type AvailabilitySeries,
} from '@/lib/availability'
import {
  formatDateLong,
  firstOfMonthKey,
  keyOfDay,
  mondayOf,
  MONTH_ABBR,
  monthGrid,
  parseDay,
  shiftDay,
  shiftMonth,
  weekKeys,
} from '@/lib/date-nav'

const WEEKDAY_HEADS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
const WEEKDAY_SHORT = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

interface WorkerRequest {
  id: string
  date: string
  scope: AvailabilityScope
  action: 'SET' | 'CLEAR'
}

interface AvailabilityData {
  employmentType: string | null
  lockDays: number
  today: string
  presets: AvailabilityPreset[]
  entries: AvailabilityEntry[]
  series: AvailabilitySeries[]
  requests: WorkerRequest[]
}

export function WorkerAvailabilityClient() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')
  const [view, setView] = useState<'month' | 'week'>('month')
  const [data, setData] = useState<AvailabilityData | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

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
    const r = await fetch(`/api/worker/availability?start=${range.start}&end=${range.end}`)
    if (r.status === 401) { router.push('/w/login'); return }
    const d = await r.json()
    setData(d)
    setLoading(false)
  }

  useEffect(() => { load() }, [range.start, range.end]) // eslint-disable-line react-hooks/exhaustive-deps

  const entryByDate = useMemo(() => {
    const map = new Map<string, AvailabilityEntry>()
    for (const e of data?.entries ?? []) map.set(e.date, e)
    return map
  }, [data])

  const requestDates = useMemo(() => new Set((data?.requests ?? []).map((r) => r.date)), [data])
  const cells = useMemo(() => monthGrid(month.year, month.month), [month])
  const weekDays = useMemo(() => (view === 'week' ? weekKeys(weekStart) : []), [view, weekStart])

  function pick(dateKey: string) {
    const locked = !canWorkerEditDate(dateKey, data?.lockDays ?? 0, today)
    if (locked) {
      setFlash('THAT DAY IS IN THE PAST OR LOCKED — ASK A MANAGER')
      return
    }
    setSelected(dateKey)
    setError('')
    setFlash('')
  }

  function resultMessage(mode: string, skipped: number) {
    if (mode === 'REQUEST') return 'EDIT REQUEST SENT — YOUR MANAGER WILL CONFIRM'
    if (skipped > 0) return `SAVED · ${skipped} PROTECTED DAY${skipped === 1 ? '' : 'S'} LEFT UNCHANGED`
    return 'SAVED'
  }

  async function save(draft: EditorDraft, options: EditorSaveOptions) {
    if (!selected) return
    const entry = entryByDate.get(selected)
    setSaving(true); setError('')
    const r = await fetch('/api/worker/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: selected,
        availability: {
          isAllDay: draft.isAllDay,
          type: draft.type,
          windows: draft.windows,
          timeOff: draft.timeOff,
          notes: draft.notes,
        },
        repeat: options.repeat,
        scope: options.scope,
        seriesId: entry?.seriesId ?? null,
        reason: options.reason,
      }),
    })
    setSaving(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError((d.error ?? 'SAVE FAILED').toUpperCase()); return }
    const out = await r.json()
    setSelected(null)
    setFlash(resultMessage(out.mode, (out.skipped ?? []).length))
    load()
  }

  async function clear(options: { scope: AvailabilityScope | null; reason: string | null }) {
    if (!selected) return
    const entry = entryByDate.get(selected)
    setSaving(true); setError('')
    const r = await fetch('/api/worker/availability/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: selected,
        scope: options.scope,
        seriesId: entry?.seriesId ?? null,
        reason: options.reason,
      }),
    })
    setSaving(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError((d.error ?? 'CLEAR FAILED').toUpperCase()); return }
    const out = await r.json()
    setSelected(null)
    setFlash(resultMessage(out.mode, (out.skipped ?? []).length))
    load()
  }

  if (loading || !data) {
    return <div className="min-h-screen bg-black flex items-center justify-center"><p className="font-mono text-sm text-grey-light loading-cursor">LOADING</p></div>
  }

  const selectedEntry = selected ? entryByDate.get(selected) ?? null : null
  const selectedSeries = selectedEntry?.seriesId
    ? data.series.find((s) => s.id === selectedEntry.seriesId) ?? null
    : null
  const casual = (data.employmentType ?? '').toUpperCase() === 'CASUAL'

  return (
    <div className="min-h-screen bg-black pb-10">
      <div className="px-4 pt-6 pb-4 border-b border-grey-mid">
        <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">MY AVAILABILITY</h1>
        <p className="font-mono text-xs text-grey-light mt-1 uppercase">
          {casual ? 'TAP THE DAYS YOU CAN WORK' : 'TAP A DAY TO SET AVAILABLE / UNAVAILABLE TIMES'}
        </p>
        {data.lockDays > 0 && (
          <p className="font-mono text-xs text-warning mt-1 uppercase">
            ▒ DAYS WITHIN {data.lockDays} DAYS CANNOT BE CHANGED
          </p>
        )}
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

      {/* Month grid */}
      {view === 'month' && (
        <div className="p-4">
          <div className="grid grid-cols-7 gap-px bg-grey-mid border border-grey-mid">
            {WEEKDAY_HEADS.map((w) => (
              <div key={w} className="bg-black py-1.5 text-center font-mono text-2xs uppercase text-grey-light tracking-wider">{w}</div>
            ))}
            {cells.map((c, i) => {
              if (!c.inMonth || !c.key) return <div key={`blank-${i}`} className="bg-black min-h-[64px]" />
              const entry = entryByDate.get(c.key)
              const editable = canWorkerEditDate(c.key, data.lockDays, today)
              const meta = availabilityMeta(availabilityState(entry), data.employmentType)
              const isToday = c.key === today
              const requested = requestDates.has(c.key)
              return (
                <button
                  key={c.key}
                  onClick={() => pick(c.key)}
                  disabled={!editable}
                  className={`bg-black min-h-[64px] flex flex-col items-start pt-1.5 px-1 gap-0.5 transition-colors ${meta.tint} ${
                    editable ? 'hover:ring-1 hover:ring-inset hover:ring-white' : 'opacity-40 cursor-not-allowed'
                  }`}
                >
                  <span className={`font-mono text-2xs ${isToday ? 'text-accent font-bold' : 'text-white'}`}>{c.day}</span>
                  {entry ? (
                    <>
                      <span className={`w-2 h-2 ${meta.dot}`} />
                      <span className="font-mono text-2xs text-grey-light leading-tight">
                        {describeWindows(entry.windows, entry.isAllDay, entry.type)}
                      </span>
                      <span className="flex flex-wrap gap-0.5">
                        {entry.status === 'PENDING' && <span className="font-mono text-2xs text-warning leading-none">PENDING</span>}
                        {entry.status === 'DECLINED' && <span className="font-mono text-2xs text-danger leading-none">DECLINED</span>}
                        {entry.timeOff && <span className="font-mono text-2xs text-warning leading-none">TO</span>}
                        {entry.seriesId && <span className="font-mono text-2xs text-accent leading-none">⟳</span>}
                      </span>
                    </>
                  ) : (
                    <span className={`mt-1 w-2 h-2 ${meta.dot}`} />
                  )}
                  {requested && <span className="font-mono text-2xs text-accent leading-none">REQ</span>}
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
            const entry = entryByDate.get(d)
            const editable = canWorkerEditDate(d, data.lockDays, today)
            const meta = availabilityMeta(availabilityState(entry), data.employmentType)
            const isToday = d === today
            const requested = requestDates.has(d)
            const dObj = parseDay(d)
            return (
              <button
                key={d}
                onClick={() => pick(d)}
                disabled={!editable}
                className={`w-full text-left border border-grey-mid p-3 space-y-2 ${meta.tint} ${
                  editable ? 'hover:border-white' : 'opacity-40 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`font-mono text-xs uppercase ${isToday ? 'text-accent font-bold' : 'text-white'}`}>
                    {WEEKDAY_SHORT[di]} {dObj.getUTCDate()} {MONTH_ABBR[dObj.getUTCMonth()]}
                  </span>
                  <span className="flex items-center gap-1.5">
                    {requested && <span className="font-mono text-2xs uppercase text-accent">REQ</span>}
                    {entry?.timeOff && <span className="font-mono text-2xs uppercase text-warning">TIME OFF</span>}
                    {entry?.status === 'PENDING' && <span className="font-mono text-2xs uppercase text-warning">PENDING</span>}
                    {entry?.status === 'DECLINED' && <span className="font-mono text-2xs uppercase text-danger">DECLINED</span>}
                    <span className={`font-mono text-2xs uppercase ${meta.dot === 'bg-danger' ? 'text-danger' : meta.dot === 'bg-success' ? 'text-success' : 'text-grey-light'}`}>
                      {meta.label}
                    </span>
                  </span>
                </div>
                {entry && (
                  <AvailabilityBar
                    windows={entry.windows}
                    isAllDay={entry.isAllDay}
                    type={entry.type}
                    labelled
                    showType
                  />
                )}
                <div className="font-mono text-2xs text-grey-light uppercase">
                  {entry ? describeWindows(entry.windows, entry.isAllDay, entry.type) : 'NOT SET'}
                  {entry?.seriesId ? ` · ${entry.seriesEndDate ? describeSeriesEnd(entry.seriesEndDate) : 'WEEKLY · NO END DATE'}` : ''}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Legend */}
      <div className="px-4 pb-4 flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-success" /><span className="font-mono text-2xs uppercase text-grey-light">Available</span></span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-danger" /><span className="font-mono text-2xs uppercase text-grey-light">Unavailable</span></span>
        <span className="flex items-center gap-1.5"><span className={`w-2 h-2 ${casual ? 'bg-warning' : 'bg-grey-mid'}`} /><span className="font-mono text-2xs uppercase text-grey-light">{casual ? 'Unset' : 'Default'}</span></span>
        <span className="font-mono text-2xs uppercase text-warning">PENDING = WAITING FOR A MANAGER</span>
        <span className="font-mono text-2xs uppercase text-accent">⟳ = WEEKLY SERIES</span>
      </div>

      <p className="px-4 font-mono text-2xs uppercase text-grey-light">
        TIME OFF LIVES HERE: MARK THE DAYS UNAVAILABLE AND TICK “TIME OFF REQUEST”.
      </p>

      {/* Editor */}
      <Modal
        isOpen={!!selected}
        onClose={() => { if (!saving) { setSelected(null); setError('') } }}
        title={selected ? `AVAILABILITY — ${formatDateLong(selected)}` : 'AVAILABILITY'}
        size="lg"
      >
        {selected && (
          <AvailabilityDayEditor
            key={selected}
            dateKey={selected}
            entry={selectedEntry}
            series={selectedSeries}
            presets={data.presets}
            busy={saving}
            error={error || null}
            onSave={save}
            onClear={clear}
            onClose={() => { if (!saving) { setSelected(null); setError('') } }}
          />
        )}
      </Modal>
    </div>
  )
}
