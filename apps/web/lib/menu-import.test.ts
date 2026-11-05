import { describe, it, expect } from 'vitest'
import {
  buildMenuImportPrompt,
  createImportDraft,
  draftToImportData,
  flattenMenuImport,
  importMatchIssues,
  matchImportItems,
  moveImportGroup,
  moveImportItem,
  normaliseMenuName,
  optionSummary,
  parseMenuImportAnswer,
  renameImportGroup,
  renameImportItem,
  reorderImportItem,
  type MenuImportData,
} from '@/lib/menu-import'

const answer = JSON.stringify({
  menu: {
    name: 'dinner',
    description: 'Evening service',
    groups: [
      {
        name: 'mains',
        area: 'restaurant',
        items: [
          {
            name: 'fish   and chips',
            price: '$32.50',
            description: 'with chips',
            sizes: [{ label: 'one size', price: '$32.50' }],
            options: [{
              name: 'side',
              required: true,
              min: 1,
              max: 1,
              choices: [
                { name: 'fries', priceDelta: 0 },
                { name: 'salad', priceDelta: '$3' },
                { name: 'fries and salad', priceDelta: '+3' },
              ],
            }],
          },
          { name: 'steak', price: 28, description: 'grilled', dietary: ['MILK'] },
        ],
      },
    ],
  },
})

function item(name: string, price = 10): MenuImportData['groups'][number]['items'][number] {
  return { name, price, description: `${name} DESC`, sizes: [], options: [] }
}

describe('buildMenuImportPrompt', () => {
  it('names the menu, asks for sizes/options/area and drops the dietary field', () => {
    const prompt = buildMenuImportPrompt({ menuNameHint: 'summer menu', venueName: 'The Eatery' })
    expect(prompt).toContain('"SUMMER MENU"')
    expect(prompt).toContain('The Eatery')
    expect(prompt).toContain('STRICT JSON')
    expect(prompt).toContain('"sizes"')
    expect(prompt).toContain('"options"')
    expect(prompt).toContain('"area"')
    expect(prompt).not.toContain('"dietary"')
  })
})

describe('parseMenuImportAnswer', () => {
  it('parses sizes, options, areas and tolerant prices', () => {
    const result = parseMenuImportAnswer(answer)
    if ('error' in result) throw new Error(result.error)

    expect(result.data.name).toBe('DINNER')
    const group = result.data.groups[0]
    expect(group).toMatchObject({ name: 'MAINS', area: 'RESTAURANT' })
    expect(flattenMenuImport(result.data)).toHaveLength(2)

    const [fish, steak] = group.items
    expect(fish).toMatchObject({
      name: 'FISH AND CHIPS',
      price: 32.5,
      description: 'with chips',
      sizes: [{ label: 'ONE SIZE', price: 32.5 }],
    })
    expect(fish.options).toEqual([{
      name: 'SIDE',
      required: true,
      min: 1,
      max: 1,
      choices: [
        { name: 'FRIES', priceDelta: 0 },
        { name: 'SALAD', priceDelta: 3 },
        { name: 'FRIES AND SALAD', priceDelta: 3 },
      ],
    }])
    expect(steak.name).toBe('STEAK')
    expect(steak.sizes).toEqual([])
    expect('dietary' in steak).toBe(false)
  })

  it('accepts fenced JSON surrounded by prose', () => {
    const result = parseMenuImportAnswer(
      `Here you go:\n\`\`\`json\n${answer}\n\`\`\`\nHope that helps.`,
    )
    if ('error' in result) throw new Error(result.error)
    expect(result.data.groups[0].items).toHaveLength(2)
  })

  it('reports dietary as ignored instead of importing it', () => {
    const result = parseMenuImportAnswer(answer)
    if ('error' in result) throw new Error(result.error)
    expect(result.issues.some((i) => i.kind === 'DIETARY_IGNORED')).toBe(true)
    expect(JSON.stringify(result.data.groups)).not.toContain('MILK')
  })

  it('uses item-level group/area when the answer is flat', () => {
    const result = parseMenuImportAnswer(JSON.stringify({
      menu: {
        name: 'LUNCH',
        items: [
          { name: 'SOUP', price: 5, description: 'warm', group: 'STARTERS', area: 'BAR' },
          { name: 'PIE', price: 9, description: 'hot' },
        ],
      },
    }))
    if ('error' in result) throw new Error(result.error)

    expect(result.data.groups.map((g) => [g.name, g.area, g.items.length])).toEqual([
      ['STARTERS', 'BAR', 1],
      ['MENU', null, 1],
    ])
    expect(result.issues.some((i) => i.kind === 'MISSING_GROUP')).toBe(true)
  })

  it('keeps one product per normalised name across groups', () => {
    const result = parseMenuImportAnswer(JSON.stringify({
      menu: {
        name: 'BAR',
        groups: [
          { name: 'A', items: [{ name: 'latte', price: 5, description: 'x' }] },
          { name: 'B', items: [{ name: 'LATTE', price: 6, description: 'y' }] },
        ],
      },
    }))
    if ('error' in result) throw new Error(result.error)

    expect(result.data.groups).toHaveLength(1)
    expect(result.data.groups[0].items).toHaveLength(1)
    expect(result.issues.some((i) => i.kind === 'DUPLICATE_NAME')).toBe(true)
  })

  it('returns structured issues for missing prices, sizes and descriptions', () => {
    const result = parseMenuImportAnswer(JSON.stringify({
      menu: {
        name: 'BAR',
        groups: [{
          name: 'DRINKS',
          items: [
            { name: 'SOUP', sizes: [{ label: 'BOWL' }] },
            { name: 'BREAD' },
            { name: '', price: 4 },
          ],
        }],
      },
    }))
    if ('error' in result) throw new Error(result.error)

    const kinds = result.issues.map((i) => i.kind)
    expect(kinds).toContain('MISSING_SIZE')
    expect(kinds).toContain('MISSING_PRICE')
    expect(kinds).toContain('MISSING_DESCRIPTION')
    expect(kinds).toContain('NO_NAME')
    // A size-only row is kept (never silently dropped because price is null).
    expect(result.data.groups[0].items.find((i) => i.name === 'SOUP')?.price).toBeNull()
    expect(result.data.groups[0].items.find((i) => i.name === 'SOUP')?.sizes).toEqual([{ label: 'BOWL', price: 0 }])
  })

  it('returns an error when there is no JSON or no items', () => {
    expect('error' in parseMenuImportAnswer('')).toBe(true)
    expect('error' in parseMenuImportAnswer('no json here')).toBe(true)
    expect('error' in parseMenuImportAnswer('{"menu":{"name":"X","groups":[]}}')).toBe(true)
  })
})

