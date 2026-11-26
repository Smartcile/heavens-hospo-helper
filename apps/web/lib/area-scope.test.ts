import { describe, expect, it } from 'vitest'
import { areaWhereForVenues, isAreaOwner } from './area-scope'

describe('areaWhereForVenues', () => {
  it('matches owned rooms and rooms shared into the venue', () => {
    const where = areaWhereForVenues(['v1'])
    expect(where).toEqual({
      OR: [
        { venueId: { in: ['v1'] } },
        { venueLinks: { some: { venueId: { in: ['v1'] }, deletedAt: null } } },
      ],
    })
  })

  it('unions across every accessible venue and de-duplicates them', () => {
    const where = areaWhereForVenues(['v1', 'v2', 'v1', null, undefined])
    expect(where.OR[0]).toEqual({ venueId: { in: ['v1', 'v2'] } })
    expect(where.OR[1]).toEqual({
      venueLinks: { some: { venueId: { in: ['v1', 'v2'] }, deletedAt: null } },
    })
  })

  it('matches nothing when no venue is scoped', () => {
    expect(areaWhereForVenues([])).toEqual({ OR: [] })
    expect(areaWhereForVenues([null, ''])).toEqual({ OR: [] })
  })
})

describe('isAreaOwner', () => {
  it('is true only for the owning venue', () => {
    expect(isAreaOwner('v1', 'v1')).toBe(true)
    expect(isAreaOwner('v1', 'v2')).toBe(false)
    expect(isAreaOwner('v1', null)).toBe(false)
  })
})
