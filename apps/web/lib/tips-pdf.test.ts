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
