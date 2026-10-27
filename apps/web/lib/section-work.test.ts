import { describe, it, expect } from 'vitest'
import {
  combineSectionWorkEvidence,
  describeSectionWorkEvidence,
  evidenceGuideIds,
  evidencePathwayId,
  isPathwayComplete,
  sectionGuideProgress,
  sectionWorkSourceForEvidence,
} from '@/lib/section-work'

const guide = (
  guideId: string,
  sectionId = 'sec1',
  overrides: Partial<{ status: string; isTracked: boolean }> = {},
) => ({
  guideId,
  sectionId,
  status: overrides.status ?? 'PUBLISHED',
  isTracked: overrides.isTracked ?? true,
})

describe('sectionGuideProgress', () => {
  it('is never complete when the section has zero guides', () => {
    const result = sectionGuideProgress('sec1', [], new Set())
    expect(result.eligible).toBe(false)
    expect(result.complete).toBe(false)
  })

  it('is eligible but not complete when some guides are missing', () => {
    const result = sectionGuideProgress('sec1', [guide('g1'), guide('g2')], new Set(['g1']))
    expect(result.eligible).toBe(true)
    expect(result.complete).toBe(false)
    expect(result.missingGuideIds).toEqual(['g2'])
  })

  it('is complete when every required guide is done', () => {
    const result = sectionGuideProgress('sec1', [guide('g1'), guide('g2')], new Set(['g1', 'g2']))
    expect(result.complete).toBe(true)
    expect(result.completedGuideIds).toEqual(['g1', 'g2'])
  })

  it('ignores drafts, untracked guides and other sections', () => {
    const result = sectionGuideProgress(
      'sec1',
      [
        guide('g1'),
        guide('draft', 'sec1', { status: 'DRAFT' }),
        guide('reference', 'sec1', { isTracked: false }),
        guide('other', 'sec2'),
      ],
      new Set(['g1']),
    )
    expect(result.requiredGuideIds).toEqual(['g1'])
    expect(result.complete).toBe(true)
  })
})

describe('isPathwayComplete', () => {
  it('is true when any milestone is DONE', () => {
    expect(
      isPathwayComplete({
        nodes: [
          { kind: 'GUIDE', status: 'DONE' },
          { kind: 'MILESTONE', status: 'DONE' },
        ],
      }),
    ).toBe(true)
  })

  it('is false when the pathway is missing or the milestone is not done', () => {
    expect(isPathwayComplete(null)).toBe(false)
    expect(isPathwayComplete({ nodes: [{ kind: 'MILESTONE', status: 'AVAILABLE' }] })).toBe(false)
  })
})

describe('section-work evidence', () => {
  it('records both guide and pathway evidence in a stable signature', () => {
    const evidence = combineSectionWorkEvidence({ guideIds: ['g2', 'g1'], pathwayId: 'p1' })
    expect(evidence).toBe('GUIDES:g1,g2|PATHWAY:p1')
    expect(evidenceGuideIds(evidence)).toEqual(['g1', 'g2'])
    expect(evidencePathwayId(evidence)).toBe('p1')
    expect(sectionWorkSourceForEvidence(evidence)).toBe('PATHWAY')
    expect(describeSectionWorkEvidence(evidence)).toBe('PATHWAY MILESTONE · 2 GUIDES COMPLETE')
  })

  it('returns null when there is no qualifying evidence', () => {
    expect(combineSectionWorkEvidence({})).toBeNull()
    expect(describeSectionWorkEvidence(null)).toBe('NO EVIDENCE')
    expect(sectionWorkSourceForEvidence(null)).toBe('GUIDES')
  })
})
