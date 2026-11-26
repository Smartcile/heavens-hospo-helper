// Tips hours importer — pure copy-paste-LLM prompt + tolerant parser (#180).
//
// The manager pastes a simple hours list (or a Markdown table) into an external
// LLM, then pastes the answer back. Rows are previewed before being merged into
// the period draft CLIENT-SIDE: an unknown name becomes a manual row on this
// period only and never creates a Staff record.

import { extractJsonBlock, normaliseMenuName } from '@/lib/menu-import'
import { normaliseImportKey } from './similarity'
import type { ImportExisting, ImportIssue, ImportParseResult, ImportRow, ImportSummary } from './types'
import type { TipsShareRow } from '@/lib/tips'

export interface TipsImportValues {
  name: string
  hours: number
  /** Explicit share weight, or null when the source did not state one. */
  weight: number | null
}

export function buildTipsImportPrompt({
  venueName,
  staffNames,
  fromDate,
  toDate,
}: {
  venueName?: string
  staffNames?: readonly string[]
  fromDate?: string
  toDate?: string
} = {}): string {
  const venue = venueName?.trim() ? ` for ${venueName.trim()}` : ''
  const period = fromDate && toDate ? ` covering ${fromDate} to ${toDate}` : ''
  const names =
    staffNames && staffNames.length > 0
      ? staffNames.map((n) => `- ${n}`).join('\n')
      : '- (no staff list supplied - use the names exactly as written in the source)'
  return [
    `I'm importing staff hours into a tip-pool period${venue}${period}.`,
    `Read the attached document and return the staff hours as STRICT JSON in one fenced \`\`\`json block,`,
    `or as a Markdown table with the columns NAME | HOURS | WEIGHT.`,
    `Do not add commentary.`,
    ``,
    `JSON shape:`,
    `{`,
    `  "staff": [`,
    `    { "name": "LIAM SMITH", "hours": 705, "weight": 1 },`,
    `    { "name": "SHAYNA JONES", "hours": 634 }`,
    `  ]`,
    `}`,
    ``,
    `Rules:`,
    `- name is the person's full name, UPPERCASE, exactly as in the staff list below.`,
    `- hours is a number as written in the source. Do NOT convert minutes to hours or the reverse.`,
    `- weight is optional; leave it out unless the source states a share weight.`,
    `- Use one row per person. Never invent a person or an hours figure.`,
    ``,
    `Venue staff names:`,
    names,
  ].join('\n')
}

/**
 * Hours coercion: `"12.5 hrs"` → 12.5, `"12,5"` → 12.5, `"1,234"` → 1234.
 * Returns null for blank/unparseable values (never 0-by-accident).
 */
export function parseTipHours(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const raw = value.replace(/\s*(?:hrs?|hours?)\s*$/i, '').trim()
  if (!raw) return null
  const cleaned = raw.replace(/[^0-9.,-]/g, '')
  if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === ',') return null
  // A comma is a decimal separator unless it groups thousands ("1,234").
  const normalised = /^[+-]?\d{1,3}(,\d{3})+$/.test(cleaned)
    ? cleaned.replace(/,/g, '')
    : cleaned.replace(/,/g, '.')
  const n = Number(normalised)
  return Number.isFinite(n) ? n : null
}

/** Optional weight coercion (`"1.5"`, `"0,25"`). Negative/blank → null. */
export function parseTipWeight(value: unknown): number | null {
  const n = parseTipHours(value)
  return n != null && n >= 0 ? n : null
}

function readString(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function readValue(source: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key]
  }
  return undefined
}

