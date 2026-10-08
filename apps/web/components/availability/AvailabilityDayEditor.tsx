'use client'

// The shared day editor for availability — used by the worker calendar and the
// admin availability page (with `canOverride`). Handles the 15-minute window
// list, the auto-complement, time-off requests, weekly series and the
// JUST THIS / FROM / ALL scope choice for series days.

import { useState } from 'react'
import { Select } from '@/components/ui/Select'
import { AvailabilityBar } from '@/components/availability/AvailabilityBar'
import { formatDateLong } from '@/lib/date-nav'
import {
  addWindow,
  describeSeriesEnd,
  minutesOfTime,
  presetWindow,
  quarterHourEndOptions,
  quarterHourOptions,
  removeWindow,
  seriesEndDateKey,
  statusMeta,
  weeksForSeries,
  windowsArePartition,
  type AvailabilityEntry,
  type AvailabilityPreset,
  type AvailabilityScope,
  type AvailabilitySeries,
  type AvailabilityType,
  type AvailabilityWindow,
  type Repeat,
} from '@/lib/availability'

export interface EditorDraft {
  isAllDay: boolean
  type: AvailabilityType
  windows: AvailabilityWindow[]
  timeOff: boolean
  notes: string | null
}

export interface EditorSaveOptions {
  repeat: Repeat | null
  scope: AvailabilityScope | null
  reason: string | null
}

/** A high-contrast themed checkbox — the dark-mode `accent-white` input the
 *  old editor used was easy to miss when ticked. */
export function ToggleCheck({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-start gap-2 w-full text-left"
    >
      <span
        className={`mt-0.5 w-4 h-4 shrink-0 border flex items-center justify-center transition-colors ${
          checked ? 'border-white bg-white' : 'border-grey-light bg-transparent'
        }`}
      >
        {checked && <span className="w-2 h-2 bg-black" />}
      </span>
      <span className="min-w-0">
        <span className="font-mono text-xs uppercase text-grey-light">{label}</span>
        {hint && <span className="block font-mono text-2xs uppercase text-grey-mid mt-0.5">{hint}</span>}
      </span>
    </button>
  )
}

const startOptions = quarterHourOptions().map((t) => ({ value: t, label: t }))
const endOptions = quarterHourEndOptions().map((t) => ({ value: t, label: t }))

