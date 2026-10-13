'use client'

import { useEffect, useRef, useState } from 'react'
import {
  DEFAULT_BUSINESS_HOURS,
  MONTH_ABBR,
  endOfMonthKey,
  firstOfMonthKey,
  formatDateLong,
  formatDateRange,
  formatDateShort,
  mondayOf,
  monthGrid,
  parseDay,
  shiftDay,
  shiftMonth,
  type DateRange,
} from '@/lib/date-nav'

type DateMode = 'DAY' | 'WEEK' | 'MONTH' | 'CUSTOM'

const MODES: DateMode[] = ['DAY', 'WEEK', 'MONTH', 'CUSTOM']
const WEEKDAY_ABBR = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']

const NAV_LINK = 'font-mono text-2xs uppercase tracking-wider text-grey-light hover:text-white'

interface DateNavProps {
  date: string
  /** The last applied range (parent-owned so the selection survives re-renders). */
  range?: DateRange
  onChange: (date: string, range: DateRange) => void
}

/** The quick-nav granularity: what the current selection is. */
function activeModeOf(range: DateRange | undefined): DateMode {
  if (!range || range.start === range.end) return 'DAY'
  if (range.start === mondayOf(range.start) && range.end === shiftDay(range.start, 6)) return 'WEEK'
  if (range.start === firstOfMonthKey(range.start) && range.end === endOfMonthKey(range.start)) return 'MONTH'
  return 'CUSTOM'
}

