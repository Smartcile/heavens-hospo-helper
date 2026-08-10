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

const NAV_LINK = 'font-mono text-[10px] uppercase tracking-wider text-grey-light hover:text-white'

interface DateNavProps {
  date: string
  /** The last applied range (parent-owned so the selection survives re-renders). */
  range?: DateRange
  onChange: (date: string, range: DateRange) => void
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

  function emit(key: string, range: DateRange) {
    onChange(key, range)
  }

  function openPopover() {
    setAnchor(monthOf(date))
    if (range && range.start !== range.end) {
      setMode('CUSTOM')
      setStart(range.start)
      setEnd(range.end)
    } else {
      setMode('DAY')
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
    const base = 'w-7 h-7 flex items-center justify-center font-mono text-[10px]'
    if (!inMonth) return `${base} text-transparent`
    if (key === start || key === end) return `${base} bg-[#60A5FA] text-black font-bold`
    if (start && end && key > start && key < end) return `${base} bg-[#60A5FA]/25 text-white`
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
        <button className={NAV_LINK} onClick={() => emit(shiftDay(date, -7), { start: shiftDay(date, -7), end: shiftDay(date, -7) })}>
          &lt;&lt; WEEK
        </button>
        <button className={NAV_LINK} onClick={() => emit(shiftDay(date, -1), { start: shiftDay(date, -1), end: shiftDay(date, -1) })}>
          &lt; DAY
        </button>
        <button className={`${NAV_LINK} text-white`} onClick={openPopover}>
          SELECT
        </button>
        <button className={NAV_LINK} onClick={() => emit(shiftDay(date, 1), { start: shiftDay(date, 1), end: shiftDay(date, 1) })}>
          DAY &gt;
        </button>
        <button className={NAV_LINK} onClick={() => emit(shiftDay(date, 7), { start: shiftDay(date, 7), end: shiftDay(date, 7) })}>
          WEEK &gt;&gt;
        </button>
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
                        <div key={w} className="w-7 text-center font-mono text-[9px] text-grey-light">
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
                <div className="mb-1 font-mono text-[10px] uppercase text-grey-light">SELECT</div>
                <div className="flex border border-grey-mid">
                  {MODES.map((m) => (
                    <button
                      key={m}
                      onClick={() => switchMode(m)}
                      className={`flex-1 px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider ${
                        mode === m ? 'bg-white text-black' : 'text-grey-light hover:text-white'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1 font-mono text-[10px] uppercase text-grey-light">START DATE</div>
                <div className="border border-grey-mid bg-grey-dark/40 px-2 py-1.5 font-mono text-xs text-white">
                  {start ? formatDateShort(start) : '—'}
                </div>
              </div>
              <div>
                <div className="mb-1 font-mono text-[10px] uppercase text-grey-light">END DATE</div>
                <div className="border border-grey-mid bg-grey-dark/40 px-2 py-1.5 font-mono text-xs text-white">
                  {end ? formatDateShort(end) : '—'}
                </div>
              </div>
              <div>
                <div className="mb-1 font-mono text-[10px] uppercase text-grey-light">TIME</div>
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
              className="border border-[#60A5FA] bg-[#60A5FA] px-4 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-black hover:bg-[#93C5FD]"
            >
              APPLY
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
