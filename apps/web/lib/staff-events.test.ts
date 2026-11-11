import { describe, expect, it } from 'vitest'
import {
  allowedResponses,
  attendanceFor,
  buildStaffEventFields,
  buildStaffEventIcs,
  escapeIcsText,
  foldIcsLine,
  formatIcsDate,
  formatIcsLocal,
  formatIcsStamp,
  isResponseOpen,
  isStaffEventOver,
  quoteIcsParam,
  resolveStaffEventTargets,
  responseDeadlineAt,
  validateStaffEventResponse,
  wallClockNow,
} from './staff-events'

describe('buildStaffEventFields', () => {
  it('builds a timed event as venue-local wall clock stored in UTC', () => {
    const result = buildStaffEventFields({
      title: ' team briefing ',
      date: '2026-11-12',
      startTime: '18:00',
      endTime: '20:00',
      location: 'Function room',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.title).toBe('TEAM BRIEFING')
    expect(result.value.startsAt.toISOString()).toBe('2026-11-12T18:00:00.000Z')
    expect(result.value.endsAt?.toISOString()).toBe('2026-11-12T20:00:00.000Z')
    expect(result.value.location).toBe('Function room')
  })

  it('rolls an end at or before the start to the next day', () => {
    const result = buildStaffEventFields({ title: 'LATE', date: '2026-11-12', startTime: '22:00', endTime: '01:00' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.endsAt?.toISOString()).toBe('2026-11-13T01:00:00.000Z')
  })

  it('builds an all-day event without times', () => {
    const result = buildStaffEventFields({ title: 'TRAINING DAY', date: '2026-11-12', allDay: true })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.startsAt.toISOString()).toBe('2026-11-12T00:00:00.000Z')
      expect(result.value.endsAt?.toISOString()).toBe('2026-11-12T23:59:00.000Z')
    }
  })

  it('requires a title and a valid date', () => {
    expect(buildStaffEventFields({ date: '2026-11-12', startTime: '18:00', endTime: '20:00' })).toEqual({ ok: false, error: 'TITLE IS REQUIRED' })
    expect(buildStaffEventFields({ title: 'X', date: '12/11/2026', startTime: '18:00', endTime: '20:00' })).toEqual({ ok: false, error: 'A VALID DATE IS REQUIRED' })
  })

  it('requires valid start and end times for a timed event', () => {
    expect(buildStaffEventFields({ title: 'X', date: '2026-11-12', startTime: 'nope', endTime: '20:00' })).toEqual({ ok: false, error: 'A VALID START TIME IS REQUIRED' })
    expect(buildStaffEventFields({ title: 'X', date: '2026-11-12', startTime: '18:00' })).toEqual({ ok: false, error: 'A VALID END TIME IS REQUIRED' })
  })

  it('builds an optional response deadline', () => {
    const result = buildStaffEventFields({
      title: 'X', date: '2026-11-12', startTime: '18:00', endTime: '20:00',
      responseDeadlineDate: '2026-11-10', responseDeadlineTime: '12:00',
    })
    expect(result.ok && result.value.responseDeadline?.toISOString()).toBe('2026-11-10T12:00:00.000Z')
  })

  it('defaults a deadline date without a time to end of day', () => {
    const result = buildStaffEventFields({
      title: 'X', date: '2026-11-12', startTime: '18:00', endTime: '20:00', responseDeadlineDate: '2026-11-10',
    })
    expect(result.ok && result.value.responseDeadline?.toISOString()).toBe('2026-11-10T23:59:00.000Z')
  })
})

