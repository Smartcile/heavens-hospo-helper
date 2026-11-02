import { describe, it, expect } from 'vitest'
import {
  guideSource,
  guideAppliesTo,
  guideWhereOr,
  type GuideAudienceInput,
  type StaffContext,
} from './guides'

function guide(over: Partial<GuideAudienceInput> = {}): GuideAudienceInput {
  return { id: 'g1', isOnboarding: false, departmentId: null, audiences: [], ...over }
}

function ctx(over: Partial<StaffContext> = {}): StaffContext {
  return {
    departmentId: null,
    sectionIds: new Set(),
    positionIds: new Set(),
    assignedGuideIds: new Set(),
    ...over,
  }
}

describe('guideSource', () => {
  it('returns null when nothing matches', () => {
    expect(guideSource(guide(), ctx())).toBeNull()
  })

  it('matches onboarding guides for everyone, including staff with no department', () => {
    expect(guideSource(guide({ isOnboarding: true }), ctx())).toBe('ONBOARDING')
    expect(guideSource(guide({ isOnboarding: true }), ctx({ departmentId: 'd1' }))).toBe('ONBOARDING')
  })

  it('matches on department via the legacy column', () => {
    expect(guideSource(guide({ departmentId: 'd1' }), ctx({ departmentId: 'd1' }))).toBe('DEPARTMENT')
  })

  it('matches on department via an audience row', () => {
    const g = guide({ audiences: [{ kind: 'DEPARTMENT', targetId: 'd1' }] })
    expect(guideSource(g, ctx({ departmentId: 'd1' }))).toBe('DEPARTMENT')
  })

  // The whole point of tagging a guide to a station: every barista inherits it
  // without anyone assigning it by hand.
  it('matches a section the staff member works', () => {
    const g = guide({ audiences: [{ kind: 'SECTION', targetId: 'sec-coffee' }] })
    expect(guideSource(g, ctx({ sectionIds: new Set(['sec-coffee']) }))).toBe('SECTION')
  })

  it('does not match a section the staff member does not work', () => {
    const g = guide({ audiences: [{ kind: 'SECTION', targetId: 'sec-coffee' }] })
    expect(guideSource(g, ctx({ sectionIds: new Set(['sec-bar']) }))).toBeNull()
  })

  it('matches a position the staff member holds', () => {
    const g = guide({ audiences: [{ kind: 'POSITION', targetId: 'pos-bartender' }] })
    expect(guideSource(g, ctx({ positionIds: new Set(['pos-bartender']) }))).toBe('POSITION')
  })

  it('matches any one of several positions held', () => {
    const g = guide({ audiences: [{ kind: 'POSITION', targetId: 'pos-dm' }] })
    const c = ctx({ positionIds: new Set(['pos-bartender', 'pos-barista', 'pos-dm']) })
    expect(guideSource(g, c)).toBe('POSITION')
  })

  it('does not cross-match a section id against a position audience', () => {
    const g = guide({ audiences: [{ kind: 'POSITION', targetId: 'x1' }] })
    expect(guideSource(g, ctx({ sectionIds: new Set(['x1']) }))).toBeNull()
  })

  it('matches when any one of several audiences hits', () => {
    const g = guide({
      audiences: [
        { kind: 'SECTION', targetId: 'sec-kitchen' },
        { kind: 'SECTION', targetId: 'sec-bar' },
      ],
    })
    expect(guideSource(g, ctx({ sectionIds: new Set(['sec-bar']) }))).toBe('SECTION')
  })

  it('does not match a different department', () => {
    expect(guideSource(guide({ departmentId: 'd1' }), ctx({ departmentId: 'd2' }))).toBeNull()
  })

  it('does not match a department-scoped guide for staff with no department', () => {
    expect(guideSource(guide({ departmentId: 'd1' }), ctx({ departmentId: null }))).toBeNull()
  })

  it('never matches a null department against a null staff department', () => {
    // Regression: `null === null` would make every unscoped guide apply to
    // every departmentless staff member.
    expect(guideSource(guide({ departmentId: null }), ctx({ departmentId: null }))).toBeNull()
  })

  // Regression for the worker-side bug: individually assigned guides were shown
  // in the admin modal but omitted from the worker API's filter, so they never
  // reached the staff member's phone.
  it('matches an individually assigned guide', () => {
    expect(guideSource(guide(), ctx({ assignedGuideIds: new Set(['g1']) }))).toBe('ASSIGNED')
  })

  it('prefers ASSIGNED over ONBOARDING and DEPARTMENT', () => {
    const g = guide({ isOnboarding: true, departmentId: 'd1' })
    const c = ctx({ departmentId: 'd1', assignedGuideIds: new Set(['g1']) })
    expect(guideSource(g, c)).toBe('ASSIGNED')
  })

  it('prefers ONBOARDING over DEPARTMENT', () => {
    const g = guide({ isOnboarding: true, departmentId: 'd1' })
    expect(guideSource(g, ctx({ departmentId: 'd1' }))).toBe('ONBOARDING')
  })

  it('prefers SECTION over POSITION and DEPARTMENT', () => {
    const g = guide({
      departmentId: 'd1',
      audiences: [
        { kind: 'SECTION', targetId: 's1' },
        { kind: 'POSITION', targetId: 'p1' },
      ],
    })
    const c = ctx({
      departmentId: 'd1',
      sectionIds: new Set(['s1']),
      positionIds: new Set(['p1']),
    })
    expect(guideSource(g, c)).toBe('SECTION')
  })

  it('prefers POSITION over DEPARTMENT', () => {
    const g = guide({
      departmentId: 'd1',
      audiences: [{ kind: 'POSITION', targetId: 'p1' }],
    })
    const c = ctx({ departmentId: 'd1', positionIds: new Set(['p1']) })
    expect(guideSource(g, c)).toBe('POSITION')
  })

  it('only matches the assigned guide, not its siblings', () => {
    const c = ctx({ assignedGuideIds: new Set(['g1']) })
    expect(guideSource(guide({ id: 'g2' }), c)).toBeNull()
  })
})

