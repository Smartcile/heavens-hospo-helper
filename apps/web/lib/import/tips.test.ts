import { describe, expect, it } from 'vitest'
import {
  applyTipsImport,
  buildTipsImportPrompt,
  matchTipsImportRows,
  parseMarkdownTable,
  parseTipHours,
  parseTipWeight,
  parseTipsImportAnswer,
} from '@/lib/import/tips'
import type { TipsShareRow } from '@/lib/tips'

describe('tips import prompt', () => {
  it('lists the venue staff names and the period range', () => {
    const prompt = buildTipsImportPrompt({
      venueName: 'Demo Venue',
      staffNames: ['LIAM SMITH', 'SHAYLA JONES'],
      fromDate: '2026-02-01',
      toDate: '2026-02-28',
    })
    expect(prompt).toContain('Demo Venue')
    expect(prompt).toContain('2026-02-01 to 2026-02-28')
    expect(prompt).toContain('- LIAM SMITH')
    expect(prompt).toContain('- SHAYLA JONES')
    expect(prompt).toContain('Do NOT convert minutes to hours')
  })
})

describe('tips import coercions', () => {
  it('parses human hour strings without reinterpreting the unit', () => {
    expect(parseTipHours('12.5 hrs')).toBe(12.5)
    expect(parseTipHours('12,5 hours')).toBe(12.5)
    expect(parseTipHours('1,234')).toBe(1234)
    expect(parseTipHours(705)).toBe(705)
    expect(parseTipHours('')).toBeNull()
    expect(parseTipHours('nope')).toBeNull()
    expect(parseTipWeight('0,25')).toBe(0.25)
    expect(parseTipWeight('-1')).toBeNull()
  })
})

describe('tips import parsing', () => {
  it('parses fenced JSON rows', () => {
    const result = parseTipsImportAnswer(
      'Here you go:\n```json\n{ "staff": [ { "name": "liam  smith", "hours": "12.5 hrs", "weight": 1 }, { "name": "SHAYLA JONES", "hours": 634 } ] }\n```',
    )
    if ('error' in result) throw new Error(result.error)
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].values).toEqual({ name: 'LIAM SMITH', hours: 12.5, weight: 1 })
    expect(result.rows[1].values).toEqual({ name: 'SHAYLA JONES', hours: 634, weight: null })
    expect(result.issues).toHaveLength(0)
  })

  it('parses prose-wrapped JSON', () => {
    const result = parseTipsImportAnswer(
      'The hours are as follows {"staff":[{"name":"LIAM SMITH","hours":"12,5"}]} thanks',
    )
    if ('error' in result) throw new Error(result.error)
    expect(result.rows[0].values.hours).toBe(12.5)
  })

  it('parses a Markdown table', () => {
    const result = parseTipsImportAnswer(
      ['| Name | Hours | Weight |', '| --- | ---: | --- |', '| LIAM SMITH | 705 | 1 |', '| SHAYLA JONES | 634 |'].join('\n'),
    )
    if ('error' in result) throw new Error(result.error)
    expect(result.rows.map((r) => r.values.name)).toEqual(['LIAM SMITH', 'SHAYLA JONES'])
    expect(result.rows[0].values).toEqual({ name: 'LIAM SMITH', hours: 705, weight: 1 })
    expect(result.rows[1].values.weight).toBeNull()
  })

  it('returns null from the table reader when the columns are not NAME/HOURS', () => {
    expect(parseMarkdownTable('| Item | Qty |\n| --- | --- |\n| BEER | 4 |')).toBeNull()
  })

  it('flags blank and negative hours as errors and skips the row', () => {
    const result = parseTipsImportAnswer(
      JSON.stringify({ staff: [{ name: 'LIAM SMITH', hours: '' }, { name: 'SHAYLA JONES', hours: -3 }, { name: 'LUZ', hours: 5 }] }),
    )
    if ('error' in result) throw new Error(result.error)
    expect(result.rows[0].action).toBe('SKIP')
    expect(result.rows[0].issues.some((i) => i.severity === 'ERROR')).toBe(true)
    expect(result.rows[1].action).toBe('SKIP')
    expect(result.rows[2].include).toBe(true)
  })

  it('skips a duplicate name within the file', () => {
    const result = parseTipsImportAnswer(
      JSON.stringify({ staff: [{ name: 'LIAM SMITH', hours: 1 }, { name: 'liam smith', hours: 2 }] }),
    )
    if ('error' in result) throw new Error(result.error)
    expect(result.rows[1].action).toBe('SKIP')
    expect(result.rows[1].match?.status).toBe('DUPLICATE_IN_FILE')
  })

  it('errors when neither JSON nor a table is present', () => {
    expect(parseTipsImportAnswer('just some prose')).toEqual({ error: 'NO JSON OR MARKDOWN TABLE FOUND IN THE ANSWER' })
  })
})