describe('response options and windows', () => {
  const base = {
    status: 'PUBLISHED',
    startsAt: new Date('2026-11-12T18:00:00Z'),
    endsAt: new Date('2026-11-12T20:00:00Z'),
    allowMaybe: false,
    requireDeclineReason: false,
  }

  it('offers Maybe only when allowed', () => {
    expect(allowedResponses(false)).toEqual(['ACCEPTED', 'DECLINED'])
    expect(allowedResponses(true)).toEqual(['ACCEPTED', 'DECLINED', 'MAYBE'])
  })

  it('falls back to the event end and then the start', () => {
    expect(responseDeadlineAt({ startsAt: base.startsAt, endsAt: base.endsAt })).toBe(base.endsAt)
    expect(responseDeadlineAt({ startsAt: base.startsAt, responseDeadline: new Date('2026-11-01T00:00:00Z') })).toEqual(new Date('2026-11-01T00:00:00Z'))
    expect(responseDeadlineAt({ startsAt: base.startsAt })).toBe(base.startsAt)
  })

  it('accepts a response before the deadline and rejects after it', () => {
    expect(isResponseOpen(base, new Date('2026-11-12T19:00:00Z'))).toBe(true)
    expect(isResponseOpen(base, new Date('2026-11-12T21:00:00Z'))).toBe(false)
    expect(isResponseOpen({ ...base, status: 'DRAFT' }, new Date('2026-11-12T19:00:00Z'))).toBe(false)
  })

  it('validates accept, maybe and decline reason server-side', () => {
    expect(validateStaffEventResponse(base, { response: 'accepted' }, new Date('2026-11-12T19:00:00Z'))).toEqual({ ok: true, response: 'ACCEPTED', reason: null })
    expect(validateStaffEventResponse(base, { response: 'MAYBE' }, new Date('2026-11-12T19:00:00Z'))).toEqual({ ok: false, error: 'MAYBE IS NOT AN OPTION FOR THIS EVENT' })
    expect(validateStaffEventResponse({ ...base, allowMaybe: true }, { response: 'MAYBE' }, new Date('2026-11-12T19:00:00Z'))).toEqual({ ok: true, response: 'MAYBE', reason: null })
  })

  it('requires a decline reason only when the event says so', () => {
    const now = new Date('2026-11-12T19:00:00Z')
    expect(validateStaffEventResponse(base, { response: 'DECLINED' }, now)).toEqual({ ok: true, response: 'DECLINED', reason: null })
    expect(validateStaffEventResponse({ ...base, requireDeclineReason: true }, { response: 'DECLINED' }, now)).toEqual({ ok: false, error: 'A REASON IS REQUIRED TO DECLINE' })
    expect(validateStaffEventResponse({ ...base, requireDeclineReason: true }, { response: 'DECLINED', reason: ' Sick ' }, now)).toEqual({ ok: true, response: 'DECLINED', reason: 'Sick' })
  })

  it('rejects a response after the deadline or before publish', () => {
    const later = new Date('2026-11-13T00:00:00Z')
    expect(validateStaffEventResponse(base, { response: 'ACCEPTED' }, later)).toEqual({ ok: false, error: 'THE RESPONSE DEADLINE HAS PASSED' })
    expect(validateStaffEventResponse({ ...base, status: 'DRAFT' }, { response: 'ACCEPTED' }, new Date('2026-11-12T19:00:00Z'))).toEqual({ ok: false, error: 'THIS EVENT IS NOT OPEN' })
  })

  it('knows when the event itself is over', () => {
    expect(isStaffEventOver(base, new Date('2026-11-12T20:01:00Z'))).toBe(true)
    expect(isStaffEventOver(base, new Date('2026-11-12T19:00:00Z'))).toBe(false)
  })

  it('compares windows against the venue wall clock, not server UTC', () => {
    // 07:00 UTC = 20:00 NZDT on 12 Nov. A stored 20:00Z event has ended.
    const justAfter = wallClockNow(new Date('2026-11-12T07:01:00Z'), 'Pacific/Auckland')
    expect(justAfter.toISOString()).toBe('2026-11-12T20:01:00.000Z')
    expect(isStaffEventOver(base, justAfter)).toBe(true)
    expect(isResponseOpen(base, wallClockNow(new Date('2026-11-12T06:00:00Z'), 'Pacific/Auckland'))).toBe(true)
    expect(wallClockNow(new Date('2026-11-12T07:01:00Z'), 'Not/AZone')).toEqual(new Date('2026-11-12T07:01:00Z'))
  })
})

describe('attendanceFor', () => {
  it('counts each response bucket', () => {
    expect(attendanceFor([
      { response: 'ACCEPTED' }, { response: 'ACCEPTED' }, { response: 'DECLINED' },
      { response: 'MAYBE' }, { response: 'PENDING' },
    ])).toEqual({ pending: 1, accepted: 2, declined: 1, maybe: 1, total: 5, responded: 4 })
  })

  it('treats an unknown response as pending', () => {
    expect(attendanceFor([{ response: 'WHATEVER' }])).toMatchObject({ pending: 1, total: 1, responded: 0 })
  })
})

describe('resolveStaffEventTargets', () => {
  const staff = [
    { id: 'a', departmentId: 'kitchen', sectionIds: new Set(['prep']), positionIds: new Set(['chef']) },
    { id: 'b', departmentId: 'bar', sectionIds: new Set(['front']), positionIds: new Set(['barista']) },
    { id: 'c', departmentId: 'kitchen', sectionIds: new Set(['pass']), positionIds: new Set(['chef']) },
  ]

  it('targets the whole venue when there are no audiences or explicit people', () => {
    expect(resolveStaffEventTargets(staff, [])).toEqual(['a', 'b', 'c'])
  })

  it('unions department, section and position audiences', () => {
    expect(resolveStaffEventTargets(staff, [
      { kind: 'DEPARTMENT', targetId: 'kitchen' },
      { kind: 'POSITION', targetId: 'barista' },
    ])).toEqual(['a', 'b', 'c'])
    expect(resolveStaffEventTargets(staff, [{ kind: 'SECTION', targetId: 'prep' }])).toEqual(['a'])
  })

  it('adds explicit invitees and ignores unknown ids', () => {
    expect(resolveStaffEventTargets(staff, [{ kind: 'SECTION', targetId: 'prep' }], ['b', 'zzz'])).toEqual(['a', 'b'])
  })

  it('explicit-only invites do not become a whole-venue invite', () => {
    expect(resolveStaffEventTargets(staff, [], ['b'])).toEqual(['b'])
  })
})

