export interface FillCell {
  row: number
  col: number
}

export interface FillRect {
  rowMin: number
  rowMax: number
  colMin: number
  colMax: number
}

export function fillRect(a: FillCell, b: FillCell): FillRect {
  return {
    rowMin: Math.min(a.row, b.row),
    rowMax: Math.max(a.row, b.row),
    colMin: Math.min(a.col, b.col),
    colMax: Math.max(a.col, b.col),
  }
}

export function inFillRect(cell: FillCell, rect: FillRect): boolean {
  return cell.row >= rect.rowMin && cell.row <= rect.rowMax && cell.col >= rect.colMin && cell.col <= rect.colMax
}

export function fillTargets(source: FillCell, rect: FillRect): FillCell[] {
  const out: FillCell[] = []
  for (let row = rect.rowMin; row <= rect.rowMax; row++) {
    for (let col = rect.colMin; col <= rect.colMax; col++) {
      if (row === source.row && col === source.col) continue
      out.push({ row, col })
    }
  }
  return out
}

/**
 * Inclusive index range between an anchor and a target — used by shift-click
 * selection on the availability grids. Works backwards and never goes below 0.
 */
export function dayRange(anchorIndex: number, targetIndex: number): number[] {
  const a = Math.max(0, Math.floor(anchorIndex))
  const b = Math.max(0, Math.floor(targetIndex))
  const start = Math.min(a, b)
  const end = Math.max(a, b)
  const out: number[] = []
  for (let i = start; i <= end; i++) out.push(i)
  return out
}

/** Toggle one key in a selection set (returns a new set). */
export function toggleSelection(current: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(current)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return next
}
