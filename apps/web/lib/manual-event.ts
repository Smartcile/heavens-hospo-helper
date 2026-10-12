// Manual calendar events — pure validation + mapping shared by the event form
// modal and the /api/admin/calendar-events routes. Times are venue-local
// "HH:mm" strings; Dates are built as UTC wall-clock, the same convention
// imported iCal events and the roster grid use.

import { isValidTime } from '@/lib/calendar'

export interface ManualEventInput {
  title?: string | null
  description?: string | null
  areaId?: string | null
  date?: string | null
  startTime?: string | null
  endTime?: string | null
  allDay?: boolean | null
  pax?: number | string | null
  pdfUrl?: string | null
}

export interface ManualEventFields {
  title: string
  description: string | null
  areaId: string | null
  startsAt: Date
  endsAt: Date | null
  allDay: boolean
  pax: number | null
  pdfUrl: string | null
}

export type ManualEventResult =
  | { ok: true; value: ManualEventFields }
  | { ok: false; error: string }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function trim(v: string | null | undefined): string {
  return (v ?? '').trim()
}

export function validateManualEvent(input: ManualEventInput): ManualEventResult {
  const title = trim(input.title).toUpperCase()
  if (!title) return { ok: false, error: 'TITLE IS REQUIRED' }

  const date = trim(input.date)
  if (!DATE_RE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    return { ok: false, error: 'A VALID DATE IS REQUIRED' }
  }

  const allDay = !!input.allDay
  let startsAt = new Date(`${date}T00:00:00Z`)
  let endsAt: Date | null = null

  if (!allDay) {
    const startTime = trim(input.startTime)
    if (!isValidTime(startTime)) return { ok: false, error: 'A VALID START TIME IS REQUIRED' }
    startsAt = new Date(`${date}T${startTime}:00Z`)

    const endTime = trim(input.endTime)
    if (endTime) {
      if (!isValidTime(endTime)) return { ok: false, error: 'A VALID END TIME IS REQUIRED' }
      endsAt = new Date(`${date}T${endTime}:00Z`)
      // Overnight event: an end at or before the start rolls to the next day.
      if (endsAt.getTime() <= startsAt.getTime()) endsAt = new Date(endsAt.getTime() + 86_400_000)
    }
  }

  let pax: number | null = null
  const rawPax = input.pax === null || input.pax === undefined ? '' : String(input.pax).trim()
  if (rawPax !== '') {
    const n = Number(rawPax)
    if (!Number.isInteger(n) || n < 0) return { ok: false, error: 'PAX MUST BE A WHOLE NUMBER' }
    pax = n
  }

  const pdfUrl = trim(input.pdfUrl) || null
  if (pdfUrl && !/^https?:\/\//i.test(pdfUrl)) {
    return { ok: false, error: 'PDF LINK MUST START WITH http:// OR https://' }
  }

  return {
    ok: true,
    value: {
      title,
      description: trim(input.description) || null,
      areaId: trim(input.areaId) || null,
      startsAt,
      endsAt,
      allDay,
      pax,
      pdfUrl,
    },
  }
}

/** Soft capacity check for the event form — warns, never blocks. */
export function isOverCapacity(
  pax: number | null | undefined,
  capacity: number | null | undefined,
): boolean {
  return typeof pax === 'number' && typeof capacity === 'number' && capacity > 0 && pax > capacity
}
