import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FOUR_HOUR_MINUTES,
  DEFAULT_FOUR_HOUR_NAME,
  DEFAULT_KIOSK_RESET_SECONDS,
  DEFAULT_STAFF_CARPARK_NAME,
  clampKioskResetSeconds,
  emailValidationError,
  ftpSettingsView,
  kioskUrlFor,
  normaliseEmail,
  normaliseFtpInput,
  normaliseHttpUrl,
} from './ftp-settings'

describe('email', () => {
  it('trims and treats blank as none', () => {
    expect(normaliseEmail('  hello@venue.nz ')).toBe('hello@venue.nz')
    expect(normaliseEmail('')).toBeNull()
  })

  it('validates only when present', () => {
    expect(emailValidationError('')).toBeNull()
    expect(emailValidationError('nope')).toContain('VALID EMAIL')
    expect(emailValidationError('ok@venue.nz')).toBeNull()
  })
})

describe('clampKioskResetSeconds', () => {
  it('defaults and clamps', () => {
    expect(clampKioskResetSeconds(undefined)).toBe(DEFAULT_KIOSK_RESET_SECONDS)
    expect(clampKioskResetSeconds(1)).toBe(15)
    expect(clampKioskResetSeconds(5000)).toBe(300)
    expect(clampKioskResetSeconds(45)).toBe(45)
  })
})

describe('normaliseHttpUrl', () => {
  it('accepts http(s) and rejects the rest', () => {
    expect(normaliseHttpUrl('https://example.com/park')).toEqual({
      ok: true,
      value: 'https://example.com/park',
    })
    expect(normaliseHttpUrl('')).toEqual({ ok: true, value: null })
    expect(normaliseHttpUrl('ftp://example.com').ok).toBe(false)
    expect(normaliseHttpUrl('not a url').ok).toBe(false)
  })
})

describe('normaliseFtpInput', () => {
  it('fills defaults for an empty save', () => {
    const result = normaliseFtpInput({})
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.contactEmail).toBeNull()
    expect(result.value.kioskRequireCode).toBe(false)
    expect(result.value.kioskAutoResetSeconds).toBe(DEFAULT_KIOSK_RESET_SECONDS)
    expect(result.value.fourHourName).toBe(DEFAULT_FOUR_HOUR_NAME)
    expect(result.value.fourHourDurationMinutes).toBe(DEFAULT_FOUR_HOUR_MINUTES)
    expect(result.value.staffCarparkName).toBe(DEFAULT_STAFF_CARPARK_NAME)
  })

  it('refuses to enable the 4 hour carpark without a URL', () => {
    const result = normaliseFtpInput({ fourHourEnabled: true })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('4 HOUR CARPARK URL')
  })

  it('refuses an invalid email', () => {
    const result = normaliseFtpInput({ contactEmail: 'bad' })
    expect(result.ok).toBe(false)
  })

  it('normalises a valid save', () => {
    const result = normaliseFtpInput({
      contactEmail: ' carpark@venue.nz ',
      kioskEnabled: true,
      kioskRequireCode: true,
      kioskAutoResetSeconds: 45,
      fourHourName: ' long stay ',
      fourHourEnabled: true,
      fourHourEntryUrl: 'https://carpark.example.com/4h',
      fourHourDurationMinutes: 300,
      staffParkingEnabled: true,
      staffCarparkName: ' staff ',
      staffCarparkNotes: '  rear gate  ',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toMatchObject({
      contactEmail: 'carpark@venue.nz',
      kioskEnabled: true,
      kioskRequireCode: true,
      kioskAutoResetSeconds: 45,
      fourHourName: 'LONG STAY',
      fourHourEnabled: true,
      fourHourDurationMinutes: 300,
      staffParkingEnabled: true,
      staffCarparkName: 'STAFF',
      staffCarparkNotes: 'rear gate',
    })
  })
})

describe('ftpSettingsView', () => {
  it('fills defaults for a missing row', () => {
    expect(ftpSettingsView(null)).toMatchObject({
      kioskEnabled: false,
      kioskRequireCode: false,
      kioskAutoResetSeconds: DEFAULT_KIOSK_RESET_SECONDS,
      fourHourName: DEFAULT_FOUR_HOUR_NAME,
      staffParkingEnabled: false,
    })
  })
})

describe('kioskUrlFor', () => {
  it('builds /park and strips a trailing slash', () => {
    expect(kioskUrlFor('https://venue.nz/')).toBe('https://venue.nz/park')
    expect(kioskUrlFor('https://venue.nz/', 'v1')).toBe('https://venue.nz/park?venue=v1')
    expect(kioskUrlFor(undefined)).toBe('http://localhost:3000/park')
  })
})
