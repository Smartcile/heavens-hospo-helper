import { describe, it, expect } from 'vitest'
import { cleanImageList, mergeStepImages, MAX_STEP_IMAGES } from './guide-media'

describe('cleanImageList', () => {
  it('keeps string urls, trims and de-dupes', () => {
    expect(cleanImageList([' /a.png ', '/a.png', '/b.png', ''])).toEqual(['/a.png', '/b.png'])
  })

  it('drops non-strings and non-arrays', () => {
    expect(cleanImageList([1, null, { u: 1 }, '/ok.png'])).toEqual(['/ok.png'])
    expect(cleanImageList('nope')).toEqual([])
    expect(cleanImageList(undefined)).toEqual([])
  })

  it('caps the number of images', () => {
    const many = Array.from({ length: MAX_STEP_IMAGES + 5 }, (_, i) => `/i${i}.png`)
    expect(cleanImageList(many)).toHaveLength(MAX_STEP_IMAGES)
  })
})

describe('mergeStepImages', () => {
  it('prefers the ordered list when present', () => {
    expect(mergeStepImages(['/one.png', '/two.png'], '/legacy.png')).toEqual(['/one.png', '/two.png'])
  })

  it('falls back to the legacy single image', () => {
    expect(mergeStepImages([], '/legacy.png')).toEqual(['/legacy.png'])
    expect(mergeStepImages(null, '/legacy.png')).toEqual(['/legacy.png'])
  })

  it('returns an empty list when there is no image at all', () => {
    expect(mergeStepImages([], null)).toEqual([])
    expect(mergeStepImages(undefined, undefined)).toEqual([])
  })
})
