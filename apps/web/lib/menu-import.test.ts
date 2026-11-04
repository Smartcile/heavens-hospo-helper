import { describe, it, expect } from 'vitest'
import {
  buildMenuImportPrompt,
  flattenMenuImport,
  matchImportItems,
  parseMenuImportAnswer,
} from '@/lib/menu-import'

const answer = JSON.stringify({
  menu: {
    name: 'dinner',
    description: 'Evening service',
    groups: [
      {
        name: 'mains',
        items: [
          { name: 'steak', price: '$32.50', description: 'with chips', dietary: ['MILK'] },
          { name: 'fish', price: 28, dietary: ['FISH', 'GLUTEN'] },
        ],
      },
    ],
  },
})

describe('buildMenuImportPrompt', () => {
  it('names the menu and lists the allergen vocabulary', () => {
    const prompt = buildMenuImportPrompt({ menuNameHint: 'summer menu', venueName: 'The Eatery' })
    expect(prompt).toContain('"SUMMER MENU"')
    expect(prompt).toContain('The Eatery')
    expect(prompt).toContain('GLUTEN')
    expect(prompt).toContain('STRICT JSON')
  })
})

describe('parseMenuImportAnswer', () => {
  it('parses plain JSON and normalises names/prices/allergens', () => {
    const result = parseMenuImportAnswer(answer)
    if ('error' in result) throw new Error(result.error)

    expect(result.data.name).toBe('DINNER')
    expect(result.issues).toEqual([])
    const flat = flattenMenuImport(result.data)
    expect(flat).toHaveLength(2)
    expect(flat[0]).toMatchObject({
      group: 'MAINS',
      item: { name: 'STEAK', price: 32.5, description: 'with chips', dietary: ['MILK'] },
    })
  })

  it('accepts fenced JSON surrounded by prose', () => {
    const result = parseMenuImportAnswer(
      `Here you go:\n\`\`\`json\n${answer}\n\`\`\`\nHope that helps.`,
    )
    if ('error' in result) throw new Error(result.error)
    expect(result.data.groups[0].items).toHaveLength(2)
  })

  it('flags a missing price and drops unknown dietary claims', () => {
    const result = parseMenuImportAnswer(JSON.stringify({
      menu: {
        name: 'LUNCH',
        groups: [{ name: 'MAINS', items: [{ name: 'SOUP', price: null, dietary: ['GF', 'MILK'] }] }],
      },
    }))
    if ('error' in result) throw new Error(result.error)

    expect(result.data.groups[0].items[0].price).toBeNull()
    expect(result.data.groups[0].items[0].dietary).toEqual(['MILK'])
    expect(result.issues.some((i) => i.includes('NO VALID PRICE'))).toBe(true)
    expect(result.issues.some((i) => i.includes('GF'))).toBe(true)
  })

  it('uppercases, dedupes and skips nameless rows', () => {
    const result = parseMenuImportAnswer(JSON.stringify({
      menu: {
        name: 'bar',
        groups: [{
          name: 'drinks',
          items: [
            { name: 'latte', price: 5 },
            { name: 'LATTE', price: 6 },
            { name: '', price: 4 },
          ],
        }],
      },
    }))
    if ('error' in result) throw new Error(result.error)

    expect(result.data.groups[0].items).toHaveLength(1)
    expect(result.data.groups[0].items[0].name).toBe('LATTE')
    expect(result.issues.some((i) => i.includes('DUPLICATE'))).toBe(true)
    expect(result.issues.some((i) => i.includes('NO NAME'))).toBe(true)
  })

  it('returns an error when there is no JSON or no items', () => {
    expect('error' in parseMenuImportAnswer('')).toBe(true)
    expect('error' in parseMenuImportAnswer('no json here')).toBe(true)
    expect('error' in parseMenuImportAnswer('{"menu":{"name":"X","groups":[]}}')).toBe(true)
  })
})

describe('matchImportItems', () => {
  it('classifies MATCH, NEW and AMBIGUOUS by name', () => {
    const result = parseMenuImportAnswer(answer)
    if ('error' in result) throw new Error(result.error)

    const matches = matchImportItems(flattenMenuImport(result.data).map((r) => r.item), [
      { id: 'p1', name: 'STEAK' },
      { id: 'p2', name: 'FISH' },
      { id: 'p3', name: 'FISH' },
    ])

    expect(matches.get('STEAK')).toBe('MATCH')
    expect(matches.get('FISH')).toBe('AMBIGUOUS')
    expect(matchImportItems([{ name: 'SOUP', price: 4, description: null, dietary: [] }], []).get('SOUP')).toBe('NEW')
  })
})
