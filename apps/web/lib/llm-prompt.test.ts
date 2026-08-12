import { describe, it, expect } from 'vitest'
import { buildDensityPrompt, parseDensityFromAnswer } from '@/lib/llm-prompt'

describe('buildDensityPrompt', () => {
  it('names the item being set up', () => {
    expect(buildDensityPrompt({ itemName: 'FLOUR - 00' })).toContain('FLOUR - 00')
  })

  it('asks for the metric-cup conversion', () => {
    const p = buildDensityPrompt({ itemName: 'SUGAR' })
    expect(p).toContain('METRIC cup (250 mL)')
    expect(p).toContain('DENSITY:')
  })

  it('asks for per-unit weight when includePerUnit', () => {
    const withUnit = buildDensityPrompt({ itemName: 'EGG', includePerUnit: true })
    expect(withUnit).toContain('1 UNIT:')
    const without = buildDensityPrompt({ itemName: 'FLOUR', includePerUnit: false })
    expect(without).not.toContain('1 UNIT:')
  })
})

describe('parseDensityFromAnswer', () => {
  it('parses the DENSITY: line', () => {
    const answer = [
      'DENSITY: 0.528 g/mL (ESTIMATE)',
      '1 CUP: 132 g',
      'TYPE: DRY',
    ].join('\n')
    expect(parseDensityFromAnswer(answer)).toBeCloseTo(0.528, 3)
  })

  it('parses a bare g/mL figure anywhere', () => {
    expect(parseDensityFromAnswer('the density is about 0.845 g/mL')).toBeCloseTo(0.845, 3)
  })

  it('parses "density = 1.03" style lines', () => {
    expect(parseDensityFromAnswer('density = 1.03')).toBeCloseTo(1.03, 3)
  })

  it('returns null for unparseable or empty answers', () => {
    expect(parseDensityFromAnswer('')).toBeNull()
    expect(parseDensityFromAnswer('1 CUP: 132 g')).toBeNull()
    expect(parseDensityFromAnswer('I do not know')).toBeNull()
  })

  it('rejects out-of-range densities', () => {
    expect(parseDensityFromAnswer('DENSITY: 12.5 g/mL')).toBeNull()
  })
})