export function tipsImportRowFromRecord(
  source: Record<string, unknown>,
  id: string,
): { row: ImportRow<TipsImportValues>; issues: ImportIssue[] } {
  const issues: ImportIssue[] = []
  const name = normaliseMenuName(
    readString(source, ['name', 'staffName', 'staff', 'employee', 'person']),
  )
  if (!name) {
    return {
      issues: [{ code: 'TIPS_NAME_MISSING', severity: 'ERROR', rowId: id, message: 'A ROW HAS NO NAME - SKIPPED' }],
      row: {
        id,
        values: { name: '', hours: 0, weight: null },
        include: false,
        action: 'SKIP',
        match: { status: 'NEW' },
        issues,
      },
    }
  }

  const hours = parseTipHours(readValue(source, ['hours', 'totalHours', 'hoursWorked', 'hrs']))
  if (hours == null) {
    issues.push({
      code: 'TIPS_HOURS_INVALID',
      severity: 'ERROR',
      rowId: id,
      field: 'hours',
      message: `"${name}" HAS NO VALID HOURS`,
    })
  } else if (hours < 0) {
    issues.push({
      code: 'TIPS_HOURS_NEGATIVE',
      severity: 'ERROR',
      rowId: id,
      field: 'hours',
      message: `"${name}" HAS NEGATIVE HOURS`,
    })
  }

  const weight = parseTipWeight(readValue(source, ['weight', 'shareWeight', 'share']))
  const hasError = issues.some((issue) => issue.severity === 'ERROR')

  return {
    row: {
      id,
      values: { name, hours: hours ?? 0, weight },
      include: !hasError,
      action: hasError ? 'SKIP' : 'CREATE',
      match: { status: 'NEW' },
      issues,
    },
    issues,
  }
}

/** Parse a Markdown table into header→cell records (pipe rows only). */
export function parseMarkdownTable(text: string): Record<string, string>[] | null {
  const lines = text.split(/\r?\n/).filter((line) => line.includes('|'))
  if (lines.length < 2) return null
  const cellsOf = (line: string): string[] =>
    line
      .replace(/^\s*\|/, '')
      .replace(/\|\s*$/, '')
      .split('|')
      .map((cell) => cell.trim())
  const header = cellsOf(lines[0])
  const isSeparator = (cells: string[]) => cells.every((cell) => /^:?-{2,}:?$/.test(cell))
  const body = isSeparator(cellsOf(lines[1])) ? lines.slice(2) : lines.slice(1)

  const keyFor = (label: string): string | null => {
    const key = normaliseImportKey(label)
    if (key.includes('NAME') || key.includes('STAFF') || key.includes('PERSON')) return 'name'
    if (key.includes('HOUR')) return 'hours'
    if (key.includes('WEIGHT') || key.includes('SHARE')) return 'weight'
    return null
  }

  const keys = header.map(keyFor)
  if (!keys.includes('name') || !keys.includes('hours')) return null

  const records: Record<string, string>[] = []
  for (const line of body) {
    const cells = cellsOf(line)
    if (cells.every((cell) => !cell)) continue
    const record: Record<string, string> = {}
    keys.forEach((key, index) => {
      if (key) record[key] = cells[index] ?? ''
    })
    if (record.name) records.push(record)
  }
  return records.length > 0 ? records : null
}

function dedupeIssues(rows: ImportRow<TipsImportValues>[]): ImportIssue[] {
  const seen = new Set<string>()
  const issues: ImportIssue[] = []
  for (const row of rows) {
    const key = normaliseImportKey(row.values.name)
    if (!key) continue
    if (seen.has(key)) {
      const issue: ImportIssue = {
        code: 'TIPS_DUPLICATE_IN_FILE',
        severity: 'WARNING',
        rowId: row.id,
        field: 'name',
        message: `"${row.values.name}" APPEARS MORE THAN ONCE - THE LATER ROW IS SKIPPED`,
      }
      row.issues.push(issue)
      row.include = false
      row.action = 'SKIP'
      row.match = { status: 'DUPLICATE_IN_FILE', label: row.values.name }
      issues.push(issue)
    } else {
      seen.add(key)
    }
  }
  return issues
}

export function parseTipsImportAnswer(
  raw: string,
): ImportParseResult<TipsImportValues> | { error: string } {
  const records: Record<string, unknown>[] = []
  const json = extractJsonBlock(raw)
  if (json) {
    let root: unknown
    try {
      root = JSON.parse(json)
    } catch {
      return { error: 'THE ANSWER IS NOT VALID JSON' }
    }
    const container = Array.isArray(root) ? root : [root]
    const first = container[0]
    if (first && typeof first === 'object') {
      const object = first as Record<string, unknown>
      const list = Array.isArray(object.staff)
        ? object.staff
        : Array.isArray(object.rows)
          ? object.rows
          : Array.isArray(object.shares)
            ? object.shares
            : Array.isArray(object.people)
              ? object.people
              : null
      if (list) {
        for (const item of list) if (item && typeof item === 'object') records.push(item as Record<string, unknown>)
      } else {
        records.push(object)
      }
    }
  } else {
    const table = parseMarkdownTable(raw)
    if (!table) return { error: 'NO JSON OR MARKDOWN TABLE FOUND IN THE ANSWER' }
    for (const item of table) records.push(item)
  }

  if (records.length === 0) return { error: 'NO STAFF ROWS FOUND IN THE ANSWER' }

  const rows: ImportRow<TipsImportValues>[] = []
  const issues: ImportIssue[] = []
  records.forEach((record, index) => {
    const parsed = tipsImportRowFromRecord(record, `t${index}`)
    rows.push(parsed.row)
    issues.push(...parsed.issues)
  })
  issues.push(...dedupeIssues(rows))

  return { rows, issues }
}

