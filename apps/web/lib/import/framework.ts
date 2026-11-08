import type { ImportRow, ImportRowAction, ImportSummary } from './types'

export function setRowInclude<T>(rows: ImportRow<T>[], id: string, include: boolean): ImportRow<T>[] {
  return rows.map((row) => (row.id === id ? { ...row, include } : row))
}

export function setRowAction<T>(rows: ImportRow<T>[], id: string, action: ImportRowAction): ImportRow<T>[] {
  return rows.map((row) => (row.id === id ? { ...row, action, include: action !== 'SKIP' } : row))
}

/** Patch part of one row's values (e.g. a per-row REPLACE LINES toggle). */
export function patchRowValues<T>(rows: ImportRow<T>[], id: string, patch: Partial<T>): ImportRow<T>[] {
  return rows.map((row) => (row.id === id ? { ...row, values: { ...row.values, ...patch } } : row))
}

export function includedRows<T>(rows: ImportRow<T>[]): ImportRow<T>[] {
  return rows.filter((row) => row.include && row.action !== 'SKIP')
}

export function summariseRows<T>(rows: ImportRow<T>[]): ImportSummary {
  const selected = includedRows(rows)
  return {
    created: selected.filter((r) => r.action === 'CREATE').length,
    updated: selected.filter((r) => r.action === 'UPDATE').length,
    revived: selected.filter((r) => r.action === 'REVIVE').length,
    skipped: rows.length - selected.length,
    warnings: selected.flatMap((r) => r.issues.filter((i) => i.severity !== 'INFO').map((i) => i.message)),
  }
}

/** Payload the server route consumes. The server re-validates everything. */
export function rowsToPayload<T>(rows: ImportRow<T>[]): { action: ImportRowAction; targetId?: string; values: T }[] {
  return includedRows(rows).map((row) => ({ action: row.action, targetId: row.match?.targetId, values: row.values }))
}
