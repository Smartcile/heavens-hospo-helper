import { describe, expect, it } from 'vitest'
import { buildStaffEventImportPrompt, matchStaffEventRows, parseStaffEventImportAnswer } from './staff-event'

describe('buildStaffEventImportPrompt', () => {
  it('asks for a strict JSON event with the fields the preview needs', () => {
    const prompt = buildStaffEventImportPrompt({ venueName: 'THE EATERY' })
    expect(prompt).toContain('THE EATERY')
    expect(prompt).toContain('"event"')
    expect(prompt).toContain('"attendanceRequired"')
    expect(prompt).toContain('Never invent')
  })
})

describe('parseStaffEventImportAnswer', () => {
  it('parses a fenced JSON event', () => {
    const result = parseStaffEventImportAnswer('```json\n' + JSON.stringify({
      event: {
        title: 'team briefing',
        date: '2026-11-12',
        startTime: '18:00',
        endTime: '20:00',
        location: 'FUNCTION ROOM',
        description: 'Monthly briefing.',
        attendanceRequired: true,
        allowMaybe: 'yes',
        requireDeclineReason: false,
        department: 'kitchen',
      },
    }) + '\n```')
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].values).toMatchObject({
      title: 'TEAM BRIEFING',
      date: '2026-11-12',
      startTime: '18:00',
      endTime: '20:00',
      location: 'FUNCTION ROOM',
      attendanceRequired: true,
      allowMaybe: true,
      requireDeclineReason: false,
      audienceKind: 'DEPARTMENT',
      audienceName: 'KITCHEN',
    })
    expect(result.rows[0].action).toBe('CREATE')
  })

  it('accepts the first event of an events array and ISO date-times', () => {
    const result = parseStaffEventImportAnswer(JSON.stringify({
      events: [
        { title: 'BRIEFING', start: '2026-11-12T18:30:00', end: '2026-11-12T19:30:00', audience: 'POSITION: DUTY MANAGER' },
        { title: 'SECOND', date: '2026-12-01', startTime: '09:00', endTime: '10:00' },
      ],
    }))
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].values).toMatchObject({
      title: 'BRIEFING',
      date: '2026-11-12',
      startTime: '18:30',
      endTime: '19:30',
      audienceKind: 'POSITION',
      audienceName: 'DUTY MANAGER',
    })
  })

  it('parses an all-day event without times', () => {
    const result = parseStaffEventImportAnswer(JSON.stringify({ event: { title: 'TRAINING DAY', date: '2026-11-12', allDay: true } }))
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.rows[0].values).toMatchObject({ allDay: true, startTime: '', endTime: '' })
    expect(result.rows[0].include).toBe(true)
  })

  it('flags a timed event with no end time and defaults it to SKIP', () => {
    const result = parseStaffEventImportAnswer(JSON.stringify({ event: { title: 'BRIEFING', date: '2026-11-12', startTime: '18:00' } }))
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.rows[0].include).toBe(false)
    expect(result.rows[0].action).toBe('SKIP')
    expect(result.rows[0].issues.some((i) => i.severity === 'ERROR')).toBe(true)
  })

  it('returns an error for no JSON, invalid JSON or no event', () => {
    expect(parseStaffEventImportAnswer('nope')).toEqual({ error: 'NO JSON FOUND IN THE ANSWER' })
    expect(parseStaffEventImportAnswer('```json\n{"event": nope}\n```')).toEqual({ error: 'THE ANSWER IS NOT VALID JSON' })
    expect(parseStaffEventImportAnswer('```json\n{}\n```')).toEqual({ error: 'NO EVENT FOUND IN THE ANSWER' })
  })
})

describe('matchStaffEventRows', () => {
  it('matches an existing event by title and date so a re-import skips it', () => {
    const parsed = parseStaffEventImportAnswer(JSON.stringify({ event: { title: 'BRIEFING', date: '2026-11-12', startTime: '18:00', endTime: '20:00' } }))
    if ('error' in parsed) throw new Error(parsed.error)
    const rows = matchStaffEventRows(parsed.rows, [{ id: 'e1', name: 'BRIEFING|2026-11-12' }])
    expect(rows[0].action).toBe('SKIP')
    expect(rows[0].match).toMatchObject({ status: 'MATCH', targetId: 'e1' })
  })

  it('leaves a new date as a CREATE row', () => {
    const parsed = parseStaffEventImportAnswer(JSON.stringify({ event: { title: 'BRIEFING', date: '2026-11-19', startTime: '18:00', endTime: '20:00' } }))
    if ('error' in parsed) throw new Error(parsed.error)
    const rows = matchStaffEventRows(parsed.rows, [{ id: 'e1', name: 'BRIEFING|2026-11-12' }])
    expect(rows[0].action).toBe('CREATE')
  })
})
