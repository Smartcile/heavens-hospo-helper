import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  EXPECTED_EXEMPTIONS,
  KNOWN_INLINE_ROUTES,
  KNOWN_SURFACES,
  VIEWER_IMPORTS,
  collectMarkers,
  formatViolation,
  markerReason,
  scanPdfSource,
  type PdfMarker,
} from './pdf-viewer-convention'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.name.endsWith('.tsx')) out.push(full)
  }
  return out
}

function rel(full: string): string {
  return relative(ROOT, full).replace(/\\/g, '/')
}

function scannedFiles(): string[] {
  const files = [...walk(join(ROOT, 'components')), ...walk(join(ROOT, 'app'))]
  return files
    .map(rel)
    .filter((file) => !file.endsWith('.test.tsx'))
    .filter((file) => !file.startsWith('app/api/'))
    .filter((file) => file !== 'components/ui/PdfActionBar.tsx')
    .sort()
}

describe('pdf-viewer-convention scanner', () => {
  it('flags a PDF window.open with the file, line and text', () => {
    const source = [
      'export function A() {',
      "  window.open('/api/admin/things/1/pdf', '_blank')",
      '}',
    ].join('\n')
    const violations = scanPdfSource('components/admin/Things.tsx', source)
    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatchObject({ file: 'components/admin/Things.tsx', line: 2, kind: 'window-open' })
    expect(formatViolation(violations[0])).toContain(
      "components/admin/Things.tsx:2 opens a PDF outside the viewer: window.open('/api/admin/things/1/pdf', '_blank')",
    )
  })

  it('flags a multi-line PDF window.open', () => {
    const source = [
      'window.open(',
      '  `/api/admin/parking/ftp/claims/evidence-pack?ids=1`,',
      "  '_blank',",
      ')',
    ].join('\n')
    expect(scanPdfSource('x.tsx', source)).toHaveLength(0) // no /pdf or .pdf literal
    const withPdf = [
      'window.open(',
      '  `/api/admin/things/1/pdf`,',
      "  '_blank',",
      ')',
    ].join('\n')
    const violations = scanPdfSource('x.tsx', withPdf)
    expect(violations).toHaveLength(1)
    expect(violations[0].line).toBe(1)
  })

  it('flags a target=_blank anchor with a PDF href', () => {
    const source = [
      '<a',
      '  href={`/api/admin/events/${id}/pdf?variant=FULL`}',
      '  target="_blank"',
      '>BEO</a>',
    ].join('\n')
    const violations = scanPdfSource('components/admin/E.tsx', source)
    expect(violations).toHaveLength(1)
    expect(violations[0].kind).toBe('anchor')
    expect(violations[0].line).toBe(1)
  })

  it('flags a PDF anchor with no download attribute', () => {
    const source = '<a href="/api/admin/things/1/pdf">PDF</a>'
    expect(scanPdfSource('x.tsx', source)).toHaveLength(1)
  })

  it('allows a PDF anchor with a download attribute and no target', () => {
    const source = '<a href="/api/admin/things/1/pdf" download>PDF</a>'
    expect(scanPdfSource('x.tsx', source)).toHaveLength(0)
  })

  it('flags a direct PDF download call', () => {
    const source = "await downloadFile(`/api/admin/guides/${id}/pdf`)"
    const violations = scanPdfSource('components/admin/G.tsx', source)
    expect(violations).toHaveLength(1)
    expect(violations[0].kind).toBe('download')
  })

  it('preserves the DOCTYPE rule but ignores non-PDF window.open and links', () => {
    const source = [
      "window.open('/api/admin/customer-memberships/export?x=1', '_blank')",
      '<a href={photoUrl} target="_blank" rel="noreferrer">PHOTO</a>',
      '<a href={videoUrl} target="_blank" rel="noreferrer">VIDEO</a>',
      '<a href="/admin/tasks?task=1" target="_blank">TASK</a>',
    ].join('\n')
    expect(scanPdfSource('x.tsx', source)).toHaveLength(0)
  })

  it('allows a violation covered by a marker on the same line or one above', () => {
    const sameLine = "window.open('/api/admin/things/1/pdf') // pdf-download-ok: bulk print"
    const above = [
      '// pdf-download-ok: bulk print',
      "window.open('/api/admin/things/1/pdf')",
    ].join('\n')
    expect(scanPdfSource('x.tsx', sameLine)).toHaveLength(0)
    expect(scanPdfSource('x.tsx', above)).toHaveLength(0)
  })

  it('only accepts a marker with a reason', () => {
    expect(markerReason('// pdf-download-ok: bulk print')).toBe('bulk print')
    expect(markerReason('// pdf-download-ok:')).toBeNull()
    expect(markerReason('// pdf-download-ok:   ')).toBeNull()
    const source = [
      '// pdf-download-ok:',
      "window.open('/api/admin/things/1/pdf')",
    ].join('\n')
    expect(scanPdfSource('x.tsx', source)).toHaveLength(1)
  })

  it('collects markers with their reasons', () => {
    const markers = collectMarkers(
      'x.tsx',
      ['// pdf-download-ok: bulk print', 'code() // pdf-download-ok: csv export'].join('\n'),
    )
    expect(markers).toEqual([
      { file: 'x.tsx', reason: 'bulk print' },
      { file: 'x.tsx', reason: 'csv export' },
    ])
  })
})

describe('pdf-viewer-convention real tree', () => {
  it('has no PDF bypasses outside the viewer', () => {
    const violations = scannedFiles().flatMap((file) =>
      scanPdfSource(file, readFileSync(join(ROOT, file), 'utf8')),
    )
    expect(violations.map(formatViolation)).toEqual([])
  })

  it('has exactly the expected exemption markers', () => {
    const found = scannedFiles()
      .flatMap((file) => collectMarkers(file, readFileSync(join(ROOT, file), 'utf8')))
      .sort((a, b) => keyOf(a).localeCompare(keyOf(b)))
    const expected = [...EXPECTED_EXEMPTIONS].sort((a, b) => keyOf(a).localeCompare(keyOf(b)))
    expect(found).toEqual(expected)
  })

  it('keeps the viewer imported in every known surface', () => {
    const missing = KNOWN_SURFACES.filter((file) => {
      const source = readFileSync(join(ROOT, file), 'utf8')
      return !VIEWER_IMPORTS.some((module) => source.includes(`from '${module}'`))
    })
    expect(missing).toEqual([])
  })

  it('keeps ?inline=1 support on every known PDF route', () => {
    const missing = KNOWN_INLINE_ROUTES.filter((file) => {
      const source = readFileSync(join(ROOT, file), 'utf8')
      return !source.includes('inline')
    })
    expect(missing).toEqual([])
  })
})

function keyOf(marker: PdfMarker): string {
  return `${marker.file}::${marker.reason}`
}
