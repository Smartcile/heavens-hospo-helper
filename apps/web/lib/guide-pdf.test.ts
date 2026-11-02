import { describe, it, expect, afterEach } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { generateGuidePdf, mergedGuidePdf, guidePdfToBuffer, guidePdfFilename, loadImageDataUrl } from './guide-pdf'
import type { GuidePdfData } from './guide-pdf'

function pdfText(doc: ReturnType<typeof generateGuidePdf>): string {
  return Buffer.from(guidePdfToBuffer(doc)).toString('latin1')
}

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

  it('prints link boxes with kind, quantity, note and sub-line', () => {
    const doc = generateGuidePdf({
      ...baseData,
      steps: [
        {
          heading: 'SET UP',
          content: 'Gather the tools.',
          links: [
            { kind: 'ITEM', label: 'T20 TORX DRIVER', note: 'TOP SHELF', qty: 2 },
            { kind: 'GUIDE', label: 'OPENING CHECKLIST', note: null, sub: 'FOOD SAFETY' },
            { kind: 'TASK', label: 'TASK REMOVED', note: null, missing: true },
          ],
        },
      ],
    })
    const raw = pdfText(doc)
    expect(raw).toContain('ITEMS NEEDED')
    expect(raw).toContain('2x T20 TORX DRIVER')
    expect(raw).toContain('TOP SHELF')
    expect(raw).toContain('GUIDE')
    expect(raw).toContain('OPENING CHECKLIST')
    expect(raw).toContain('FOOD SAFETY')
    expect(raw).toContain('TASK REMOVED')
  })

  it('prints the reference-not-tracked badge like the reader', () => {
    const raw = pdfText(generateGuidePdf({ ...baseData, isTracked: false }))
    expect(raw).toContain('REFERENCE - NOT TRACKED')
  })
})

describe('loadImageDataUrl', () => {
  const originalUploadPath = process.env.UPLOAD_PATH
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
    if (originalUploadPath === undefined) delete process.env.UPLOAD_PATH
    else process.env.UPLOAD_PATH = originalUploadPath
  })

  function tempUpload(file: string, bytes: Buffer): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guide-pdf-'))
    dirs.push(dir)
    process.env.UPLOAD_PATH = dir
    fs.writeFileSync(path.join(dir, file), bytes)
    return dir
  }

  // 1×1 transparent PNG.
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )

  it('reads /api/upload files from the UPLOAD_PATH storage root (not public/)', async () => {
    tempUpload('photo.png', PNG)
    const data = await loadImageDataUrl('/api/upload/photo.png')
    expect(data).toMatch(/^data:image\/png;base64,/)
    expect(data).toContain(PNG.toString('base64'))
  })

  it('resolves legacy /uploads/ URLs against the storage root too', async () => {
    tempUpload('legacy.jpg', PNG)
    expect(await loadImageDataUrl('/uploads/legacy.jpg')).toMatch(/^data:image\/jpeg;base64,/)
  })

  it('returns null for a missing file and rejects path traversal', async () => {
    tempUpload('photo.png', PNG)
    expect(await loadImageDataUrl('/api/upload/nope.png')).toBeNull()
    expect(await loadImageDataUrl('/api/upload/..%2Fsecret.png')).toBeNull()
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
