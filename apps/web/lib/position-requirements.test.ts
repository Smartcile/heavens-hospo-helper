import { describe, it, expect } from 'vitest'
import {
  sectionGuideMap,
  requiredGuideIds,
  resolveReadiness,
  readinessLabel,
  type RequirementInput,
} from './position-requirements'

const sectionGuides = [
  { guideId: 'g1', sectionId: 'bar' },
  { guideId: 'g2', sectionId: 'bar' },
  { guideId: 'g3', sectionId: 'floor' },
  { guideId: 'gX', sectionId: 'kitchen' }, // not a required section
]

function input(over: Partial<RequirementInput> = {}): RequirementInput {
  return {
    explicitGuideIds: [],
    requiredSectionIds: [],
    sectionGuides,
    completedGuideIds: [],
    ...over,
  }
}

describe('sectionGuideMap', () => {
  it('maps only required sections and dedupes', () => {
    const map = sectionGuideMap(['bar', 'floor'], sectionGuides)
    expect(map.get('bar')).toEqual(['g1', 'g2'])
    expect(map.get('floor')).toEqual(['g3'])
    expect(map.has('kitchen')).toBe(false)
  })
})

describe('requiredGuideIds', () => {
  it('unions explicit guides with every required section guide', () => {
    const ids = requiredGuideIds({
      explicitGuideIds: ['g9'],
      requiredSectionIds: ['bar', 'floor'],
      sectionGuides,
    })
    expect(new Set(ids)).toEqual(new Set(['g9', 'g1', 'g2', 'g3']))
  })

  it('dedupes a guide that is both explicit and section-required', () => {
    const ids = requiredGuideIds({ explicitGuideIds: ['g1'], requiredSectionIds: ['bar'], sectionGuides })
    expect(ids.filter((id) => id === 'g1')).toHaveLength(1)
  })
})

describe('resolveReadiness', () => {
  it('is ready with no requirements', () => {
    const r = resolveReadiness(input())
    expect(r.ready).toBe(true)
    expect(r.percent).toBe(100)
    expect(readinessLabel(r)).toBe('NO REQUIREMENTS')
  })

  it('computes missing guides and per-section status', () => {
    const r = resolveReadiness(input({
      requiredSectionIds: ['bar', 'floor'],
      explicitGuideIds: ['g9'],
      completedGuideIds: ['g1', 'g3', 'g9'],
    }))
    expect(new Set(r.requiredGuideIds)).toEqual(new Set(['g1', 'g2', 'g3', 'g9']))
    expect(new Set(r.completed)).toEqual(new Set(['g1', 'g3', 'g9']))
    expect(r.missing).toEqual(['g2'])
    expect(r.requiredCount).toBe(4)
    expect(r.completedCount).toBe(3)
    expect(r.ready).toBe(false)
    expect(readinessLabel(r)).toBe('3/4 TRAINED')

    const bar = r.sections.find((s) => s.sectionId === 'bar')!
    expect(bar.fullyTrained).toBe(false)
    expect(bar.missing).toEqual(['g2'])
    const floor = r.sections.find((s) => s.sectionId === 'floor')!
    expect(floor.fullyTrained).toBe(true)
  })

  it('is ready once every required guide is complete', () => {
    const r = resolveReadiness(input({
      requiredSectionIds: ['bar'],
      completedGuideIds: ['g1', 'g2'],
    }))
    expect(r.ready).toBe(true)
    expect(readinessLabel(r)).toBe('READY')
  })
})
