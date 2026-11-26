// Convention guard for issue #188: every user-facing PDF must open in the
// in-app viewer (`PdfDocumentView` / `PdfViewerModal`) instead of a raw
// `window.open`, a `target="_blank"` link or a bare attachment download, which
// strands someone outside an installed homescreen app.
//
// The tree walk lives in `pdf-viewer-convention.test.ts`; this module stays
// pure/node-safe so it can be unit-tested directly. A genuine leave-the-app
// output (bulk print, evidence pack, CSV) opts out on the same line, or the
// line above, with: `// pdf-download-ok: <reason>`.

export const PDF_VIEWER_MARKER = 'pdf-download-ok:'

export interface PdfMarker {
  file: string
  reason: string
}

export interface PdfViolation {
  file: string
  /** 1-based line number. */
  line: number
  text: string
  kind: 'window-open' | 'anchor' | 'download'
}

/** Components that must import the in-app viewer (issue #188 audit table). */
export const KNOWN_SURFACES: readonly string[] = [
  'components/admin/TipsClient.tsx',
  'components/admin/TasksClient.tsx',
  'components/admin/EventBuilder.tsx',
  'components/admin/PipelinePanel.tsx',
  'components/worker/WorkerEventsClient.tsx',
  'components/admin/EventStaffingModal.tsx',
  'components/admin/CalendarClient.tsx',
  'components/admin/CalendarEventFormModal.tsx',
  'components/GuideReaderContent.tsx',
  'components/admin/GuidesClient.tsx',
  'components/admin/RosterClient.tsx',
  'components/admin/FtpFourHourPanel.tsx',
  'components/admin/FileBrowser.tsx',
  'components/admin/SupplierInvoicesClient.tsx',
]

/** Viewer imports that satisfy a `KNOWN_SURFACES` entry. */
export const VIEWER_IMPORTS: readonly string[] = [
  '@/components/ui/PdfViewerModal',
  '@/components/ui/PdfDocumentView',
]

/** PDF routes that must accept `?inline=1` so the viewer can render them. */
export const KNOWN_INLINE_ROUTES: readonly string[] = [
  'app/api/admin/checklists/[id]/pdf/route.ts',
  'app/api/admin/events/[id]/pdf/route.ts',
  'app/api/worker/events/[id]/pdf/route.ts',
  'app/api/admin/guides/[id]/pdf/route.ts',
]

/**
 * The only allowed bypasses. Adding or removing a marker needs a deliberate
 * edit here, so an exemption is reviewer-visible.
 */
export const EXPECTED_EXEMPTIONS: readonly PdfMarker[] = [
  { file: 'components/GuideReaderContent.tsx', reason: 'external PDF URL' },
  { file: 'components/admin/CalendarClient.tsx', reason: 'external PDF URL' },
  { file: 'components/admin/EventStaffingModal.tsx', reason: 'external PDF URL' },
  { file: 'components/admin/FileBrowser.tsx', reason: 'files browse download' },
  { file: 'components/admin/FtpFourHourPanel.tsx', reason: 'csv export' },
  { file: 'components/admin/FtpFourHourPanel.tsx', reason: 'ftp evidence pack' },
  { file: 'components/admin/GiftCardsClient.tsx', reason: 'gift card bulk print' },
  { file: 'components/admin/GuidesClient.tsx', reason: 'external PDF URL' },
  { file: 'components/admin/GuidesClient.tsx', reason: 'guide bulk PDF' },
]

const MARKER_RE = /\/\/\s*pdf-download-ok:\s*(\S.*?)\s*$/i
const PDF_LITERAL_RE = /\/pdf|\.pdf/i

/** The reason on a `// pdf-download-ok: <reason>` line, or null. */
export function markerReason(line: string): string | null {
  const match = MARKER_RE.exec(line)
  return match ? match[1].trim() : null
}

function hasMarker(lines: string[], index: number): boolean {
  return Boolean(markerReason(lines[index] ?? '') ?? markerReason(lines[index - 1] ?? ''))
}

/** Extract every single-, double- or backtick-quoted string from a snippet. */
function quotedStrings(text: string): string[] {
  const out: string[] = []
  const re = /(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text))) out.push(match[2])
  return out
}

function hasPdfLiteral(text: string): boolean {
  return quotedStrings(text).some((value) => PDF_LITERAL_RE.test(value))
}

/**
 * End index (exclusive) of a JSX opening tag starting at `start`, tracking
 * `{}` depth and quotes so `=>` or a `>` inside an expression cannot end it.
 */
function jsxTagEnd(text: string, start: number): number {
  let depth = 0
  let quote: string | null = null
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') depth = Math.max(0, depth - 1)
    else if (ch === '>' && depth === 0) return i + 1
  }
  return -1
}

