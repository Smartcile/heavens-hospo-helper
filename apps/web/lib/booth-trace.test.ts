import { describe, it, expect } from 'vitest'
import { traceBoothPerimeter } from '@/lib/booth-trace'

describe('traceBoothPerimeter', () => {
  it('returns null for empty cells', () => {
    expect(traceBoothPerimeter(new Set())).toBeNull()
  })

  it('returns a result for a single cell', () => {
    const cells = new Set(['0,0'])
    const result = traceBoothPerimeter(cells, 50)
    expect(result).not.toBeNull()
    expect(result!.bx).toBe(0)
    expect(result!.by).toBe(0)
    expect(result!.bw).toBe(50)
    expect(result!.bd).toBe(50)
    expect(result!.outerVertices.length).toBeGreaterThan(0)
    expect(result!.cushionVertices.length).toBeGreaterThan(0)
  })

  it('returns correct bounding box', () => {
    const cells = new Set(['0,0'])
    const result = traceBoothPerimeter(cells, 100)
    expect(result!.bw).toBe(100)
    expect(result!.bd).toBe(100)
  })

  it('handles multiple cells via union', () => {
    const cells = new Set(['0,0', '1,0'])
    const result = traceBoothPerimeter(cells, 50)
    expect(result).not.toBeNull()
    expect(result!.bw).toBe(100)
    expect(result!.bd).toBe(50)
  })

  it('handles L-shape pattern', () => {
    const cells = new Set(['0,0', '1,0', '0,1'])
    const result = traceBoothPerimeter(cells, 50)
    expect(result).not.toBeNull()
    expect(result!.bw).toBe(100)
    expect(result!.bd).toBe(100)
  })
})
