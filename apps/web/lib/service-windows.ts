// Service availability windows for a date — the union of every active
// service's slots (date exceptions applied), merged into contiguous labelled
// segments. Both the bookings time bar and the booking-create gate use this,
// so what the UI paints as AVAILABLE is exactly what the API enforces.

import { slotsForDate } from './service-schedule'

export interface ServiceWindowInput {
  name?: string
  slots: { dayOfWeek: number; startTime: string; endTime: string }[]
  exceptions: { date: string; closed: boolean; startTime: string | null; endTime: string | null }[]
  /** Step (minutes) between bookable start times — 15 when absent. */
  bookingIntervalMinutes?: number | null
  /** Explicit bookable starts ("HH:mm") — overrides the interval grid when set. */
  bookableTimes?: string[] | null
}

export interface ServiceWindow {
  startMins: number
  endMins: number
  names: string[]
}

export interface BookableSlot {
  startMins: number
  endMins: number // the window end — callers clamp to their booking duration
}

function toMins(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/**
 * Windows for `dateKey` from the given services (pass only active ones —
 * callers filter). A window that no service covers simply isn't there, so a
 * date outside every schedule yields an empty list (fully blocked).
 */
export function serviceWindowsForDate(services: ServiceWindowInput[], dateKey: string): ServiceWindow[] {
  const raw: { startMins: number; endMins: number; name: string }[] = []
  for (const svc of services) {
    // slotsForDate only reads times and closed flags — covers don't matter here.
    const resolved = slotsForDate(
      {
        slots: svc.slots.map((s) => ({ ...s, maxCovers: 10 })),
        exceptions: svc.exceptions.map((e) => ({ ...e, maxCovers: e.closed ? null : 10 })),
      },
      dateKey,
    )
    if (resolved.closed) continue
    for (const s of resolved.slots) {
      raw.push({ startMins: toMins(s.startTime), endMins: toMins(s.endTime), name: svc.name ?? '' })
    }
  }

  raw.sort((a, b) => a.startMins - b.startMins || a.endMins - b.endMins)

  const merged: ServiceWindow[] = []
  for (const r of raw) {
    const last = merged[merged.length - 1]
    if (last && r.startMins <= last.endMins) {
      last.endMins = Math.max(last.endMins, r.endMins)
      if (r.name && !last.names.includes(r.name)) last.names.push(r.name)
    } else {
      merged.push({ startMins: r.startMins, endMins: r.endMins, names: r.name ? [r.name] : [] })
    }
  }
  return merged
}

/** The whole booking window must sit inside a single service window. */
export function bookingFitsWindows(windows: ServiceWindow[], startMins: number, endMins: number): boolean {
  return windows.some((w) => startMins >= w.startMins && endMins <= w.endMins)
}

/**
 * The start times a service accepts bookings at on a date. The service window
 * is the full service length (walk-ins, last calls, customers gone, clock-out);
 * bookability is a subset: every `bookingIntervalMinutes` step within the
 * windows, or exactly `bookableTimes` when that list is set. Returns the slot
 * with its window end so callers can clamp the booking duration.
 */
export function bookableSlotsForService(svc: ServiceWindowInput, dateKey: string): BookableSlot[] {
  const windows = serviceWindowsForDate([svc], dateKey)
  if (windows.length === 0) return []

  const interval = svc.bookingIntervalMinutes && svc.bookingIntervalMinutes > 0 ? svc.bookingIntervalMinutes : 15
  const allowed = Array.isArray(svc.bookableTimes) && svc.bookableTimes.length > 0
    ? new Set(svc.bookableTimes.map((t) => toMins(t)))
    : null

  const out: BookableSlot[] = []
  for (const w of windows) {
    for (let m = w.startMins; m < w.endMins; m += interval) {
      if (allowed && !allowed.has(m)) continue
      out.push({ startMins: m, endMins: w.endMins })
    }
  }
  return out
}