/**
 * Match rows to the venue's staff by exact normalised full name.
 *   - one match  → MATCH (UPDATE when the person is already on the period)
 *   - no match   → NEW (a manual row on this period; never creates Staff)
 *   - many       → AMBIGUOUS, skipped rather than guessing
 */
export function matchTipsImportRows(
  rows: ImportRow<TipsImportValues>[],
  existingStaff: ImportExisting[],
  onPeriodStaffIds: Iterable<string> = [],
): ImportRow<TipsImportValues>[] {
  const byName = new Map<string, ImportExisting[]>()
  for (const person of existingStaff) {
    const key = normaliseImportKey(person.name)
    if (!key) continue
    const list = byName.get(key) ?? []
    list.push(person)
    byName.set(key, list)
  }
  const onPeriod = new Set(onPeriodStaffIds)

  return rows.map((row) => {
    // A parse error / duplicate stays exactly as it is.
    if (row.issues.some((issue) => issue.severity === 'ERROR') || row.match?.status === 'DUPLICATE_IN_FILE') {
      return row
    }
    const key = normaliseImportKey(row.values.name)
    const matches = key ? byName.get(key) ?? [] : []
    if (matches.length === 0) {
      return { ...row, action: 'CREATE', match: { status: 'NEW', label: 'MANUAL ROW' } }
    }
    if (matches.length > 1) {
      return {
        ...row,
        include: false,
        action: 'SKIP',
        match: { status: 'AMBIGUOUS', label: `${matches.length} PEOPLE` },
      }
    }
    const person = matches[0]
    const alreadyOn = onPeriod.has(person.id)
    return {
      ...row,
      include: true,
      action: alreadyOn ? 'UPDATE' : 'CREATE',
      match: {
        status: 'MATCH',
        targetId: person.id,
        label: alreadyOn ? `${person.name} · ON PERIOD` : person.name,
      },
    }
  })
}

/**
 * Merge reviewed rows into the period draft. Matched staff update their existing
 * row (or are added); unmatched names become manual rows. Nothing is persisted
 * here and no Staff record is written.
 */
export function applyTipsImport(
  rows: readonly ImportRow<TipsImportValues>[],
  shares: readonly TipsShareRow[],
): { shares: TipsShareRow[]; summary: ImportSummary } {
  const merged = [...shares]
  let created = 0
  let updated = 0
  let skipped = 0
  const warnings: string[] = []

  for (const row of rows) {
    if (!row.include || row.action === 'SKIP') {
      skipped++
      continue
    }
    const values = row.values
    const staffId = row.match?.status === 'MATCH' ? row.match.targetId ?? null : null
    const existingIndex = staffId
      ? merged.findIndex((share) => share.staffId === staffId)
      : merged.findIndex(
          (share) => !share.staffId && normaliseImportKey(share.name) === normaliseImportKey(values.name),
        )

    if (existingIndex >= 0) {
      const existing = merged[existingIndex]
      merged[existingIndex] = {
        ...existing,
        hours: values.hours,
        shareWeight: values.weight != null ? values.weight : existing.shareWeight,
      }
      updated++
      continue
    }

    merged.push({
      staffId,
      name: values.name,
      hours: values.hours,
      shareWeight: values.weight != null ? values.weight : 1,
      sortOrder: merged.length,
      status: 'PLANNED',
    })
    created++
    if (!staffId && row.match?.status === 'NEW') {
      warnings.push(`${values.name} IS NOT IN THE STAFF LIST - ADDED AS A MANUAL ROW ON THIS PERIOD ONLY`)
    }
  }

  return {
    shares: merged.map((share, index) => ({ ...share, sortOrder: index })),
    summary: { created, updated, revived: 0, skipped, warnings },
  }
}
