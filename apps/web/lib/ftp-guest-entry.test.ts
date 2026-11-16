import { describe, expect, it } from 'vitest'
import {
  GUEST_CLAIM_CREDENTIAL_KIND,
  describeGuestSlots,
  formatGuestNextFree,
  guestEntryLabel,
  guestPinError,
  guestResultTitle,
  guestResultTone,
  guestSlotState,
  normaliseGuestLimit,
} from './ftp-guest-entry'

describe('guest labels', () => {
  it('falls back to the default label', () => {
    expect(guestEntryLabel('')).toBe('CUSTOMER ENTRY')
    expect(guestEntryLabel('  rayc guests ')).toBe('RAYC GUESTS')
  })

  it('validates the shared PIN', () => {
    expect(guestPinError('1234')).toBeNull()
    expect(guestPinError('12')).toContain('4')
    expect(guestPinError('abcd')).toContain('4')
  })

  it('clamps the plate limit', () => {
    expect(normaliseGuestLimit('0')).toBe(1)
    expect(normaliseGuestLimit('99999')).toBe(9999)
    expect(normaliseGuestLimit('25')).toBe(25)
    expect(normaliseGuestLimit('')).toBe(50)
  })
})

describe('guestSlotState', () => {
  const now = new Date('2026-11-16T10:00:00.000Z')
  const minutesAgo = (minutes: number) =>
    new Date(now.getTime() - minutes * 60_000)

  it('counts only claims inside the rolling window', () => {
    const state = guestSlotState({
      limitEnabled: true,
      limit: 5,
      durationMinutes: 240,
      now,
      claims: [
        { createdAt: minutesAgo(30) },
        { createdAt: minutesAgo(120) },
        { createdAt: minutesAgo(300) },
      ],
    })
    expect(state.used).toBe(2)
    expect(state.remaining).toBe(3)
    expect(state.full).toBe(false)
    expect(state.nextFreeAt).toBeNull()
  })

  it('reports the oldest expiry when full', () => {
    const state = guestSlotState({
      limitEnabled: true,
      limit: 2,
      durationMinutes: 240,
      now,
      claims: [{ createdAt: minutesAgo(60) }, { createdAt: minutesAgo(30) }],
    })
    expect(state.full).toBe(true)
    expect(state.remaining).toBe(0)
    expect(state.nextFreeAt?.toISOString()).toBe(
      new Date(now.getTime() + 180 * 60_000).toISOString(),
    )
  })

  it('does not block when the limit is off', () => {
    const state = guestSlotState({
      limitEnabled: false,
      limit: 2,
      durationMinutes: 240,
      now,
      claims: [{ createdAt: minutesAgo(1) }, { createdAt: minutesAgo(2) }],
    })
    expect(state.limit).toBeNull()
    expect(state.full).toBe(false)
    expect(state.remaining).toBeNull()
    expect(describeGuestSlots(state)).toBe('2 PLATES ENTERED')
  })
})

describe('guest result helpers', () => {
  it('formats the next free time in the venue timezone', () => {
    expect(formatGuestNextFree('2026-11-16T01:30:00.000Z', 'Pacific/Auckland')).toBe(
      '14:30',
    )
  })

  it('labels results', () => {
    expect(guestResultTitle('CONFIRMED')).toBe('PARKING CONFIRMED')
    expect(guestResultTitle('ALREADY_CLAIMED')).toBe('ALREADY REGISTERED')
    expect(guestResultTone('CONFIRMED')).toBe('success')
    expect(guestResultTone('ALREADY_CLAIMED')).toBe('warning')
    expect(guestResultTone('FAILED')).toBe('danger')
  })

  it('uses a distinct credential kind for guest claims', () => {
    expect(GUEST_CLAIM_CREDENTIAL_KIND).toBe('GUEST')
  })
})