export function AvailabilityDayEditor({
  dateKey,
  entry,
  series,
  presets,
  canOverride = false,
  busy = false,
  error,
  onSave,
  onClear,
  onClose,
}: {
  dateKey: string
  entry: AvailabilityEntry | null
  series: AvailabilitySeries | null
  presets: AvailabilityPreset[]
  canOverride?: boolean
  busy?: boolean
  error?: string | null
  onSave: (draft: EditorDraft, options: EditorSaveOptions) => void
  onClear: (options: { scope: AvailabilityScope | null; reason: string | null }) => void
  onClose: () => void
}) {
  const [isAllDay, setIsAllDay] = useState(entry ? entry.isAllDay : true)
  const [type, setType] = useState<AvailabilityType>(
    entry && entry.type === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'AVAILABLE',
  )
  const [windows, setWindows] = useState<AvailabilityWindow[]>(entry && !entry.isAllDay ? entry.windows : [])
  const [timeOff, setTimeOff] = useState(entry?.timeOff ?? false)
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [reason, setReason] = useState('')
  const [repeatOn, setRepeatOn] = useState(false)
  const [noEnd, setNoEnd] = useState(() => (series ? !series.endDate : false))
  const [weeks, setWeeks] = useState(() =>
    series && series.endDate ? weeksForSeries(series.startDate, series.endDate) : 2,
  )
  const [changeSeriesEnd, setChangeSeriesEnd] = useState(false)
  const [scope, setScope] = useState<AvailabilityScope>('THIS')

  const partition = windowsArePartition(windows)
  const locked = !!entry && entry.status === 'APPROVED' && !canOverride
    && (entry.timeOff || entry.type === 'UNAVAILABLE')
  const status = entry ? statusMeta(entry.status) : null

  function applyWindows(next: AvailabilityWindow[]) {
    setWindows(next)
  }

  function addPreset(preset: AvailabilityPreset) {
    setWindows((prev) => addWindow(prev, presetWindow(preset)))
  }

  function setWindowAt(index: number, next: AvailabilityWindow) {
    if (minutesOfTime(next.endTime) <= minutesOfTime(next.startTime)) return
    setWindows((prev) => addWindow(removeWindow(prev, index), next))
  }

  function toggleWindowType(index: number) {
    const w = windows[index]
    if (!w) return
    setWindowAt(index, { ...w, type: w.type === 'AVAILABLE' ? 'UNAVAILABLE' : 'AVAILABLE' })
  }

  function currentRepeat(): Repeat | null {
    if (series) {
      if (!changeSeriesEnd) return null
      if (noEnd) return { noEnd: true }
      return { weeks }
    }
    if (!repeatOn) return null
    return noEnd ? { noEnd: true } : { weeks }
  }

  function save() {
    const draft: EditorDraft = {
      isAllDay,
      type,
      windows: isAllDay ? [] : windows,
      timeOff,
      notes: notes.trim() || null,
    }
    onSave(draft, {
      repeat: currentRepeat(),
      scope: series ? scope : null,
      reason: reason.trim() || null,
    })
  }

  return (
    <div className="space-y-4">
      <div className="font-mono text-xs uppercase text-white tracking-wider">{formatDateLong(dateKey)}</div>

      {/* Status banners */}
      {entry && status && (
        <div className="flex flex-wrap items-center gap-2">
          <span className={`font-mono text-2xs uppercase px-1.5 py-0.5 border ${status.badge}`}>{status.label}</span>
          {entry.timeOff && (
            <span className="font-mono text-2xs uppercase px-1.5 py-0.5 border border-warning text-warning">TIME OFF REQUEST</span>
          )}
          {series && (
            <span className="font-mono text-2xs uppercase px-1.5 py-0.5 border border-accent text-accent">WEEKLY SERIES</span>
          )}
          {!entry.isAllDay && (
            <span className="font-mono text-2xs uppercase text-grey-light">{entry.windows.length} WINDOWS</span>
          )}
        </div>
      )}
      {entry?.reviewNote && (
        <p className="font-mono text-2xs uppercase text-grey-light border-l border-grey-mid pl-2">MANAGER: {entry.reviewNote}</p>
      )}
      {locked && (
        <p className="font-mono text-2xs uppercase text-warning border border-warning/50 bg-warning/10 px-2 py-1.5">
          CONFIRMED BY A MANAGER — CHANGES HERE ARE SENT AS AN EDIT REQUEST
        </p>
      )}

      {/* All-day */}
      <div className="border border-grey-mid p-3 space-y-3">
        <ToggleCheck
          checked={isAllDay}
          onChange={(v) => setIsAllDay(v)}
          label="ALL DAY"
          hint={isAllDay ? 'THE WHOLE DAY TAKES THE STATE BELOW' : 'SET 15-MINUTE WINDOWS BELOW'}
        />

        {isAllDay && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setType('AVAILABLE')}
              className={`h-11 border font-mono text-xs uppercase tracking-wider transition-colors ${
                type === 'AVAILABLE' ? 'bg-success text-black border-success' : 'border-grey-mid text-grey-light hover:border-success hover:text-success'
              }`}
            >
              AVAILABLE
            </button>
            <button
              type="button"
              onClick={() => setType('UNAVAILABLE')}
              className={`h-11 border font-mono text-xs uppercase tracking-wider transition-colors ${
                type === 'UNAVAILABLE' ? 'bg-danger text-black border-danger' : 'border-grey-mid text-grey-light hover:border-danger hover:text-danger'
              }`}
            >
              UNAVAILABLE
            </button>
          </div>
        )}
      </div>

      {/* Windows */}
      {!isAllDay && (
        <div className="border border-grey-mid p-3 space-y-3">
          <div className="label">QUICK PICK</div>
          <div className="grid grid-cols-3 gap-2">
            {presets.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => addPreset(p)}
                className="h-10 border border-grey-mid font-mono text-2xs uppercase text-grey-light hover:border-success hover:text-success transition-colors"
              >
                {p.label}
                <span className="block font-mono text-2xs text-grey-mid">{p.startTime}–{p.endTime}</span>
              </button>
            ))}
          </div>

          <AvailabilityBar windows={windows} isAllDay={false} type="AVAILABLE" />

          <div className="space-y-2">
            {windows.length === 0 && (
              <p className="font-mono text-2xs uppercase text-grey-light">TAP A QUICK PICK OR ADD A WINDOW.</p>
            )}
            {windows.map((w, i) => (
              <div key={`${w.startTime}-${w.endTime}-${i}`} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleWindowType(i)}
                  className={`w-20 h-9 shrink-0 border font-mono text-2xs uppercase transition-colors ${
                    w.type === 'AVAILABLE' ? 'border-success text-success' : 'border-danger text-danger'
                  }`}
                >
                  {w.type === 'AVAILABLE' ? 'AVAIL' : 'UNAVAIL'}
                </button>
                <div className="flex-1"><Select value={w.startTime} onChange={(e) => setWindowAt(i, { ...w, startTime: e.target.value })} options={startOptions} /></div>
                <span className="font-mono text-xs text-grey-light">–</span>
                <div className="flex-1"><Select value={w.endTime} onChange={(e) => setWindowAt(i, { ...w, endTime: e.target.value })} options={endOptions} /></div>
                {!partition && (
                  <button
                    type="button"
                    onClick={() => applyWindows(removeWindow(windows, i))}
                    className="w-8 h-9 shrink-0 border border-grey-mid font-mono text-xs text-grey-light hover:border-danger hover:text-danger transition-colors"
                    aria-label="Remove window"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setWindows(addWindow(windows, { type: 'AVAILABLE', startTime: '09:00', endTime: '17:00' }))}
              className="font-mono text-2xs uppercase text-grey-light hover:text-white transition-colors"
            >
              + ADD WINDOW
            </button>
            {partition && (
              <p className="font-mono text-2xs uppercase text-grey-mid text-right">
                {windows.length} WINDOWS · REST IS UNAVAILABLE
              </p>
            )}
          </div>
        </div>
      )}

      {/* Time off request */}
      <div className="border border-grey-mid p-3">
        <ToggleCheck
          checked={timeOff}
          onChange={setTimeOff}
          label="TIME OFF REQUEST"
          hint="LABELS THIS AS LEAVE — YOUR MANAGER CHECKS IT FOR LEAVE PAY"
        />
      </div>

      {/* Note */}
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="NOTE (OPTIONAL)"
        className="field w-full"
      />

      {/* Repeat */}
      <div className="border border-grey-mid p-3 space-y-3">
        {series ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-2xs uppercase text-grey-light">WEEKLY SERIES</span>
              <span className="font-mono text-2xs uppercase text-white">
                {series.endDate
                  ? `${describeSeriesEnd(series.endDate)} · ${weeksForSeries(series.startDate, series.endDate)} WEEKS`
                  : 'NO END DATE'}
              </span>
            </div>
            <ToggleCheck
              checked={changeSeriesEnd}
              onChange={(v) => {
                setChangeSeriesEnd(v)
                if (v && series.endDate) setWeeks(weeksForSeries(scope === 'FROM' ? dateKey : series.startDate, series.endDate))
              }}
              label="CHANGE SERIES END"
            />
            {changeSeriesEnd && (
              <div className="space-y-2">
                <ToggleCheck checked={noEnd} onChange={setNoEnd} label="NO END DATE" hint="REPEATS WEEKLY FOREVER (MATERIALISED 2 YEARS AHEAD)" />
                {!noEnd && (
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-2xs uppercase text-grey-light">{scope === 'FROM' ? 'FOR' : 'TOTAL'}</span>
                    <button type="button" onClick={() => setWeeks((n) => Math.max(1, n - 1))} className="w-9 h-9 border border-grey-mid font-mono text-sm text-white hover:border-white">−</button>
                    <span className="font-mono text-sm text-white w-16 text-center">{weeks} WEEK{weeks === 1 ? '' : 'S'}</span>
                    <button type="button" onClick={() => setWeeks((n) => Math.min(260, n + 1))} className="w-9 h-9 border border-grey-mid font-mono text-sm text-white hover:border-white">+</button>
                  </div>
                )}
                <p className="font-mono text-2xs uppercase text-grey-mid">APPLIES WHEN YOU PICK FROM / ALL BELOW.</p>
              </div>
            )}
          </>
        ) : (
          <>
            <ToggleCheck checked={repeatOn} onChange={setRepeatOn} label="REPEAT WEEKLY" hint="EVERY SAME WEEKDAY, AS A SERIES" />
            {repeatOn && (
              <div className="space-y-2">
                <ToggleCheck checked={noEnd} onChange={setNoEnd} label="NO END DATE" />
                {!noEnd && (
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-2xs uppercase text-grey-light">FOR</span>
                    <button type="button" onClick={() => setWeeks((n) => Math.max(1, n - 1))} className="w-9 h-9 border border-grey-mid font-mono text-sm text-white hover:border-white">−</button>
                    <span className="font-mono text-sm text-white w-16 text-center">{weeks} WEEK{weeks === 1 ? '' : 'S'}</span>
                    <button type="button" onClick={() => setWeeks((n) => Math.min(260, n + 1))} className="w-9 h-9 border border-grey-mid font-mono text-sm text-white hover:border-white">+</button>
                    <span className="font-mono text-2xs uppercase text-grey-light">
                      {describeSeriesEnd(seriesEndDateKey(dateKey, weeks))}
                    </span>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Series scope */}
      {series && (
        <div className="border border-grey-mid p-3 space-y-2">
          <div className="label">THIS CHANGE APPLIES TO</div>
          <div className="grid grid-cols-3 gap-2">
            {([
              ['THIS', 'JUST THIS DAY'],
              ['FROM', 'FROM THIS DAY ONWARDS'],
              ['ALL', 'ALL IN THE SERIES'],
            ] as [AvailabilityScope, string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setScope(key)
                  if (changeSeriesEnd && series.endDate) {
                    setWeeks(weeksForSeries(key === 'FROM' ? dateKey : series.startDate, series.endDate))
                  }
                }}
                className={`h-12 border font-mono text-2xs uppercase leading-tight px-1 transition-colors ${
                  scope === key ? 'bg-white text-black border-white' : 'border-grey-mid text-grey-light hover:border-white hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Reason */}
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="NOTE FOR THE MANAGER (OPTIONAL)"
        className="field w-full"
      />

      {error && <p className="font-mono text-xs text-danger">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="flex-1 h-12 bg-white text-black font-mono font-bold text-sm uppercase tracking-widest hover:bg-accent transition-colors disabled:opacity-40"
        >
          {busy ? 'SAVING_' : locked ? 'SAVE (ASKS A MANAGER)' : 'SAVE'}
        </button>
        {entry && (
          <button
            type="button"
            onClick={() => onClear({ scope: series ? scope : null, reason: reason.trim() || null })}
            disabled={busy}
            className="h-12 px-4 border border-danger text-danger font-mono font-bold text-sm uppercase hover:bg-danger hover:text-black transition-colors disabled:opacity-40"
          >
            CLEAR
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="h-12 px-4 border border-grey-mid text-grey-light font-mono text-sm uppercase hover:border-white hover:text-white transition-colors disabled:opacity-40"
        >
          CLOSE
        </button>
      </div>
    </div>
  )
}