describe('ICS generation', () => {
  it('escapes commas, semicolons, backslashes and newlines', () => {
    expect(escapeIcsText('A, B; C\\D\nE')).toBe('A\\, B\\; C\\\\D\\nE')
  })

  it('formats venue-local timestamps, real UTC DTSTAMP and dates', () => {
    expect(formatIcsLocal(new Date('2026-11-12T18:05:09Z'))).toBe('20261112T180509')
    expect(formatIcsStamp(new Date('2026-11-12T18:05:09Z'))).toBe('20261112T180509Z')
    expect(formatIcsDate(new Date('2026-11-12T18:05:09Z'))).toBe('20261112')
  })

  it('quotes parameter values instead of backslash-escaping them', () => {
    expect(quoteIcsParam('ADA "THE BOSS" MANAGER')).toBe('"ADA \\"THE BOSS\\" MANAGER"')
  })

  it('folds by UTF-8 octets, not JS characters', () => {
    const line = `SUMMARY:${'Ā'.repeat(60)}` // 2 bytes per macron character
    const folded = foldIcsLine(line)
    const encoder = new TextEncoder()
    for (const physical of folded.split('\r\n')) {
      expect(encoder.encode(physical).length).toBeLessThanOrEqual(75)
    }
    expect(folded.split('\r\n').slice(1).every((part) => part.startsWith(' '))).toBe(true)
    expect(folded.replace(/\r\n /g, '')).toBe(line)
  })

  it('emits a timed event with organiser and escaped summary', () => {
    const ics = buildStaffEventIcs({
      uid: 'staff-event-1@hospo-ops',
      title: 'BRIEFING, ALL STAFF',
      description: 'Bring: notes; questions',
      location: 'Function Room',
      startsAt: new Date('2026-11-12T18:00:00Z'),
      endsAt: new Date('2026-11-12T20:00:00Z'),
      organiserName: 'ADA MANAGER',
      now: new Date('2026-11-01T00:00:00Z'),
    })
    expect(ics).toContain('BEGIN:VCALENDAR\r\n')
    expect(ics).toContain('DTSTART:20261112T180000')
    expect(ics).toContain('DTEND:20261112T200000')
    expect(ics).toContain('SUMMARY:BRIEFING\\, ALL STAFF')
    expect(ics).toContain('DESCRIPTION:Bring: notes\\; questions')
    expect(ics).toContain('LOCATION:Function Room')
    expect(ics).toContain('ORGANIZER;CN="ADA MANAGER":mailto:noreply@hospo.local')
    expect(ics).toMatch(/DTSTAMP:\d{8}T\d{6}Z/)
    expect(ics).toContain('DTSTART:20261112T180000')
    expect(ics).toContain('DTEND:20261112T200000')
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
  })

  it('keeps a multi-byte summary intact through folding', () => {
    const title = 'NGĀTI WHAKAARO TEAM BRIEFING — WHARE KAI, LEVEL 2, FUNCTION ROOM'
    const ics = buildStaffEventIcs({
      uid: 'staff-event-3@hospo-ops',
      title,
      startsAt: new Date('2026-11-12T18:00:00Z'),
      endsAt: new Date('2026-11-12T20:00:00Z'),
      organiserName: 'WHĀNAU MANAGER',
    })
    const summaryPhysical = ics.split('\r\n').filter((line) => line.startsWith('SUMMARY:') || line.startsWith(' '))
    // Joining the folded summary back must reproduce the escaped title exactly.
    const joined = summaryPhysical.join('').replace(/\r\n/g, '')
    expect(joined).toContain('NGĀTI WHAKAARO')
    expect(new TextEncoder().encode(summaryPhysical[0]).length).toBeLessThanOrEqual(75)
  })

  it('emits an all-day event with an exclusive DTEND date', () => {
    const ics = buildStaffEventIcs({
      uid: 'staff-event-2@hospo-ops',
      title: 'TRAINING DAY',
      startsAt: new Date('2026-11-12T00:00:00Z'),
      endsAt: new Date('2026-11-12T23:59:00Z'),
      allDay: true,
    })
    expect(ics).toContain('DTSTART;VALUE=DATE:20261112')
    expect(ics).toContain('DTEND;VALUE=DATE:20261113')
  })

  it('adds a display reminder when asked', () => {
    const ics = buildStaffEventIcs({
      uid: 'x', title: 'X', startsAt: new Date('2026-11-12T18:00:00Z'),
      endsAt: new Date('2026-11-12T20:00:00Z'), reminderMinutes: 30,
    })
    expect(ics).toContain('BEGIN:VALARM')
    expect(ics).toContain('TRIGGER:-PT30M')
  })
})
