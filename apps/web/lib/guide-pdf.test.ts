import { describe, it, expect } from 'vitest'
import { generateGuidePdf, mergedGuidePdf, guidePdfToBuffer, guidePdfFilename } from './guide-pdf'
import type { GuidePdfData } from './guide-pdf'

const baseData: GuidePdfData = {
  venueName: 'AKARANA EATERY',
  title: 'FOOD SAFETY BASICS',
  description: 'The non-negotiables of kitchen hygiene.',
  category: 'FOOD SAFETY',
  requiresSignOff: true,
  steps: [
    {
      heading: 'PERSONAL HYGIENE',
      content: 'Wash hands for 20 seconds before starting. No jewellery, hair tied back.',
      links: [{ kind: 'TASK', label: 'CHECK FRIDGE TEMPERATURES', note: 'FIRST JOB EVERY MORNING' }],
    },
    { heading: null, content: 'Hot food stays above 60°C, cold food below 5°C.', videoUrl: 'https://example.com/video' },
  ],
}

describe('generateGuidePdf', () => {
  it('generates a valid PDF buffer', () => {
    const doc = generateGuidePdf(baseData)
    const buffer = guidePdfToBuffer(doc)
    expect(buffer).toBeInstanceOf(ArrayBuffer)
    expect(buffer.byteLength).toBeGreaterThan(100)
  })

  it('fits a short guide on one page', () => {
    expect(generateGuidePdf(baseData).getNumberOfPages()).toBe(1)
  })

  it('adds pages for long guides', () => {
    const steps = Array.from({ length: 40 }, (_, i) => ({
      heading: `STEP ${i + 1}`,
      content: 'The quick brown fox jumps over the lazy dog while the kitchen staff clean every surface with sanitiser.',
    }))
    const doc = generateGuidePdf({ ...baseData, steps })
    expect(doc.getNumberOfPages()).toBeGreaterThan(1)
  })

  it('skips unreadable image data without throwing', () => {
    const doc = generateGuidePdf({
      ...baseData,
      steps: [{ heading: null, content: 'TEXT ONLY', imageDataUrl: 'data:image/jpeg;base64,not-a-real-image' }],
    })
    expect(guidePdfToBuffer(doc).byteLength).toBeGreaterThan(100)
  })
})

describe('mergedGuidePdf', () => {
  it('starts each guide on its own page', () => {
    const doc = mergedGuidePdf('AKARANA EATERY', [baseData, { ...baseData, title: 'FRYER SAFETY' }, { ...baseData, title: 'ALLERGENS' }])
    expect(doc.getNumberOfPages()).toBe(3)
  })

  it('produces a buffer', () => {
    const doc = mergedGuidePdf('AKARANA EATERY', [baseData])
    expect(guidePdfToBuffer(doc).byteLength).toBeGreaterThan(100)
  })
})

describe('guidePdfFilename', () => {
  it('sanitises the title into a filename', () => {
    expect(guidePdfFilename('Food Safety & Oil!! Management')).toBe('GUIDE - FOOD SAFETY OIL MANAGEMENT.pdf')
  })
  it('falls back for a blank title', () => {
    expect(guidePdfFilename('   ')).toBe('GUIDE - PLAYBOOK.pdf')
  })
})
