'use client'

// A compact 24-hour track showing a day's availability windows — green for
// AVAILABLE, red for UNAVAILABLE. Reused by the editor, the week view and the
// admin grid.
//
// `labelled` swaps the thin proportional track for readable full-width rows:
// one coloured row per window with the time printed inside it, so the splits
// can actually be read on a phone or in a narrow grid cell. `showType` adds
// the AVAILABLE / UNAVAILABLE word for wide contexts.

import { minutesOfTime, type AvailabilityType, type AvailabilityWindow } from '@/lib/availability'

export function AvailabilityBar({
  windows,
  isAllDay,
  type,
  height = 'h-3',
  labelled = false,
  showType = false,
}: {
  windows: AvailabilityWindow[]
  isAllDay: boolean
  type: AvailabilityType
  height?: string
  labelled?: boolean
  showType?: boolean
}) {
  const segments: AvailabilityWindow[] = isAllDay
    ? [{ type: type === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'AVAILABLE', startTime: '00:00', endTime: '24:00' }]
    : windows

  if (labelled) {
    if (segments.length === 0) {
      return <div className="font-mono text-2xs uppercase text-grey-mid">NOT SET</div>
    }
    return (
      <div className="w-full space-y-px">
        {segments.map((w, i) => (
          <div
            key={i}
            title={`${w.startTime}–${w.endTime} ${w.type}`}
            className={`w-full flex items-center gap-2 px-1.5 py-0.5 font-mono text-2xs uppercase leading-tight overflow-hidden ${
              w.type === 'AVAILABLE' ? 'bg-success text-black' : 'bg-danger text-black'
            }`}
          >
            <span className="whitespace-nowrap">{w.startTime}–{w.endTime}</span>
            {showType && <span className="ml-auto whitespace-nowrap">{w.type}</span>}
          </div>
        ))}
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
