import { describe, expect, it } from 'vitest'
import {
  appendPlateKey,
  describeKioskResult,
  formatKioskClock,
  formatKioskCountdown,
  isValidKioskCode,
  kioskCodeError,
  kioskCountdownProgress,
  normaliseKioskCode,
  removeLastPlateKey,
} from './parking-kiosk'

describe('kiosk code', () => {
  it('uppercases and strips separators', () => {
    expect(normaliseKioskCode(' ab-12 cd ')).toBe('AB12CD')
  })

  it('requires at least six characters', () => {
    expect(isValidKioskCode('ABC12')).toBe(false)
    expect(kioskCodeError('ABC12')).toContain('AT LEAST 6')
    expect(isValidKioskCode('ABC123')).toBe(true)
  })
})

describe('plate keypad', () => {
  it('appends uppercased alphanumerics only', () => {
    expect(appendPlateKey('', 'a')).toBe('A')
    expect(appendPlateKey('AB', '-')).toBe('AB')
    expect(appendPlateKey('AB', 'c1')).toBe('ABC1')
  })

  it('caps the plate at six characters', () => {
    expect(appendPlateKey('ABCDE', 'F')).toBe('ABCDEF')
    expect(appendPlateKey('ABCDEF', 'G')).toBe('ABCDEF')
    expect(appendPlateKey('', 'ABCDEFGH')).toBe('ABCDEF')
  })

  it('removes the last character', () => {
    expect(removeLastPlateKey('ABC')).toBe('AB')
    expect(removeLastPlateKey('')).toBe('')
  })
})

describe('countdown', () => {
  it('formats minutes and seconds', () => {
    expect(formatKioskCountdown(0)).toBe('0:00')
    expect(formatKioskCountdown(45)).toBe('0:45')
    expect(formatKioskCountdown(90)).toBe('1:30')
    expect(formatKioskCountdown(-5)).toBe('0:00')
  })

  it('reports a shrinking progress fraction', () => {
    expect(kioskCountdownProgress(60, 60)).toBe(1)
    expect(kioskCountdownProgress(30, 60)).toBe(0.5)
    expect(kioskCountdownProgress(0, 60)).toBe(0)
    expect(kioskCountdownProgress(30, 0)).toBe(0)
    expect(kioskCountdownProgress(90, 60)).toBe(1)
  })
})

describe('labels', () => {
  it('formats venue-local clock time', () => {
    const date = new Date('2026-11-12T09:15:00Z')
    expect(formatKioskClock(date, 'Pacific/Auckland')).toBe('22:15')
  })

  it('describes the three result states', () => {
    expect(describeKioskResult('CONFIRMED')).toBe('REGISTERED')
    expect(describeKioskResult('ALREADY_ACTIVE')).toBe('ALREADY REGISTERED')
    expect(describeKioskResult('FAILED')).toBe('COULD NOT REGISTER')
  })
})
