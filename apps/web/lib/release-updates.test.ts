import { describe, expect, it } from 'vitest'
import {
  confirmedIssueSet,
  filterReleaseIssues,
  groupReleaseIssues,
  normaliseSnapshot,
  parseArea,
  releaseProgress,
  versionMatches,
  type ReleaseIssue,
} from './release-updates'

const issue = (over: Partial<ReleaseIssue> = {}): ReleaseIssue => ({
  number: over.number ?? 1,
  title: over.title ?? '[UI] SOMETHING',
  state: over.state ?? 'CLOSED',
  url: over.url ?? 'https://example.test/1',
  closedAt: over.closedAt ?? null,
  labels: over.labels ?? [],
})

describe('parseArea', () => {
  it('reads the bracketed title prefix', () => {
    expect(parseArea('[UI] Rework nav')).toBe('UI')
    expect(parseArea('[availability] edit notes')).toBe('AVAILABILITY')
    expect(parseArea('[SWIFT POS] dockets')).toBe('SWIFT_POS')
  })

  it('falls back to OTHER without a usable prefix', () => {
    expect(parseArea('No prefix here')).toBe('OTHER')
    expect(parseArea('[] empty')).toBe('OTHER')
    expect(parseArea('')).toBe('OTHER')
  })
})

describe('normaliseSnapshot', () => {
  it('tolerates malformed snapshots instead of throwing', () => {
    expect(normaliseSnapshot(null)).toEqual({
      version: '',
      generatedAt: '',
      repo: '',
      issues: [],
    })
    expect(
      normaliseSnapshot({
        version: 1005,
        issues: [null, { number: 'x' }, { number: 2 }, { number: 3, title: '' }],
      }),
    ).toEqual({ version: '', generatedAt: '', repo: '', issues: [] })
  })

  it('normalises rows, labels and duplicate issue numbers', () => {
    const snapshot = normaliseSnapshot({
      version: '1005',
      generatedAt: '2026-11-05T00:00:00.000Z',
      repo: 'o/r',
      issues: [
        { number: 9, title: '[UI] B', state: 'OPEN', url: 'u9', closedAt: null, labels: [{ name: 'bug' }, 'x'] },
        { number: 3, title: '[UI] A', state: 'CLOSED', url: 'u3', closedAt: '2026-01-01', labels: [] },
        { number: 3, title: '[UI] DUPE', state: 'CLOSED', url: 'u3b', closedAt: null, labels: [] },
      ],
    })

    expect(snapshot.version).toBe('1005')
    expect(snapshot.repo).toBe('o/r')
    expect(snapshot.issues.map((row) => row.number)).toEqual([3, 9])
    expect(snapshot.issues[0].state).toBe('CLOSED')
    expect(snapshot.issues[1].state).toBe('OPEN')
    expect(snapshot.issues[1].labels).toEqual(['bug', 'x'])
  })
})

describe('filterReleaseIssues', () => {
  const rows = [
    issue({ number: 6, title: '[ORDER] B', state: 'CLOSED' }),
    issue({ number: 2, title: '[UI] A', state: 'CLOSED' }),
    issue({ number: 4, title: '[UI] OPEN ONE', state: 'OPEN' }),
  ]

  it('filters CLOSED by default and sorts by issue number', () => {
    expect(filterReleaseIssues(rows, { status: 'CLOSED' }).map((r) => r.number)).toEqual([2, 6])
  })

  it('filters OPEN', () => {
    expect(filterReleaseIssues(rows, { status: 'OPEN' }).map((r) => r.number)).toEqual([4])
  })

  it('matches search against number, title and area', () => {
    expect(filterReleaseIssues(rows, { status: 'CLOSED', search: '#6' }).map((r) => r.number)).toEqual([6])
    expect(filterReleaseIssues(rows, { status: 'CLOSED', search: 'ui' }).map((r) => r.number)).toEqual([2])
    expect(filterReleaseIssues(rows, { status: 'CLOSED', search: 'nothing' })).toEqual([])
  })
})

describe('groupReleaseIssues', () => {
  it('groups by [AREA] in workflow order, OTHER last', () => {
    const groups = groupReleaseIssues([
      issue({ number: 1, title: '[OTHER] MISC' }),
      issue({ number: 2, title: 'No area' }),
      issue({ number: 3, title: '[ORDERS] O' }),
      issue({ number: 4, title: '[UI] U' }),
    ])
    expect(groups.map((g) => g.area)).toEqual(['UI', 'ORDERS', 'OTHER'])
    expect(groups[2].issues.map((i) => i.number)).toEqual([1, 2])
  })
})

describe('releaseProgress', () => {
  const rows = [issue({ number: 1 }), issue({ number: 2 }), issue({ number: 3 })]

  it('counts confirmed rows and rounds the percentage', () => {
    expect(releaseProgress(rows, [1, 3])).toEqual({ total: 3, confirmed: 2, percent: 67 })
  })

  it('returns 0% for an empty batch (never NaN)', () => {
    expect(releaseProgress([], new Set())).toEqual({ total: 0, confirmed: 0, percent: 0 })
  })

  it('accepts a confirmation row shape', () => {
    expect(confirmedIssueSet([{ issueNumber: 2 }]).has(2)).toBe(true)
  })
})

describe('versionMatches', () => {
  it('treats no requested version as current', () => {
    expect(versionMatches('1005', null)).toBe(true)
    expect(versionMatches('1005', '')).toBe(true)
  })

  it('accepts the same version and rejects a stale one', () => {
    expect(versionMatches('1005', '1005')).toBe(true)
    expect(versionMatches('1005', ' 1005 ')).toBe(true)
    expect(versionMatches('1005', '1004')).toBe(false)
  })
})
