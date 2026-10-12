import { describe, it, expect } from 'vitest'
import { validateManualEvent, isOverCapacity } from '@/lib/manual-event'

function ok(input: Parameters<typeof validateManualEvent>[0]) {
  const res = validateManualEvent(input)
  if (!res.ok) throw new Error(`expected ok, got ${res.error}`)
  return res.value
}

describe('validateManualEvent', () => {
  it('requires and uppercases the title', () => {
    expect(validateManualEvent({ title: '  ', date: '2026-10-12', startTime: '09:00' })).toEqual({
      ok: false,
      error: 'TITLE IS REQUIRED',
    })
    expect(ok({ title: ' board meeting ', date: '2026-10-12', startTime: '09:00' }).title).toBe('BOARD MEETING')
  })

  it('rejects a missing or malformed date', () => {
    expect(validateManualEvent({ title: 'X' })).toEqual({ ok: false, error: 'A VALID DATE IS REQUIRED' })
    expect(validateManualEvent({ title: 'X', date: '12/10/2026' })).toEqual({
      ok: false,
      error: 'A VALID DATE IS REQUIRED',
    })
  })

  it('builds a UTC wall-clock start and end', () => {
    const v = ok({ title: 'X', date: '2026-10-12', startTime: '09:30', endTime: '13:00' })
    expect(v.startsAt.toISOString()).toBe('2026-10-12T09:30:00.000Z')
    expect(v.endsAt?.toISOString()).toBe('2026-10-12T13:00:00.000Z')
    expect(v.allDay).toBe(false)
  })

  it('rolls an overnight end to the next day', () => {
    const v = ok({ title: 'X', date: '2026-10-12', startTime: '22:00', endTime: '01:00' })
    expect(v.endsAt?.toISOString()).toBe('2026-10-13T01:00:00.000Z')
  })

  it('all-day events start at midnight with no end', () => {
    const v = ok({ title: 'X', date: '2026-10-12', allDay: true, startTime: 'ignored' })
    expect(v.startsAt.toISOString()).toBe('2026-10-12T00:00:00.000Z')
    expect(v.endsAt).toBeNull()
  })

  it('rejects bad times', () => {
    expect(validateManualEvent({ title: 'X', date: '2026-10-12', startTime: '25:00' })).toEqual({
      ok: false,
      error: 'A VALID START TIME IS REQUIRED',
    })
    expect(validateManualEvent({ title: 'X', date: '2026-10-12', startTime: '09:00', endTime: '9am' })).toEqual({
      ok: false,
      error: 'A VALID END TIME IS REQUIRED',
    })
  })

  it('parses pax as a whole number or null', () => {
    expect(ok({ title: 'X', date: '2026-10-12', startTime: '09:00', pax: '' }).pax).toBeNull()
    expect(ok({ title: 'X', date: '2026-10-12', startTime: '09:00', pax: '24' }).pax).toBe(24)
    expect(validateManualEvent({ title: 'X', date: '2026-10-12', startTime: '09:00', pax: '-2' })).toEqual({
      ok: false,
      error: 'PAX MUST BE A WHOLE NUMBER',
    })
    expect(validateManualEvent({ title: 'X', date: '2026-10-12', startTime: '09:00', pax: '2.5' })).toEqual({
      ok: false,
      error: 'PAX MUST BE A WHOLE NUMBER',
    })
  })

  it('validates the PDF link scheme', () => {
    expect(validateManualEvent({ title: 'X', date: '2026-10-12', startTime: '09:00', pdfUrl: 'drive.google.com/x' })).toEqual({
      ok: false,
      error: 'PDF LINK MUST START WITH http:// OR https://',
    })
    expect(ok({ title: 'X', date: '2026-10-12', startTime: '09:00', pdfUrl: 'https://drive.google.com/x' }).pdfUrl).toBe(
      'https://drive.google.com/x',
    )
  })
})

describe('isOverCapacity', () => {
  it('warns only when pax exceeds a positive capacity', () => {
    expect(isOverCapacity(80, 50)).toBe(true)
    expect(isOverCapacity(50, 50)).toBe(false)
    expect(isOverCapacity(10, null)).toBe(false)
    expect(isOverCapacity(null, 50)).toBe(false)
    expect(isOverCapacity(10, 0)).toBe(false)
  })
})