function anchorTagAt(lines: string[], index: number): string | null {
  if (!/<(?:a|Link)\b/.test(lines[index] ?? '')) return null
  const joined = lines.slice(index, index + 10).join('\n')
  const start = joined.search(/<(?:a|Link)\b/)
  if (start < 0) return null
  const end = jsxTagEnd(joined, start)
  if (end < 0) return null
  return joined.slice(start, end)
}

/**
 * Replace `//` and block comments with spaces, preserving newlines and quoted
 * strings. This keeps line numbers stable while ensuring a commented-out
 * bypass is never flagged. `https://` is intentionally left intact.
 */
export function stripComments(source: string): string {
  let out = ''
  let i = 0
  let state: 'code' | 'line' | 'block' | 'single' | 'double' | 'template' = 'code'
  while (i < source.length) {
    const ch = source[i]
    const next = source[i + 1]
    if (state === 'line') {
      if (ch === '\n') {
        state = 'code'
        out += '\n'
      } else {
        out += ' '
      }
      i++
      continue
    }
    if (state === 'block') {
      if (ch === '*' && next === '/') {
        out += '  '
        i += 2
        state = 'code'
        continue
      }
      out += ch === '\n' ? '\n' : ' '
      i++
      continue
    }
    if (state === 'single' || state === 'double' || state === 'template') {
      out += ch
      if (ch === '\\') {
        if (next !== undefined) {
          out += next
          i += 2
          continue
        }
      } else if (
        (state === 'single' && ch === "'") ||
        (state === 'double' && ch === '"') ||
        (state === 'template' && ch === '`')
      ) {
        state = 'code'
      }
      i++
      continue
    }

    const prev = source[i - 1]
    if (ch === '/' && next === '/' && prev !== ':') {
      state = 'line'
      out += '  '
      i += 2
      continue
    }
    if (ch === '/' && next === '*') {
      state = 'block'
      out += '  '
      i += 2
      continue
    }
    if (ch === "'") {
      state = 'single'
      out += ch
      i++
      continue
    }
    if (ch === '"') {
      state = 'double'
      out += ch
      i++
      continue
    }
    if (ch === '`') {
      state = 'template'
      out += ch
      i++
      continue
    }
    out += ch
    i++
  }
  return out
}

/**
 * Detect PDF bypasses in one source file. Lines with a `pdf-download-ok`
 * marker (same line or one above) are allowed and left out.
 */
export function scanPdfSource(file: string, source: string): PdfViolation[] {
  const rawLines = source.split(/\r?\n/)
  // Comments are blanked for detection but markers still read the raw source.
  const lines = stripComments(source).split(/\r?\n/)
  const violations: PdfViolation[] = []

  for (let i = 0; i < lines.length; i++) {
    if (hasMarker(rawLines, i)) continue
    const line = lines[i] ?? ''

    // 1) window.open(...) with a PDF URL, up to three lines.
    const openAt = line.indexOf('window.open(')
    if (openAt >= 0) {
      const joined = lines.slice(i, i + 3).join('\n').slice(openAt)
      if (hasPdfLiteral(joined)) {
        violations.push({ file, line: i + 1, text: line.trim(), kind: 'window-open' })
        continue
      }
    }

    // 2) an <a>/<Link> tag with a PDF literal and no safe download behaviour.
    const tag = anchorTagAt(lines, i)
    if (tag) {
      const hasTargetBlank = /\btarget\s*=\s*["']_blank["']/.test(tag)
      const hasDownload = /\bdownload(?:\s*=|\s|\/?>)/.test(tag)
      if (hasPdfLiteral(tag) && (hasTargetBlank || !hasDownload)) {
        violations.push({
          file,
          line: i + 1,
          text: tag.replace(/\s+/g, ' ').trim().slice(0, 200),
          kind: 'anchor',
        })
        continue
      }
    }

    // 3) a direct PDF download.
    const downloadAt = line.search(/downloadFile\(|downloadPdfUrl\(|doc\.save\(|\.download\s*=/)
    if (downloadAt >= 0) {
      const joined = lines.slice(i, i + 3).join('\n').slice(downloadAt)
      if (hasPdfLiteral(joined)) {
        violations.push({ file, line: i + 1, text: line.trim(), kind: 'download' })
      }
    }
  }

  return violations
}

/** Every `pdf-download-ok` marker in a source file, for the exemption audit. */
export function collectMarkers(file: string, source: string): PdfMarker[] {
  return source
    .split(/\r?\n/)
    .flatMap((line) => {
      const reason = markerReason(line)
      return reason ? [{ file, reason }] : []
    })
}

/** Format a violation so a failing test names the file, line and matched text. */
export function formatViolation(violation: PdfViolation): string {
  return `${violation.file}:${violation.line} opens a PDF outside the viewer: ${violation.text}`
}
