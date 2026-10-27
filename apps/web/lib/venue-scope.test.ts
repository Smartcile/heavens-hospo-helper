import { describe, expect, it } from 'vitest'
import { resolveEffectiveVenueId } from './venue-scope'

type Session = Parameters<typeof resolveEffectiveVenueId>[0]

function session(role: string, venueId: string, availableVenueIds: string[]): Session {
  return { user: { role, venueId, availableVenueIds } }
}

describe('resolveEffectiveVenueId', () => {
  it('uses the active-venue cookie for a manager when it is an available venue', () => {
    const s = session('MANAGER', 'home', ['home', 'other'])
    expect(resolveEffectiveVenueId(s, 'other')).toBe('other')
  })

  it('falls back to the home venue when the cookie is not an available venue', () => {
    const s = session('MANAGER', 'home', ['home'])
    expect(resolveEffectiveVenueId(s, 'other')).toBe('home')
  })

  it('falls back to the home venue when there is no cookie', () => {
    const s = session('MANAGER', 'home', ['home', 'other'])
    expect(resolveEffectiveVenueId(s, null)).toBe('home')
  })

  it('returns the home venue for an admin', () => {
    const s = session('ADMIN', 'home', ['home', 'other'])
    expect(resolveEffectiveVenueId(s, 'other')).toBe('home')
  })

  it('returns null without a session', () => {
    expect(resolveEffectiveVenueId(null, 'other')).toBeNull()
  })
})
