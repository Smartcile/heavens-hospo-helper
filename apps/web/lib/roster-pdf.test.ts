import { describe, it, expect } from 'vitest'
import { generateRosterPdf } from '@/lib/roster-pdf'

describe('generateRosterPdf', () => {
  it('builds an A4 landscape roster document with the shifts', () => {
    const doc = generateRosterPdf({
      venueName: 'THE VENUE',
      weekLabel: 'MON 05 OCT — SUN 11 OCT 2026',
      weekDates: ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'],
      staff: [{ id: 's1', name: 'LIAM HEAVEN' }],
      shifts: [
        { id: 'sh1', staffId: 's1', date: '2026-10-05', startTime: '09:00', endTime: '17:00', breakMinutes: 30, colour: null, tag: null, status: 'PUBLISHED', positionName: 'BARISTA', positionColour: null },
      ],
      rates: [{ staffId: 's1', hourlyRate: 25 }],
    })
    expect(doc.getNumberOfPages()).toBe(1)
    expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(1000)
  })

  it('adds a page every twelve staff', () => {
    const staff = Array.from({ length: 13 }, (_, i) => ({ id: `s${i}`, name: `STAFF ${i}` }))
    const doc = generateRosterPdf({
      venueName: 'THE VENUE',
      weekLabel: 'WEEK',
      weekDates: ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'],
      staff,
      shifts: [],
      rates: [],
    })
    expect(doc.getNumberOfPages()).toBe(2)
  })
})
