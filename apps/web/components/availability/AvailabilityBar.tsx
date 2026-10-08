'use client'

// A compact 24-hour track showing a day's availability windows — green for
// AVAILABLE, red for UNAVAILABLE. Reused by the editor, the week view and the
// admin grid.

import { minutesOfTime, type AvailabilityType, type AvailabilityWindow } from '@/lib/availability'

export function AvailabilityBar({
  windows,
  isAllDay,
  type,
  height = 'h-3',
}: {
  windows: AvailabilityWindow[]
  isAllDay: boolean
  type: AvailabilityType
  height?: string
}) {
  const segments: AvailabilityWindow[] = isAllDay
    ? [{ type: type === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'AVAILABLE', startTime: '00:00', endTime: '24:00' }]
    : windows
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