describe('matchImportItems', () => {
  it('matches on the normalised name and reports ambiguity', () => {
    const matches = matchImportItems(
      [{ name: 'FISH   AND CHIPS' }, { name: 'STEAK' }],
      [
        { id: 'p1', name: 'FISH AND CHIPS' },
        { id: 'p2', name: 'STEAK' },
        { id: 'p3', name: 'STEAK' },
      ],
    )
    expect(matches.get('FISH   AND CHIPS')).toBe('MATCH')
    expect(matches.get('STEAK')).toBe('AMBIGUOUS')
    expect(matchImportItems([{ name: 'SOUP' }], []).get('SOUP')).toBe('NEW')
  })

  it('normalises whitespace, case and surrounding padding', () => {
    expect(normaliseMenuName('  fish   and  chips ')).toBe('FISH AND CHIPS')
  })

  it('returns structured ambiguity issues', () => {
    const issues = importMatchIssues(
      [{ name: 'FISH' }, { name: 'STEAK' }],
      [
        { id: 'p1', name: 'FISH' },
        { id: 'p2', name: 'FISH' },
        { id: 'p3', name: 'STEAK' },
      ],
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ kind: 'AMBIGUOUS_NAME', itemName: 'FISH' })
  })
})

describe('editable import draft', () => {
  const data: MenuImportData = {
    name: 'X',
    description: null,
    groups: [
      { name: 'MAINS', area: 'RESTAURANT', items: [item('STEAK'), item('FISH')] },
      { name: 'SIDES', area: 'BAR', items: [item('FRIES', 6)] },
    ],
  }

  it('creates stable draft ids that survive edits', () => {
    const draft = createImportDraft(data)
    expect(draft.groups.map((g) => g.id)).toEqual(['g0', 'g1'])
    expect(draft.groups[0].items.map((i) => i.id)).toEqual(['g0_i0', 'g0_i1'])

    const renamed = renameImportItem(renameImportGroup(draft, 'g0', 'ENTREES'), 'g0_i0', 'STEAK SPECIAL')
    expect(renamed.groups[0].name).toBe('ENTREES')
    expect(renamed.groups[0].items[0]).toMatchObject({ id: 'g0_i0', name: 'STEAK SPECIAL' })
  })

  it('moves items between groups and reorders items and groups', () => {
    const draft = createImportDraft(data)
    const moved = moveImportItem(draft, 'g0_i1', 'g1', 0)
    expect(moved.groups[0].items.map((i) => i.id)).toEqual(['g0_i0'])
    expect(moved.groups[1].items.map((i) => i.id)).toEqual(['g0_i1', 'g1_i0'])

    const reordered = reorderImportItem(moved, 'g1_i0', -1)
    expect(reordered.groups[1].items.map((i) => i.id)).toEqual(['g1_i0', 'g0_i1'])

    const groupsMoved = moveImportGroup(reordered, 'g1', -1)
    expect(groupsMoved.groups.map((g) => g.id)).toEqual(['g1', 'g0'])
  })

  it('builds a filtered commit payload and never sends dietary fields', () => {
    const draft = createImportDraft(data)
    const payload = draftToImportData(draft, (id) => id !== 'g0_i0')
    expect(payload.groups.map((g) => g.name)).toEqual(['MAINS', 'SIDES'])
    expect(payload.groups[0].items.map((i) => i.name)).toEqual(['FISH'])
    expect(JSON.stringify(payload)).not.toContain('dietary')
  })

  it('summarises option groups with deltas', () => {
    expect(optionSummary({
      name: 'SIDE',
      required: true,
      min: 1,
      max: 1,
      choices: [
        { name: 'FRIES', priceDelta: 0 },
        { name: 'SALAD', priceDelta: 3 },
      ],
    })).toBe('SIDE · REQUIRED: FRIES $0 / SALAD +$3.00')
  })
})
