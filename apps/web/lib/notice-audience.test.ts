import { describe, it, expect } from 'vitest'
import {
  cleanNoticeAudiences,
  noticeAppliesTo,
  noticeWhereOr,
  type NoticeStaffContext,
} from './notice-audience'

const ctx = (over: Partial<NoticeStaffContext> = {}): NoticeStaffContext => ({
  departmentId: 'bar',
  sectionIds: new Set(['bar-top']),
  positionIds: new Set(['bartender']),
  ...over,
})

describe('cleanNoticeAudiences', () => {
  it('keeps valid rows and de-dupes', () => {
    expect(cleanNoticeAudiences([
      { kind: 'DEPARTMENT', targetId: 'bar' },
      { kind: 'DEPARTMENT', targetId: 'bar' },
      { kind: 'SECTION', targetId: 'floor' },
    ])).toEqual([
      { kind: 'DEPARTMENT', targetId: 'bar' },
      { kind: 'SECTION', targetId: 'floor' },
    ])
  })

  it('drops unknown kinds and blanks', () => {
    expect(cleanNoticeAudiences([{ kind: 'NOPE', targetId: 'x' }, { kind: 'POSITION' }, null])).toEqual([])
    expect(cleanNoticeAudiences('nope')).toEqual([])
  })
})

describe('noticeAppliesTo', () => {
  it('empty targeting = whole venue', () => {
    expect(noticeAppliesTo({ departmentId: null, audiences: [] }, ctx())).toBe(true)
    expect(noticeAppliesTo({ departmentId: null, audiences: [] }, ctx({ departmentId: null }))).toBe(true)
  })

  it('matches the legacy department field', () => {
    expect(noticeAppliesTo({ departmentId: 'bar', audiences: [] }, ctx())).toBe(true)
    expect(noticeAppliesTo({ departmentId: 'kitchen', audiences: [] }, ctx())).toBe(false)
  })

  it('matches department / section / position audiences', () => {
    expect(noticeAppliesTo({ departmentId: null, audiences: [{ kind: 'DEPARTMENT', targetId: 'bar' }] }, ctx())).toBe(true)
    expect(noticeAppliesTo({ departmentId: null, audiences: [{ kind: 'SECTION', targetId: 'bar-top' }] }, ctx())).toBe(true)
    expect(noticeAppliesTo({ departmentId: null, audiences: [{ kind: 'POSITION', targetId: 'bartender' }] }, ctx())).toBe(true)
  })

  it('does not match an unrelated audience', () => {
    expect(noticeAppliesTo({ departmentId: null, audiences: [{ kind: 'SECTION', targetId: 'kitchen' }] }, ctx())).toBe(false)
  })
})

describe('noticeWhereOr', () => {
  it('always includes the whole-venue clause', () => {
    const clauses = noticeWhereOr({ departmentId: null, sectionIds: new Set(), positionIds: new Set() })
    expect(clauses).toHaveLength(1)
    expect(clauses[0]).toEqual({ AND: [{ audiences: { none: {} } }, { departmentId: null }] })
  })

  it('adds whole-venue, dept, section and position clauses when held', () => {
    const clauses = noticeWhereOr(ctx())
    expect(clauses).toHaveLength(5)
  })
})
