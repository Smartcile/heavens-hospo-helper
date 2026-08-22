import { describe, it, expect } from 'vitest'
import { isGiftCardLine, skuLooksLikeGiftCard, categoryIdsFromString, GIFT_CARD_CATEGORY_DEFAULT_NAME } from './gift-cards-woo'

describe('skuLooksLikeGiftCard', () => {
  it('matches GIFT anywhere in the sku, case-insensitive', () => {
    expect(skuLooksLikeGiftCard('GIFT-50')).toBe(true)
    expect(skuLooksLikeGiftCard('gc-gift-100')).toBe(true)
    expect(skuLooksLikeGiftCard('gift')).toBe(true)
    expect(skuLooksLikeGiftCard('Gift Card')).toBe(true)
  })

  it('rejects non-gift skus and empty values', () => {
    expect(skuLooksLikeGiftCard('SIRLOIN')).toBe(false)
    expect(skuLooksLikeGiftCard('')).toBe(false)
    expect(skuLooksLikeGiftCard(null)).toBe(false)
    expect(skuLooksLikeGiftCard(undefined)).toBe(false)
  })
})

describe('isGiftCardLine', () => {
  it('category-configured venue: category membership decides, SKU ignored', () => {
    const line = { sku: 'GIFT-50' }
    expect(isGiftCardLine(line, '42', ['41', '42'])).toBe(true)
    expect(isGiftCardLine(line, '42', ['41'])).toBe(false)
    // An unresolved product never matches by category — no guessing.
    expect(isGiftCardLine(line, '42', null)).toBe(false)
  })

  it('no category: legacy SKU heuristic applies', () => {
    expect(isGiftCardLine({ sku: 'GIFT-50' }, null, ['41'])).toBe(true)
    expect(isGiftCardLine({ sku: 'SIRLOIN' }, null, null)).toBe(false)
    expect(isGiftCardLine({}, null, null)).toBe(false)
  })

  it('a category-configured venue with an empty category set never matches', () => {
    expect(isGiftCardLine({ sku: 'GIFT-50' }, '42', [])).toBe(false)
  })
})

describe('categoryIdsFromString', () => {
  it('splits comma-joined category ids, trimming and dropping empties', () => {
    expect(categoryIdsFromString('41, 42, 43')).toEqual(['41', '42', '43'])
    expect(categoryIdsFromString('42')).toEqual(['42'])
    expect(categoryIdsFromString('')).toEqual([])
    expect(categoryIdsFromString(null)).toEqual([])
    expect(categoryIdsFromString(undefined)).toEqual([])
  })
})

describe('GIFT_CARD_CATEGORY_DEFAULT_NAME', () => {
  it('is the name the CREATE helper uses on the store', () => {
    expect(GIFT_CARD_CATEGORY_DEFAULT_NAME).toBe('GIFT CARDS')
  })
})
