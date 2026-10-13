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
