import { describe, it, expect } from 'vitest'
import { GUIDE_TYPES, GUIDE_TYPE_LABELS, guideTypeLabel, isGuideType, isProductReference } from '@/lib/guide-types'

describe('guide-types', () => {
  it('exposes the fixed taxonomy in order', () => {
    expect(GUIDE_TYPES).toEqual(['HOW_TO', 'SOP', 'FAQ', 'TRAINING', 'POLICY', 'OTHER', 'PRODUCT_REFERENCE'])
  })

  it('identifies a product reference', () => {
    expect(isProductReference('PRODUCT_REFERENCE')).toBe(true)
    expect(isProductReference('SOP')).toBe(false)
    expect(isProductReference(null)).toBe(false)
  })

  it('validates known values only', () => {
    expect(isGuideType('HOW_TO')).toBe(true)
    expect(isGuideType('SOP')).toBe(true)
    expect(isGuideType('how_to')).toBe(false)
    expect(isGuideType('BANANA')).toBe(false)
    expect(isGuideType(null)).toBe(false)
    expect(isGuideType(42)).toBe(false)
  })

  it('labels known values and nulls everything else', () => {
    expect(guideTypeLabel('HOW_TO')).toBe('HOW TO')
    expect(GUIDE_TYPE_LABELS.TRAINING).toBe('TRAINING')
    expect(guideTypeLabel('nope')).toBeNull()
    expect(guideTypeLabel(null)).toBeNull()
    expect(guideTypeLabel(undefined)).toBeNull()
  })
})