describe('guideAppliesTo', () => {
  it('is true exactly when guideSource is non-null', () => {
    expect(guideAppliesTo(guide(), ctx())).toBe(false)
    expect(guideAppliesTo(guide({ isOnboarding: true }), ctx())).toBe(true)
  })
})

describe('guideWhereOr', () => {
  it('always includes onboarding', () => {
    expect(guideWhereOr(ctx())).toEqual([{ isOnboarding: true }])
  })

  it('adds both department clauses only when the staff member has one', () => {
    expect(guideWhereOr(ctx({ departmentId: 'd1' }))).toEqual([
      { isOnboarding: true },
      { audiences: { some: { kind: 'DEPARTMENT', targetId: 'd1' } } },
      { departmentId: 'd1' },
    ])
  })

  it('adds the assignment clause only when there are assignments', () => {
    expect(guideWhereOr(ctx({ assignedGuideIds: new Set(['g1', 'g2']) }))).toEqual([
      { isOnboarding: true },
      { id: { in: ['g1', 'g2'] } },
    ])
  })

  it('adds section and position clauses when held', () => {
    const c = ctx({ sectionIds: new Set(['s1']), positionIds: new Set(['p1']) })
    expect(guideWhereOr(c)).toEqual([
      { isOnboarding: true },
      { audiences: { some: { kind: 'SECTION', targetId: { in: ['s1'] } } } },
      { audiences: { some: { kind: 'POSITION', targetId: { in: ['p1'] } } } },
    ])
  })

  // If the SQL filter is narrower than the predicate a guide silently vanishes;
  // if it's wider the predicate re-filters it. Both must cover the same sources.
  it('covers every source the predicate accepts', () => {
    const c = ctx({
      departmentId: 'd1',
      sectionIds: new Set(['s1']),
      positionIds: new Set(['p1']),
      assignedGuideIds: new Set(['g9']),
    })
    // onboarding + assigned + section + position + department (audience row and
    // the legacy column are separate clauses) = 6
    expect(guideWhereOr(c)).toHaveLength(6)
  })
})
