// Pure P&L budget-line parsing + tree helpers. No I/O — feed it the raw rows
// from read-excel-file (arrays of cells) and get classified lines back.

export type LineKind = 'GROUP' | 'LINE' | 'TOTAL' | 'SKIP'

export interface PnlImportRow {
  label: string
  kind: LineKind
  depth: number
  values: (number | null)[] // aligned with `months`
  sectionId: string | null
  include: boolean
}

export interface PnlImportResult {
  months: string[]
  rows: PnlImportRow[]
}

// Canonical Jun–May financial-year sequence. Index = offset from June.
export const MONTH_SEQUENCE = ['JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC', 'JAN', 'FEB', 'MAR', 'APR', 'MAY'] as const

const MONTH_ALIASES: Record<string, string> = {
  JAN: 'JAN', FEB: 'FEB', MAR: 'MAR', APR: 'APR', MAY: 'MAY', JUN: 'JUN',
  JUL: 'JUL', AUG: 'AUG', SEP: 'SEP', SEPT: 'SEP', OCT: 'OCT', NOV: 'NOV', DEC: 'DEC',
}

export function normalizeLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value.replace(/[,$\s]/g, ''))
    if (Number.isFinite(n)) return n
  }
  return null
}

interface MonthHeader {
  months: string[]
  rowIndex: number
  cols: number[]
}

// Finds the row that lists month columns (e.g. JUN..MAY). Scans the first
// 15 rows so a title/company banner row above the header is tolerated.
export function findMonthRow(rows: unknown[][]): MonthHeader | null {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const found: { name: string; col: number }[] = []
    for (let c = 0; c < rows[r].length; c++) {
      const label = normalizeLabel(rows[r][c])
      if (!label) continue
      const canon = MONTH_ALIASES[label.toUpperCase().replace(/\./g, '')]
      if (canon && found.length < 12 && !found.some((f) => f.name === canon)) {
        found.push({ name: canon, col: c })
      }
    }
    if (found.length >= 2) {
      return { months: found.map((f) => f.name), rowIndex: r, cols: found.map((f) => f.col) }
    }
  }
  return null
}

// Classifies worksheet rows into budget lines:
// - text in column A → root GROUP (depth 0)
// - label-only text in column B → sub GROUP (depth 1)
// - label + values → LINE, or TOTAL when the label contains "TOTAL"
// - labels containing "%" → SKIP (margin rows)
// - value rows after a TOTAL are standalone computed rows (depth 0)
export function parsePnlRows(rows: unknown[][]): PnlImportResult {
  const header = findMonthRow(rows)
  const months = header?.months ?? []
  const cols = header?.cols ?? []
  const out: PnlImportRow[] = []

  let currentGroupDepth = -1 // depth of the most recent GROUP row
  let afterTotal = false // value rows following a TOTAL are standalone (depth 0) until the next GROUP

  const start = (header?.rowIndex ?? -1) + 1
  for (let r = start; r < rows.length; r++) {
    const cells = rows[r]
    const colA = normalizeLabel(cells[0])
    const colB = normalizeLabel(cells[1])
    const label = colA ?? colB
    if (!label) continue

    const values = cols.map((c) => toNumber(cells[c]))
    // With no month header there are no value columns to check, so fall back
    // to scanning the whole row for numeric content.
    const hasNumeric = months.length > 0
      ? values.some((v) => v !== null)
      : cells.some((c) => toNumber(c) !== null)

    if (label.includes('%')) {
      out.push({ label, kind: 'SKIP', depth: 0, values, sectionId: null, include: false })
      continue
    }

    if (colA) {
      out.push({ label, kind: 'GROUP', depth: 0, values, sectionId: null, include: true })
      currentGroupDepth = 0
      afterTotal = false
    } else if (!hasNumeric) {
      out.push({ label, kind: 'GROUP', depth: 1, values, sectionId: null, include: true })
      currentGroupDepth = 1
      afterTotal = false
    } else {
      const isTotal = label.toUpperCase().includes('TOTAL')
      const depth = afterTotal ? 0 : currentGroupDepth + 1
      out.push({ label, kind: isTotal ? 'TOTAL' : 'LINE', depth, values, sectionId: null, include: true })
      afterTotal = isTotal || afterTotal
    }
  }

  return { months, rows: out }
}

// Derives each row's parent index from its depth. GROUP rows are the only
// parents; LINE/TOTAL rows are leaves. Returns parentIndex per row (null = root).
export function assignParentIndexes(rows: PnlImportRow[]): (number | null)[] {
  const stack: number[] = []
  return rows.map((row, i) => {
    while (stack.length > 0 && rows[stack[stack.length - 1]].depth >= row.depth) stack.pop()
    const parent = stack.length > 0 ? stack[stack.length - 1] : null
    if (row.kind === 'GROUP') stack.push(i)
    return parent
  })
}

// Maps a canonical month name to a calendar month/year given the base year
// (the year containing June — the financial-year start). JUN–DEC stay in the
// base year; JAN–MAY roll into the next.
const MONTH_NUMBERS: Record<string, number> = {
  JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5,
}

export function monthYearForName(name: string, baseYear: number): { month: number; year: number } {
  const idx = MONTH_SEQUENCE.indexOf(name as (typeof MONTH_SEQUENCE)[number])
  const safe = idx < 0 ? 0 : idx
  return {
    month: MONTH_NUMBERS[name] ?? 6,
    year: baseYear + (safe >= 7 ? 1 : 0),
  }
}

// --- Tree building (used by the API + panel) ---

export interface LineTreeItem {
  id: string
  name: string
  kind: Exclude<LineKind, 'SKIP'>
  parentId: string | null
  sectionId: string | null
  sectionName: string | null
  amount: number | null
  total: number | null // computed sum for TOTAL rows
  children: LineTreeItem[]
}

export interface FlatLine {
  id: string
  name: string
  kind: Exclude<LineKind, 'SKIP'>
  parentId: string | null
  sectionId: string | null
  sectionName?: string | null
  amount: number | null
  sortOrder?: number
}

// Builds the display tree from flat lines. TOTAL rows show `total` = sum of
// the LINE siblings under the same parent (the workbook layout: a TOTAL row
// sits next to the lines it sums, both children of the enclosing group).
export function buildLineTree(lines: FlatLine[]): LineTreeItem[] {
  const nodes = new Map<string, LineTreeItem>(
    lines.map((l) => [
      l.id,
      {
        id: l.id,
        name: l.name,
        kind: l.kind,
        parentId: l.parentId,
        sectionId: l.sectionId,
        sectionName: l.sectionName ?? null,
        amount: l.kind === 'LINE' ? (l.amount ?? 0) : null,
        total: null,
        children: [],
      },
    ])
  )

  const roots: LineTreeItem[] = []
  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId)) {
      nodes.get(node.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  for (const node of nodes.values()) {
    if (node.kind !== 'TOTAL') continue
    const siblings = node.parentId && nodes.has(node.parentId)
      ? nodes.get(node.parentId)!.children
      : roots
    node.total = siblings
      .filter((s) => s.kind === 'LINE')
      .reduce((sum, s) => sum + (s.amount ?? 0), 0)
  }

  return roots
}

// Sums the totals of a line tree for a grand venue-wide figure.
export function treeTotal(nodes: LineTreeItem[]): number {
  let total = 0
  for (const node of nodes) {
    if (node.kind === 'LINE') total += node.amount ?? 0
    total += treeTotal(node.children)
  }
  return total
}
