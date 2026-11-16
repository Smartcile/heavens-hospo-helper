import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SWIFTPOS_MEMBER_MAPPING,
  groupAreaLabels,
  normaliseAreas,
  normaliseGroupInput,
  normaliseGroupSlug,
  normaliseSwiftPosMapping,
} from './customer-groups'

describe('customer-groups', () => {
  it('builds a stable slug', () => {
    expect(normaliseGroupSlug('Yacht Club & Trust')).toBe('yacht-club-and-trust')
    expect(normaliseGroupSlug('  RAYC Members  ')).toBe('rayc-members')
  })

  it('normalises a group and falls back to the default areas', () => {
    const result = normaliseGroupInput({ name: 'rayc members' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.name).toBe('RAYC MEMBERS')
    expect(result.value.slug).toBe('rayc-members')
    expect(result.value.areas).toEqual(['CUSTOMERS', 'BOOKINGS', 'ORDERS'])
    expect(result.value.mapping).toEqual(DEFAULT_SWIFTPOS_MEMBER_MAPPING)
  })

  it('always gives a gift card group its areas', () => {
    const result = normaliseGroupInput({ name: 'Gift Cards', kind: 'GIFT_CARD', areas: ['BOOKINGS'] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.areas).toEqual(expect.arrayContaining(['CUSTOMERS', 'GIFT_CARDS']))
  })

  it('adds the parking area when a parking type is linked', () => {
    const result = normaliseGroupInput({ name: 'Yacht Club', parkingTypeId: 'parking-1' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.parkingTypeId).toBe('parking-1')
    expect(result.value.areas).toContain('PARKING')
  })

  it('rejects a blank name', () => {
    expect(normaliseGroupInput({ name: '   ' })).toEqual({ ok: false, error: 'NAME IS REQUIRED' })
  })

  it('filters unknown areas and keeps a known default', () => {
    expect(normaliseAreas(['bookings', 'NOPE', 'PARKING'])).toEqual(['BOOKINGS', 'PARKING'])
    expect(normaliseAreas(undefined)).toEqual(['CUSTOMERS', 'BOOKINGS', 'ORDERS'])
  })

  it('validates the SwiftPOS mapping values', () => {
    const mapping = normaliseSwiftPosMapping({
      swiftPosTypeActive: 4,
      swiftPosStatusActive: 1,
      swiftPosTypeRemoved: 9,
      swiftPosStatusRemoved: 0,
      exportEncoding: 'utf8',
    })
    expect(mapping.typeActive).toBe(4)
    expect(mapping.exportEncoding).toBe('UTF8')
  })

  it('renders the area labels', () => {
    expect(groupAreaLabels(['CUSTOMERS', 'PARKING'])).toBe('CUSTOMERS · PARKING')
    expect(groupAreaLabels([])).toBe('NO AREAS')
  })
})
