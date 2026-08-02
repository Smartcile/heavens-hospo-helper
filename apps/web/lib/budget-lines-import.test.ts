import { describe, it, expect } from 'vitest'
import {
  MONTH_SEQUENCE,
  findMonthRow,
  normalizeLabel,
  toNumber,
  parsePnlRows,
  assignParentIndexes,
  monthYearForName,
  buildLineTree,
  treeTotal,
} from './budget-lines-import'

// Mirrors the Eatery workbook layout: banner row, month header, col-A groups,
// col-B sub-groups, data lines, TOTAL sum rows, % rows, computed $ rows.
function eateryFixture(): unknown[][] {
  return [
    ['Profit and Loss Budget', null, null, null, null, null, null, null, null, null, null, null, null, null],
    [null, null, 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Total'],
    ['Revenue', null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    [null, 'Eatery Revenue', null, null, null, null, null, null, null, null, null, null, null, null, null],
    [null, 'Eatery - Beverage', 46993, 35790, 46489, 36174, 49106, 63554, 75694, 54251, 57547, 65334, 43263, 56799, 630994],
    [null, 'Eatery - Food', 102494, 112359, 122441, 103148, 117368, 138270, 148837, 135194, 139905, 141203, 116128, 132752, 1510099],
    [null, 'Eatery - Icecream', 1025, 1481, 1291, 1253, 2073, 2446, 2377, 3167, 1982, 2491, 1762, 1846, 23194],
    [null, 'Eatery - Coffee', 34744, 37059, 39990, 33163, 39273, 38847, 36307, 36291, 37944, 39419, 34480, 42177, 449694],
    [null, 'Total Eatery Revenue', 185256, 186689, 210211, 173738, 207820, 243117, 263215, 228903, 237378, 248447, 195633, 233574, 2613981],
    ['Cost of Goods Sold', null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    [null, 'Eatery', null, null, null, null, null, null, null, null, null, null, null, null, null],
    [null, 'Eatery - Beverage', 10338, 7874, 10228, 7958, 10803, 13982, 16653, 11935, 12660, 14374, 9518, 12496, 138819],
    [null, 'Eatery - Food', 32491, 35618, 38814, 32698, 37206, 43832, 47181, 42856, 44350, 44761, 36812, 42082, 478701],
    [null, 'Eatery - Icecream', 308, 444, 387, 376, 622, 734, 713, 950, 595, 747, 529, 554, 6959],
    [null, 'Eatery - Utilities', 8026, 8561, 9238, 7661, 9072, 8974, 8387, 8383, 8765, 9106, 7965, 9743, 103881],
    [null, 'Total Eatery', 51163, 52497, 58667, 48693, 57703, 67522, 72934, 64124, 66370, 68988, 54824, 64875, 728360],
    ['Allocated Operating Expenditure', null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    [null, 'Eatery', null, null, null, null, null, null, null, null, null, null, null, null, null],
    [null, 'Eatery - Wages BOH', 40861, 45941, 49377, 40608, 45970, 47396, 54901, 48367, 46287, 47000, 45591, 43074, 555373],
    [null, 'Eatery - Administration', 44723, 41080, 43652, 39466, 40733, 47143, 49684, 49026, 51360, 46622, 45338, 45423, 544250],
    [null, 'Eatery - Cost Contribution', 18526, 18669, 21021, 17374, 20782, 24312, 26322, 22890, 23738, 24845, 19563, 23357, 261399],
    [null, 'Total Eatery', 116152, 117825, 127712, 108741, 120994, 134654, 148015, 135162, 136815, 134616, 123207, 127037, 1530930],
    [null, 'Business Unit Eatery', 17941, 16367, 23832, 16304, 29123, 40941, 42266, 29617, 34193, 44843, 17602, 41662, 354691],
    [null, 'Eatery Gross Margin', 134093, 134192, 151544, 125045, 150117, 175595, 190281, 164779, 171008, 179459, 140809, 168699, 1885621],
    [null, 'Eatery Gross Margin %', 0.72, 0.72, 0.72, 0.72, 0.72, 0.72, 0.72, 0.72, 0.72, 0.72, 0.72, 0.72, 0.72],
    [null, 'AE Wages BOH/AE Food Revenue %', 0.4, 0.41, 0.4, 0.39, 0.39, 0.34, 0.37, 0.36, 0.33, 0.33, 0.39, 0.32, 0.37],
  ]
}

describe('normalizeLabel / toNumber', () => {
  it('trims and returns only real strings', () => {
    expect(normalizeLabel('  ABC  ')).toBe('ABC')
    expect(normalizeLabel(42)).toBeNull()
    expect(normalizeLabel('   ')).toBeNull()
    expect(normalizeLabel(null)).toBeNull()
  })

  it('parses numbers and currency strings', () => {
    expect(toNumber(46993)).toBe(46993)
    expect(toNumber('46,993')).toBe(46993)
    expect(toNumber('$1,234.50')).toBe(1234.5)
    expect(toNumber('abc')).toBeNull()
    expect(toNumber(null)).toBeNull()
  })
})

describe('findMonthRow', () => {
  it('locates the month header row and column indices', () => {
    const result = findMonthRow(eateryFixture())
    expect(result).not.toBeNull()
    expect(result!.rowIndex).toBe(1)
    expect(result!.months).toEqual(MONTH_SEQUENCE.slice())
    expect(result!.cols[0]).toBe(2)
    expect(result!.cols).toHaveLength(12)
  })

  it('skips banner rows above the header', () => {
    const rows = [['Company Name'], ['Revenue'], ['Jun', 'Jul', 'Aug'], [null, 'Line A', 1, 2, 3]]
    const result = findMonthRow(rows)
    expect(result!.rowIndex).toBe(2)
    expect(result!.months).toEqual(['JUN', 'JUL', 'AUG'])
  })

  it('returns null when no month row exists', () => {
    expect(findMonthRow([['a', 'b'], ['c', 'd']])).toBeNull()
  })

  it('handles SEPT alias and dotted abbreviations', () => {
    const rows = [['JUN.', 'JUL', 'SEPT']]
    expect(findMonthRow(rows)!.months).toEqual(['JUN', 'JUL', 'SEP'])
  })
})

describe('parsePnlRows', () => {
  it('classifies the Eatery workbook rows', () => {
    const { months, rows } = parsePnlRows(eateryFixture())
    expect(months).toHaveLength(12)

    const kinds = rows.map((r) => r.kind)
    expect(rows[0]).toMatchObject({ label: 'Revenue', kind: 'GROUP', depth: 0 })
    expect(rows[1]).toMatchObject({ label: 'Eatery Revenue', kind: 'GROUP', depth: 1 })
    expect(rows[2]).toMatchObject({ label: 'Eatery - Beverage', kind: 'LINE', depth: 2 })
    expect(rows[6]).toMatchObject({ label: 'Total Eatery Revenue', kind: 'TOTAL', depth: 2 })
    expect(rows[8]).toMatchObject({ label: 'Eatery', kind: 'GROUP', depth: 1 })
    expect(rows[13]).toMatchObject({ label: 'Total Eatery', kind: 'TOTAL', depth: 2 })
    expect(rows[20]).toMatchObject({ label: 'Business Unit Eatery', kind: 'LINE', depth: 0 })
    expect(rows[21]).toMatchObject({ label: 'Eatery Gross Margin', kind: 'LINE', depth: 0 })
    expect(kinds.filter((k) => k === 'SKIP')).toHaveLength(2)
    expect(kinds.filter((k) => k === 'GROUP')).toHaveLength(6)
    expect(kinds.filter((k) => k === 'TOTAL')).toHaveLength(3)
  })

  it('aligns values to month columns', () => {
    const { rows } = parsePnlRows(eateryFixture())
    const beverage = rows[2]
    expect(beverage.values[0]).toBe(46993)
    expect(beverage.values[11]).toBe(56799)
    expect(beverage.values).toHaveLength(12)
  })

  it('defaults % rows to not-included', () => {
    const { rows } = parsePnlRows(eateryFixture())
    for (const row of rows.filter((r) => r.kind === 'SKIP')) {
      expect(row.include).toBe(false)
    }
  })

  it('marks every non-skip row as included by default', () => {
    const { rows } = parsePnlRows(eateryFixture())
    for (const row of rows.filter((r) => r.kind !== 'SKIP')) {
      expect(row.include).toBe(true)
    }
  })

  it('handles sheets with no month header', () => {
    const { months, rows } = parsePnlRows([[null, 'Foo', 1], [null, 'Bar', 2]])
    expect(months).toHaveLength(0)
    expect(rows[0]).toMatchObject({ label: 'Foo', kind: 'LINE', depth: 0 })
    expect(rows[0].values).toEqual([])
  })

  it('treats value rows after a TOTAL as standalone (computed) rows', () => {
    const { rows } = parsePnlRows(eateryFixture())
    // "Business Unit Eatery" and "Eatery Gross Margin" come after the last TOTAL
    expect(rows[20].depth).toBe(0)
    expect(rows[21].depth).toBe(0)
  })
})

describe('assignParentIndexes', () => {
  it('assigns lines and totals to their enclosing group', () => {
    const { rows } = parsePnlRows(eateryFixture())
    const parents = assignParentIndexes(rows)

    expect(parents[0]).toBeNull() // Revenue — root
    expect(parents[1]).toBe(0) // Eatery Revenue under Revenue
    expect(parents[2]).toBe(1) // Beverage under Eatery Revenue
    expect(parents[6]).toBe(1) // Total Eatery Revenue under Eatery Revenue
    expect(parents[8]).toBe(7) // Eatery (COGS sub-group) under Cost of Goods Sold
    expect(parents[9]).toBe(8) // COGS Beverage under Eatery
    expect(parents[13]).toBe(8) // Total Eatery under Eatery
    expect(parents[20]).toBeNull() // Business Unit Eatery — standalone
    expect(parents[21]).toBeNull() // Eatery Gross Margin — standalone
  })
})

describe('monthYearForName', () => {
  it('maps Jun–May across a financial year boundary', () => {
    expect(monthYearForName('JUN', 2026)).toEqual({ month: 6, year: 2026 })
    expect(monthYearForName('DEC', 2026)).toEqual({ month: 12, year: 2026 })
    expect(monthYearForName('JAN', 2026)).toEqual({ month: 1, year: 2027 })
    expect(monthYearForName('MAY', 2026)).toEqual({ month: 5, year: 2027 })
    expect(monthYearForName('SEP', 2026)).toEqual({ month: 9, year: 2026 })
  })
})

describe('buildLineTree', () => {
  const lines = [
    { id: 'g1', name: 'REVENUE', kind: 'GROUP' as const, parentId: null, sectionId: null, amount: null },
    { id: 'l1', name: 'BEVERAGE', kind: 'LINE' as const, parentId: 'g1', sectionId: null, amount: 100 },
    { id: 'l2', name: 'FOOD', kind: 'LINE' as const, parentId: 'g1', sectionId: 's1', amount: 250 },
    { id: 't1', name: 'TOTAL EATERY REVENUE', kind: 'TOTAL' as const, parentId: 'g1', sectionId: null, amount: null },
    { id: 'l3', name: 'GROSS MARGIN', kind: 'LINE' as const, parentId: null, sectionId: null, amount: 1234 },
  ]

  it('builds the hierarchy and computes TOTAL as the sum of LINE siblings', () => {
    const tree = buildLineTree(lines)
    expect(tree).toHaveLength(2)

    const group = tree[0]
    expect(group.children).toHaveLength(3)
    const total = group.children.find((c) => c.kind === 'TOTAL')!
    expect(total.total).toBe(350)
    expect(total.amount).toBeNull()

    const standalone = tree[1]
    expect(standalone.name).toBe('GROSS MARGIN')
    expect(standalone.amount).toBe(1234)
  })

  it('treats missing/blank LINE amounts as zero in totals', () => {
    const withBlank = lines.map((l, i) => (i === 1 ? { ...l, amount: null } : l))
    const tree = buildLineTree(withBlank)
    const total = tree[0].children.find((c) => c.kind === 'TOTAL')!
    expect(total.total).toBe(250)
  })

  it('preserves section names on items', () => {
    const tree = buildLineTree(lines.map((l) => ({ ...l, sectionName: l.sectionId === 's1' ? 'BAR' : null })))
    const food = tree[0].children.find((c) => c.id === 'l2')!
    expect(food.sectionName).toBe('BAR')
  })
})

describe('treeTotal', () => {
  it('sums LINE amounts across the whole tree without double counting totals', () => {
    const tree = buildLineTree([
      { id: 'g1', name: 'REV', kind: 'GROUP' as const, parentId: null, sectionId: null, amount: null },
      { id: 'l1', name: 'A', kind: 'LINE' as const, parentId: 'g1', sectionId: null, amount: 100 },
      { id: 'l2', name: 'B', kind: 'LINE' as const, parentId: 'g1', sectionId: null, amount: 200 },
      { id: 't1', name: 'TOT', kind: 'TOTAL' as const, parentId: 'g1', sectionId: null, amount: null },
      { id: 'l3', name: 'C', kind: 'LINE' as const, parentId: null, sectionId: null, amount: 50 },
    ])
    expect(treeTotal(tree)).toBe(350)
  })
})