export function DateNav({ date, range, onChange }: DateNavProps) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ year: number; month: number }>(monthOf(date))
  const [mode, setMode] = useState<DateMode>('DAY')
  const [start, setStart] = useState<string | null>(date)
  const [end, setEnd] = useState<string | null>(date)
  const rootRef = useRef<HTMLDivElement>(null)

  function monthOf(key: string): { year: number; month: number } {
    const d = parseDay(key)
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
  }

  function emitDay(key: string) {
    onChange(key, { start: key, end: key })
  }

  function emitWeek(key: string) {
    const monday = mondayOf(key)
    onChange(monday, { start: monday, end: shiftDay(monday, 6) })
  }

  function emitMonth(key: string) {
    const start = firstOfMonthKey(key)
    onChange(start, { start, end: endOfMonthKey(start) })
  }

  function shiftMonths(key: string, delta: number): string {
    const d = parseDay(key)
    const t = shiftMonth(d.getUTCFullYear(), d.getUTCMonth() + 1, delta)
    const last = new Date(Date.UTC(t.year, t.month, 0)).getUTCDate()
    const day = Math.min(d.getUTCDate(), last)
    return `${t.year}-${String(t.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  const activeMode = activeModeOf(range)
  const navUnits = activeMode === 'WEEK'
    ? { outer: 'MONTH' as const, inner: 'WEEK' as const }
    : activeMode === 'MONTH'
      ? { outer: null, inner: 'MONTH' as const }
      : { outer: 'WEEK' as const, inner: 'DAY' as const }

  function goInner(dir: -1 | 1) {
    if (navUnits.inner === 'WEEK') return emitWeek(shiftDay(date, dir * 7))
    if (navUnits.inner === 'MONTH') return emitMonth(shiftMonths(date, dir))
    emitDay(shiftDay(date, dir))
  }

  function goOuter(dir: -1 | 1) {
    if (navUnits.outer === 'MONTH') return emitMonth(shiftMonths(date, dir))
    if (navUnits.outer === 'WEEK') return emitWeek(shiftDay(date, dir * 7))
  }

  function openPopover() {
    setAnchor(monthOf(date))
    const current = activeModeOf(range)
    setMode(current)
    if (current === 'CUSTOM' && range) {
      setStart(range.start)
      setEnd(range.end)
    } else if (current === 'WEEK') {
      const monday = mondayOf(date)
      setStart(monday)
      setEnd(shiftDay(monday, 6))
    } else if (current === 'MONTH') {
      setStart(firstOfMonthKey(date))
      setEnd(endOfMonthKey(date))
    } else {
      setStart(date)
      setEnd(date)
    }
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    function onPointer(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onPointer)
    }
  }, [open])

  function switchMode(m: DateMode) {
    setMode(m)
    // Auto-highlight the range the current date sits in — no click needed.
    setAnchor(monthOf(date))
    if (m === 'CUSTOM') {
      setStart(null)
      setEnd(null)
    } else if (m === 'WEEK') {
      const monday = mondayOf(date)
      setStart(monday)
      setEnd(shiftDay(monday, 6))
    } else if (m === 'MONTH') {
      setStart(firstOfMonthKey(date))
      setEnd(endOfMonthKey(date))
    } else {
      setStart(date)
      setEnd(date)
    }
  }

  function pick(key: string) {
    if (mode === 'WEEK') {
      const monday = mondayOf(key)
      setStart(monday)
      setEnd(shiftDay(monday, 6))
    } else if (mode === 'MONTH') {
      setStart(firstOfMonthKey(key))
      setEnd(endOfMonthKey(key))
    } else if (mode === 'CUSTOM') {
      if (!start || (start && end)) {
        setStart(key)
        setEnd(null)
      } else {
        let s = start
        let e = key
        if (e < s) {
          s = key
          e = start
        }
        setStart(s)
        setEnd(e)
      }
    } else {
      setStart(key)
      setEnd(key)
    }
  }

  function apply() {
    const s = start ?? date
    const e = end ?? s
    onChange(s, { start: s, end: e })
    setOpen(false)
  }

  const months = [
    anchor,
    shiftMonth(anchor.year, anchor.month, 1),
    shiftMonth(anchor.year, anchor.month, 2),
  ]

  function cellClass(key: string, inMonth: boolean): string {
    const base = 'w-7 h-7 flex items-center justify-center font-mono text-2xs'
    if (!inMonth) return `${base} text-transparent`
    if (key === start || key === end) return `${base} bg-info text-black font-bold`
    if (start && end && key > start && key < end) return `${base} bg-info/25 text-white`
    return `${base} text-grey-light hover:text-white`
  }

  return (
    <div className="relative inline-block" ref={rootRef}>
      <button onClick={openPopover} className="block w-full text-right" title="SELECT DATE">
        <span className="font-mono text-xl font-bold uppercase tracking-wide text-white">
          {range && range.start !== range.end ? formatDateRange(range) : formatDateLong(date)}
        </span>
      </button>
      <div className="mt-1 flex items-center gap-4 justify-end">
        {navUnits.outer && (
          <button className={NAV_LINK} onClick={() => goOuter(-1)}>
            &lt;&lt; {navUnits.outer}
          </button>
        )}
        <button className={NAV_LINK} onClick={() => goInner(-1)}>
          &lt; {navUnits.inner}
        </button>
        <button className={`${NAV_LINK} text-white`} onClick={openPopover}>
          SELECT
        </button>
        <button className={NAV_LINK} onClick={() => goInner(1)}>
          {navUnits.inner} &gt;
        </button>
        {navUnits.outer && (
          <button className={NAV_LINK} onClick={() => goOuter(1)}>
            {navUnits.outer} &gt;&gt;
          </button>
        )}
      </div>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[1040px] max-w-[95vw] overflow-auto border border-grey-mid bg-black p-4">
          <div className="flex gap-5">
            {/* Left: three months side by side */}
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-center">
                <button
                  onClick={() => setAnchor(shiftMonth(anchor.year, anchor.month, -3))}
                  className="px-1 font-mono text-lg text-grey-light hover:text-white"
                >
                  ‹
                </button>
                <div className="flex flex-1 justify-around font-mono text-xs uppercase text-white">
                  {months.map((m) => (
                    <span key={`${m.year}-${m.month}`}>
                      {MONTH_ABBR[m.month - 1]} {m.year}
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => setAnchor(shiftMonth(anchor.year, anchor.month, 3))}
                  className="px-1 font-mono text-lg text-grey-light hover:text-white"
                >
                  ›
                </button>
              </div>
              <div className="flex gap-5">
                {months.map((m) => (
                  <div key={`${m.year}-${m.month}`} className="shrink-0">
                    <div className="mb-1 grid grid-cols-7">
                      {WEEKDAY_ABBR.map((w) => (
                        <div key={w} className="w-7 text-center font-mono text-2xs text-grey-light">
                          {w}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-y-0.5">
                      {monthGrid(m.year, m.month).map((c, i) =>
                        c.inMonth ? (
                          <button
                            key={c.key}
                            onClick={() => pick(c.key)}
                            className={cellClass(c.key, true)}
                          >
                            {c.day}
                          </button>
                        ) : (
                          <div key={i} className="w-7 h-7" />
                        ),
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: mode + selection display */}
            <div className="w-72 shrink-0 space-y-4 border-l border-grey-mid pl-5">
              <div>
                <div className="mb-1 font-mono text-2xs uppercase text-grey-light">SELECT</div>
                <div className="flex border border-grey-mid">
                  {MODES.map((m) => (
                    <button
                      key={m}
                      onClick={() => switchMode(m)}
                      className={`flex-1 px-2 py-1.5 font-mono text-2xs uppercase tracking-wider ${
                        mode === m ? 'bg-white text-black' : 'text-grey-light hover:text-white'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1 font-mono text-2xs uppercase text-grey-light">START DATE</div>
                <div className="border border-grey-mid bg-grey-dark/40 px-2 py-1.5 font-mono text-xs text-white">
                  {start ? formatDateShort(start) : '—'}
                </div>
              </div>
              <div>
                <div className="mb-1 font-mono text-2xs uppercase text-grey-light">END DATE</div>
                <div className="border border-grey-mid bg-grey-dark/40 px-2 py-1.5 font-mono text-xs text-white">
                  {end ? formatDateShort(end) : '—'}
                </div>
              </div>
              <div>
                <div className="mb-1 font-mono text-2xs uppercase text-grey-light">TIME</div>
                <div className="flex gap-2">
                  <div className="flex-1 border border-grey-mid bg-grey-dark/40 px-2 py-1.5 font-mono text-xs text-grey-light">
                    {DEFAULT_BUSINESS_HOURS.start}
                  </div>
                  <div className="flex-1 border border-grey-mid bg-grey-dark/40 px-2 py-1.5 font-mono text-xs text-grey-light">
                    {DEFAULT_BUSINESS_HOURS.end}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2 border-t border-grey-mid pt-3">
            <button
              onClick={() => setOpen(false)}
              className="border border-grey-mid px-4 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-grey-light hover:text-white"
            >
              CANCEL
            </button>
            <button
              onClick={apply}
              className="border border-info bg-info px-4 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-black hover:bg-info/80"
            >
              APPLY
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
