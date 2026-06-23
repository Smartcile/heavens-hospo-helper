import polygonClipping from 'polygon-clipping'
// @ts-expect-error polygon-offset has no types
import PolygonOffset from 'polygon-offset'

type Pair = [number, number]

export interface BoothResult {
  outerVertices: { x: number; y: number }[]
  cushionVertices: { x: number; y: number }[]
  bx: number; by: number; bw: number; bd: number
}

function squareToRing(x: number, y: number, s: number): Pair[] {
  return [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]]
}

export function traceBoothPerimeter(cells: Set<string>, blockSize = 50): BoothResult | null {
  if (cells.size === 0) return null
  const rings: Pair[][] = []
  for (const key of cells) {
    const [c, r] = key.split(',').map(Number)
    rings.push(squareToRing(c * blockSize, r * blockSize, blockSize))
  }
  // Single square — no union needed
  if (rings.length === 1) {
    const first = rings[0]
    const xs = first.map(p => p[0]); const ys = first.map(p => p[1])
    const [minX, minY, maxX, maxY] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
    const [bw, bd] = [maxX - minX, maxY - minY]
    const outerVertices = first.map(p => ({ x: p[0] - minX, y: p[1] - minY }))
    const inset = Math.min(8, bw / 2, bd / 2)
    const cushionVertices = [{ x: inset, y: inset }, { x: bw - inset, y: inset }, { x: bw - inset, y: bd - inset }, { x: inset, y: bd - inset }, { x: inset, y: inset }]
    return { outerVertices, cushionVertices, bx: minX, by: minY, bw, bd }
  }
  // Union all squares into one outer ring
  const polygons = rings.map(r => [r])
  const union = polygonClipping.union(polygons[0], ...polygons.slice(1))
  const outerRing: Pair[] = union[0][0]
  const xs = outerRing.map(p => p[0]); const ys = outerRing.map(p => p[1])
  const [minX, minY, maxX, maxY] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
  const [bw, bd] = [maxX - minX, maxY - minY]
  const outerVertices = outerRing.map(p => ({ x: p[0] - minX, y: p[1] - minY }))
  let cushionRing: Pair[]
  try {
    const off = new PolygonOffset()
    const cushion = off.offset(outerRing, -8)
    cushionRing = cushion[0]?.[0] ?? outerRing
  } catch { cushionRing = outerRing }
  const cushionVertices = cushionRing.map(p => ({ x: p[0] - minX, y: p[1] - minY }))
  return { outerVertices, cushionVertices, bx: minX, by: minY, bw, bd }
}
