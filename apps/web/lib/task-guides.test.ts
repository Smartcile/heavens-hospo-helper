import { describe, it, expect } from 'vitest'
import { resolveCompetencyGuideIds } from '@/lib/task-guides'

describe('resolveCompetencyGuideIds', () => {
  it('prefers competencyGuideIds when present', () => {
    expect(
      resolveCompetencyGuideIds({ competencyGuideIds: ['g1'], requiredTrainingIds: ['legacy'] }),
    ).toEqual(['g1'])
  })

  it('treats requiredTrainingIds as a legacy alias for guide ids', () => {
    expect(resolveCompetencyGuideIds({ requiredTrainingIds: ['g1', 'g2'] })).toEqual(['g1', 'g2'])
  })

  it('returns undefined when neither field was sent (leave links untouched)', () => {
    expect(resolveCompetencyGuideIds({})).toBeUndefined()
  })

  it('dedupes and drops non-string ids', () => {
    expect(
      resolveCompetencyGuideIds({ competencyGuideIds: ['g1', 'g1', '', 42, null] }),
    ).toEqual(['g1'])
  })
})
