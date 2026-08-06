import { describe, it, expect } from 'vitest'
import { generateChecklistPdf, checklistPdfToBuffer } from './checklist-pdf'

const baseData = {
  venueName: 'AKARANA EATERY',
  name: 'BAR OPEN',
  description: 'Pre-service opening checklist',
  appearFromTime: '08:00',
  tasks: [
    { title: 'WIPE DOWN ALL BAR SURFACES', sectionName: 'BAR 1' },
    { title: 'STOCK FRIDGE BOTTLES' },
  ],
}

describe('generateChecklistPdf', () => {
  it('generates a valid PDF buffer', () => {
    const doc = generateChecklistPdf(baseData)
    expect(doc).toBeDefined()
    const buffer = checklistPdfToBuffer(doc)
    expect(buffer).toBeInstanceOf(ArrayBuffer)
    expect(buffer.byteLength).toBeGreaterThan(100)
  })

  it('fits on one page for a short list', () => {
    const doc = generateChecklistPdf(baseData)
    expect(doc.getNumberOfPages()).toBe(1)
  })

  it('adds pages for long checklists', () => {
    const tasks = Array.from({ length: 80 }, (_, i) => ({
      title: `TASK NUMBER ${i + 1} WITH A LONG TITLE TO FORCE WRAPPING ACROSS THE LINE`,
      sectionName: 'SECTION',
    }))
    const doc = generateChecklistPdf({ ...baseData, tasks })
    expect(doc.getNumberOfPages()).toBeGreaterThan(1)
  })

  it('omits the description and time lines when absent', () => {
    const doc = generateChecklistPdf({ venueName: 'TEST VENUE', name: 'CLOSE DOWN', tasks: [] })
    expect(doc.getNumberOfPages()).toBe(1)
    expect(checklistPdfToBuffer(doc).byteLength).toBeGreaterThan(100)
  })
})
