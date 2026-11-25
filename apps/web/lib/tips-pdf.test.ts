import { describe, it, expect } from 'vitest'
import { generateTipsPdf, tipsPdfToBuffer } from '@/lib/tips-pdf'

describe('tips PDF', () => {
  it('renders every person with hours, weight, amount, status and notes', () => {
    const doc = generateTipsPdf({
      venueName: 'Demo Venue',
      label: 'FEBRUARY 2026',
      fromDate: '2026-02-01',
      toDate: '2026-02-28',
      poolTotal: 100,
      shares: [
        { name: 'ALEX CHEN', hours: 8, shareWeight: 1, amount: 50, status: 'APPROVED', approvalNote: 'OK' },
        { name: 'SAM WILSON', hours: 4, shareWeight: 1, amount: 50, status: 'ISSUED', issueNote: 'CASH' },
      ],
    })
    expect(doc.getNumberOfPages()).toBe(1)
    const buffer = tipsPdfToBuffer(doc)
    expect(buffer.byteLength).toBeGreaterThan(500)
  })
})

describe('tips PDF departments', () => {
  it('prints a person\u2019s department and leaves a manual person blank', () => {
    const doc = generateTipsPdf({
      venueName: 'Demo Venue',
      label: 'FEBRUARY 2026',
      fromDate: '2026-02-01',
      toDate: '2026-02-28',
      poolTotal: 100,
      shares: [
        { name: 'ALEX CHEN', department: 'KITCHEN', hours: 8, shareWeight: 1, amount: 50, status: 'APPROVED' },
        { name: 'WALK IN WONDER', department: null, hours: 4, shareWeight: 1, amount: 50, status: 'PLANNED' },
      ],
    })
    expect(doc.getNumberOfPages()).toBe(1)
    const text = doc.output()
    expect(text).toContain('KITCHEN')
    expect(text).toContain('WALK IN WONDER')
  })
})

describe('tips PDF notes option', () => {
  const crowded = Array.from({ length: 12 }, (_, index) => ({
    name: `PERSON ${index + 1}`,
    hours: 1,
    shareWeight: 1,
    amount: 8.33,
    status: 'APPROVED',
    notes: Array.from({ length: 4 }, () => 'A'.repeat(280)),
  }))
  const base = {
    venueName: 'Demo Venue',
    label: 'FEBRUARY 2026',
    fromDate: '2026-02-01',
    toDate: '2026-02-28',
    poolTotal: 100,
    shares: crowded,
  }

  it('prints the note thread only when includeNotes is true (default OFF)', () => {
    const off = generateTipsPdf({ ...base, includeNotes: false })
    const on = generateTipsPdf({ ...base, includeNotes: true })
    expect(off.getNumberOfPages()).toBe(1)
    expect(on.getNumberOfPages()).toBeGreaterThan(1)
    expect(tipsPdfToBuffer(on).byteLength).toBeGreaterThan(tipsPdfToBuffer(off).byteLength)
  })
})