describe('tips import matching', () => {
  const rowsOf = (answer: string) => {
    const result = parseTipsImportAnswer(answer)
    if ('error' in result) throw new Error(result.error)
    return result.rows
  }

  it('matches a unique full name, flags an unknown name NEW and skips an ambiguous name', () => {
    const rows = rowsOf(
      JSON.stringify({
        staff: [
          { name: 'LIAM SMITH', hours: 10 },
          { name: 'NEW PERSON', hours: 5 },
          { name: 'ALEX SMITH', hours: 2 },
        ],
      }),
    )
    const matched = matchTipsImportRows(rows, [
      { id: 's1', name: 'LIAM SMITH' },
      { id: 's2', name: 'ALEX SMITH' },
      { id: 's3', name: 'ALEX SMITH' },
    ])

    expect(matched[0].match).toMatchObject({ status: 'MATCH', targetId: 's1' })
    expect(matched[0].action).toBe('CREATE')
    expect(matched[1].match?.status).toBe('NEW')
    expect(matched[2].match?.status).toBe('AMBIGUOUS')
    expect(matched[2].action).toBe('SKIP')
  })

  it('marks a matched person already on the period as UPDATE, never duplicating them', () => {
    const rows = rowsOf(JSON.stringify({ staff: [{ name: 'LIAM SMITH', hours: 99 }] }))
    const matched = matchTipsImportRows(rows, [{ id: 's1', name: 'LIAM SMITH' }], ['s1'])
    expect(matched[0].action).toBe('UPDATE')
    expect(matched[0].match?.label).toContain('ON PERIOD')
  })
})

describe('tips import apply', () => {
  const share = (over: Partial<TipsShareRow> = {}): TipsShareRow => ({
    id: 'r1',
    staffId: 's1',
    name: 'LIAM SMITH',
    hours: 705,
    shareWeight: 1,
    sortOrder: 0,
    status: 'PLANNED',
    ...over,
  })

  it('updates hours in place, adds a new staff row and appends an unknown name as manual', () => {
    const parsed = parseTipsImportAnswer(
      JSON.stringify({
        staff: [
          { name: 'LIAM SMITH', hours: 800 },
          { name: 'SHAYLA JONES', hours: 634, weight: 0.75 },
          { name: 'WALK IN WONDER', hours: 12 },
        ],
      }),
    )
    if ('error' in parsed) throw new Error(parsed.error)
    const matched = matchTipsImportRows(parsed.rows, [
      { id: 's1', name: 'LIAM SMITH' },
      { id: 's2', name: 'SHAYLA JONES' },
    ])

    const result = applyTipsImport(matched, [share()])

    expect(result.shares[0]).toMatchObject({ staffId: 's1', hours: 800, shareWeight: 1 })
    expect(result.shares[1]).toMatchObject({ staffId: 's2', hours: 634, shareWeight: 0.75, sortOrder: 1 })
    expect(result.shares[2]).toMatchObject({ staffId: null, name: 'WALK IN WONDER', hours: 12, sortOrder: 2 })
    expect(result.summary).toMatchObject({ created: 2, updated: 1 })
    expect(result.summary.warnings.join(' ')).toContain('MANUAL ROW')
  })

  it('keeps an existing manual row name matched rather than duplicating it', () => {
    const parsed = parseTipsImportAnswer(JSON.stringify({ staff: [{ name: 'WALK IN', hours: 4 }] }))
    if ('error' in parsed) throw new Error(parsed.error)
    const matched = matchTipsImportRows(parsed.rows, [])
    const result = applyTipsImport(matched, [share({ id: 'r2', staffId: null, name: 'WALK IN', hours: 1 })])
    expect(result.shares).toHaveLength(1)
    expect(result.shares[0].hours).toBe(4)
    expect(result.summary.updated).toBe(1)
  })
})
