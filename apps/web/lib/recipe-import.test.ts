import { describe, it, expect } from 'vitest'
import { missingProductFields, type ImportableProduct } from './recipe-import'

const product = (over: Partial<ImportableProduct> = {}): ImportableProduct => ({
  price: 12,
  wooCategoryId: '5',
  dietaryInfo: 'Gluten',
  imageUrl: '/api/upload/x.jpg',
  shortDescription: 'Nice',
  ...over,
})

describe('missingProductFields', () => {
  it('returns no gaps for a complete product', () => {
    expect(missingProductFields(product())).toEqual([])
  })

  it('flags zero and null prices', () => {
    expect(missingProductFields(product({ price: 0 })).map((g) => g.key)).toEqual(['price'])
    expect(missingProductFields(product({ price: null })).map((g) => g.key)).toEqual(['price'])
  })

  it('flags every empty field', () => {
    const gaps = missingProductFields({
      price: 0,
      wooCategoryId: null,
      dietaryInfo: null,
      imageUrl: null,
      shortDescription: null,
    })
    expect(gaps.map((g) => g.key)).toEqual(['price', 'category', 'dietary', 'image', 'description'])
  })
})
