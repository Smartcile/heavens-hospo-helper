import { describe, expect, it } from 'vitest'
import { matchMenuItemRows, parseMenuItemImportAnswer } from './menu-item'

describe('parseMenuItemImportAnswer', () => {
  it('parses flat products inside a fenced JSON block', () => {
    const raw = [
      'Here you go:',
      '```json',
      JSON.stringify({
        products: [
          {
            name: 'fish & chips',
            price: '$16.50',
            description: 'Beer battered',
            sizes: [{ label: '400ml', price: '16.5' }],
            options: [{ name: 'side', required: true, min: 1, max: 1, choices: [{ name: 'fries', priceDelta: 0 }] }],
          },
        ],
      }),
      '```',
    ].join('\n')
    const result = parseMenuItemImportAnswer(raw)
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].values.name).toBe('FISH & CHIPS')
    expect(result.rows[0].values.price).toBe(16.5)
    expect(result.rows[0].values.sizes[0].label).toBe('400ML')
    expect(result.rows[0].values.options[0].choices[0].name).toBe('FRIES')
  })

  it('returns an error when no JSON is present', () => {
    expect(parseMenuItemImportAnswer('sorry, no JSON')).toEqual({ error: 'NO JSON FOUND IN THE ANSWER' })
  })
})

describe('matchMenuItemRows', () => {
  const existing = [
    { id: 'a', name: 'FISH & CHIPS' },
    { id: 'b', name: 'STEAK FRITES' },
  ]

  function rows() {
    const parsed = parseMenuItemImportAnswer(JSON.stringify({
      products: [
        { name: 'Fish & Chips', price: 16.5 },
        { name: 'Steak Frites', price: 28 },
        { name: 'Lamb Rack', price: 34 },
      ],
    }))
    if ('error' in parsed) throw new Error(parsed.error)
    return parsed.rows
  }

  it('matches exact names and skips them by default', () => {
    const matched = matchMenuItemRows(rows(), existing)
    expect(matched[0].match?.status).toBe('MATCH')
    expect(matched[0].match?.targetId).toBe('a')
    expect(matched[0].action).toBe('SKIP')
    expect(matched[0].include).toBe(false)
  })

  it('reports an ambiguous exact match instead of guessing', () => {
    const matched = matchMenuItemRows(rows(), [
      ...existing,
      { id: 'c', name: 'STEAK FRITES' },
    ])
    const steak = matched[1]
    expect(steak.match?.status).toBe('AMBIGUOUS')
    expect(steak.include).toBe(false)
  })

  it('leaves a genuinely new product selected for create', () => {
    const matched = matchMenuItemRows(rows(), existing)
    expect(matched[2].match?.status).toBe('NEW')
    expect(matched[2].action).toBe('CREATE')
    expect(matched[2].include).toBe(true)
  })

  it('flags a near-copy as SIMILAR and leaves it skipped', () => {
    const parsed = parseMenuItemImportAnswer(JSON.stringify({
      products: [{ name: 'FISH & CHIP', price: 16.5 }],
    }))
    if ('error' in parsed) throw new Error(parsed.error)
    const matched = matchMenuItemRows(parsed.rows, existing)
    expect(matched[0].match?.status).toBe('SIMILAR')
    expect(matched[0].match?.targetId).toBe('a')
    expect(matched[0].include).toBe(false)
  })
})
