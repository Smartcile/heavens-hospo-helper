import { describe, it, expect } from 'vitest'
import { proposalToEntry } from '@/lib/availability'

describe('proposalToEntry', () => {
  it('maps a SET proposal into an editor entry', () => {
    const entry = proposalToEntry({
      date: '2026-10-26',
      staffId: 'st1',
      seriesId: 's1',
      status: 'PENDING',
      payload: {
        action: 'SET',
        availability: {
          isAllDay: true,
          type: 'UNAVAILABLE',
          windows: [],
          timeOff: true,
          notes: 'FAMILY',
        },
      },
    })

    expect(entry).toMatchObject({
      staffId: 'st1',
      date: '2026-10-26',
      type: 'UNAVAILABLE',
      isAllDay: true,
      windows: [],
      status: 'PENDING',
      timeOff: true,
      notes: 'FAMILY',
      seriesId: 's1',
    })
  })

  it('maps a windowed proposal and derives the dominant type', () => {
    const entry = proposalToEntry({
      date: '2026-10-26',
      payload: {
        action: 'SET',
        availability: {
          isAllDay: false,
          type: 'AVAILABLE',
          windows: [
            { type: 'AVAILABLE', startTime: '09:00', endTime: '12:00' },
            { type: 'UNAVAILABLE', startTime: '12:00', endTime: '17:00' },
          ],
          timeOff: false,
          notes: null,
        },
      },
    })

    expect(entry?.isAllDay).toBe(false)
    expect(entry?.type).toBe('UNAVAILABLE')
    expect(entry?.windows).toHaveLength(2)
    expect(entry?.status).toBe('PENDING')
  })

  it('returns null for a CLEAR request or an empty payload', () => {
    expect(proposalToEntry({ date: '2026-10-26', payload: { action: 'CLEAR', availability: null } })).toBeNull()
    expect(proposalToEntry({ date: '2026-10-26', payload: null })).toBeNull()
    expect(proposalToEntry({ date: '2026-10-26', payload: { action: 'SET', availability: null } })).toBeNull()
  })
})
