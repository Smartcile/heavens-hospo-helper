'use client'

// A compact 24-hour track showing a day's availability windows — green for
// AVAILABLE, red for UNAVAILABLE. Reused by the editor, the week view and the
// admin grid.
//
// `labelled` swaps the thin proportional track for readable full-width rows:
// one coloured row per window with the time printed inside it, so the splits
// can actually be read on a phone or in a narrow grid cell. `showType` adds
// the AVAILABLE / UNAVAILABLE word for wide contexts.
//
// `fill` makes the block stretch to its parent's height (each window row grows
// evenly), so grid rows can size to the tallest block and every block fills the
// row. `series` draws the weekly-series ⟳ in the block's bottom-right corner.

import { describeSeriesEnd, minutesOfTime, type AvailabilityType, type AvailabilityWindow } from '@/lib/availability'

export function AvailabilityBar({
  windows,
  isAllDay,
  type,
  height = 'h-3',
  labelled = false,
  showType = false,
  fill = false,
  series = null,
}: {
  windows: AvailabilityWindow[]
  isAllDay: boolean
  type: AvailabilityType
  height?: string
  labelled?: boolean
  showType?: boolean
  /** Stretch the labelled rows to the parent's full height. */
  fill?: boolean
  /** The day belongs to a weekly series — draws ⟳ in the block corner. */
  series?: { endDate: string | null } | null
}) {
  const segments: AvailabilityWindow[] = isAllDay
    ? [{ type: type === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'AVAILABLE', startTime: '00:00', endTime: '24:00' }]
    : windows

  if (labelled) {
    if (segments.length === 0) {
      return <div className="font-mono text-2xs uppercase text-grey-mid">NOT SET</div>
    }
    return (
      <div className={`relative w-full flex flex-col gap-px ${fill ? 'flex-1 min-h-0 h-full' : ''}`}>
        {segments.map((w, i) => (
          <div
            key={i}
            title={`${w.startTime}–${w.endTime} ${w.type}`}
            className={`w-full flex items-center gap-2 px-1.5 py-0.5 font-mono text-2xs uppercase leading-tight overflow-hidden ${
              w.type === 'AVAILABLE' ? 'bg-success text-black' : 'bg-danger text-black'
            } ${fill ? 'flex-1 min-h-[1.375rem]' : ''}`}
          >
            <span className="whitespace-nowrap">{w.startTime}–{w.endTime}</span>
            {showType && <span className="ml-auto whitespace-nowrap">{w.type}</span>}
          </div>
        ))}
        {series && (
          <span
            className="pointer-events-none absolute bottom-0.5 right-1 font-mono text-2xs leading-none text-black/70"
            title={series.endDate ? describeSeriesEnd(series.endDate) : 'WEEKLY SERIES — NO END DATE'}
          >
            ⟳
          </span>
        )}
      </div>
    )
  }

  return (
    <div className={`relative w-full ${height} bg-grey-dark border border-grey-mid overflow-hidden`}>
      {segments.map((w, i) => (
        <div
          key={i}
          className={`absolute inset-y-0 ${w.type === 'AVAILABLE' ? 'bg-success' : 'bg-danger'}`}
          style={{
            left: `${(minutesOfTime(w.startTime) / 1440) * 100}%`,
            width: `${((minutesOfTime(w.endTime) - minutesOfTime(w.startTime)) / 1440) * 100}%`,
          }}
        />
      ))}
    </div>
  )
}
