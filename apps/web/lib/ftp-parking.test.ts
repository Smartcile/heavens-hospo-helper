import { describe, expect, it } from 'vitest'
import {
  claimStatusTone,
  defaultMemberPlate,
  describeValidity,
  memberDisplayName,
  normaliseFtpTypeInput,
  normaliseTestMemberInput,
  resolveFtpContact,
  sortMemberPlates,
} from './ftp-parking'

const claimUrl = 'https://vpermit.com.au/tld/ClaimableEvents/Claim?code=12345'

function typeBody(overrides: Record<string, unknown> = {}) {
  return {
    name: 'RAYC',
    claimUrl,
    contactName: 'Test Member',
    contactEmail: 'test@example.com',
    contactPhone: '021 123 4567',
    isActive: true,
    ...overrides,
  }
}

describe('normaliseFtpTypeInput', () => {
  it('accepts a complete active type', () => {
    const result = normaliseFtpTypeInput(typeBody())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.name).toBe('RAYC')
    expect(result.value.claimCode).toBe('12345')
    expect(result.value.claimUrl).toBe(claimUrl)
    expect(result.value.durationMinutes).toBe(240)
    expect(result.value.logPlates).toBe(true)
    expect(result.value.contactEmail).toBe('test@example.com')
  })

  it('allows an inactive type without a claim URL', () => {
    const result = normaliseFtpTypeInput(
      typeBody({ claimUrl: '', isActive: false }),
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.claimUrl).toBeNull()
  })

  it('requires a claim URL before activating', () => {
    expect(normaliseFtpTypeInput(typeBody({ claimUrl: '' }))).toEqual({
      ok: false,
      error: 'PASTE THE VPERMIT CLAIM URL BEFORE ACTIVATING',
    })
  })

  it('rejects a non-vPermit URL', () => {
    expect(
      normaliseFtpTypeInput(typeBody({ claimUrl: 'https://example.com/claim' })),
    ).toEqual({
      ok: false,
      error: 'ONLY VPERMIT.COM.AU CLAIM URLS ARE SUPPORTED',
    })
  })

  it('rejects a bad email, phone and admin PIN', () => {
    expect(normaliseFtpTypeInput(typeBody({ contactEmail: 'nope' }))).toEqual({
      ok: false,
      error: 'ENTER A VALID EMAIL OR LEAVE IT BLANK',
    })
    expect(normaliseFtpTypeInput(typeBody({ contactPhone: 'call me' }))).toEqual({
      ok: false,
      error: 'ENTER A VALID PHONE NUMBER',
    })
    expect(normaliseFtpTypeInput(typeBody({ adminPin: '12' }))).toEqual({
      ok: false,
      error: 'ADMIN PIN MUST BE 4–8 DIGITS',
    })
  })

  it('clamps duration and normalises the health plate', () => {
    const low = normaliseFtpTypeInput(typeBody({ durationMinutes: 1 }))
    const high = normaliseFtpTypeInput(typeBody({ durationMinutes: 9999 }))
    if (low.ok) expect(low.value.durationMinutes).toBe(15)
    if (high.ok) expect(high.value.durationMinutes).toBe(1440)

    const plate = normaliseFtpTypeInput(typeBody({ healthPlate: 'ab-12' }))
    if (plate.ok) expect(plate.value.healthPlate).toBe('AB12')
  })

  it('defaults logPlates on and accepts off', () => {
    const on = normaliseFtpTypeInput(typeBody())
    const off = normaliseFtpTypeInput(typeBody({ logPlates: false }))
    if (on.ok) expect(on.value.logPlates).toBe(true)
    if (off.ok) expect(off.value.logPlates).toBe(false)
  })

  it('defaults the health check mode to BROWSER', () => {
    const result = normaliseFtpTypeInput(typeBody({ healthCheckMode: 'NOPE' }))
    if (result.ok) expect(result.value.healthCheckMode).toBe('BROWSER')
    const full = normaliseFtpTypeInput(typeBody({ healthCheckMode: 'FULL' }))
    if (full.ok) expect(full.value.healthCheckMode).toBe('FULL')
  })

  it('defaults the contact email/phone switches on and accepts off', () => {
    const on = normaliseFtpTypeInput(typeBody())
    if (on.ok) {
      expect(on.value.useContactEmail).toBe(true)
      expect(on.value.useContactPhone).toBe(true)
    }
    const off = normaliseFtpTypeInput(
      typeBody({ useContactEmail: false, useContactPhone: false }),
    )
    if (off.ok) {
      expect(off.value.useContactEmail).toBe(false)
      expect(off.value.useContactPhone).toBe(false)
    }
  })
})

describe('resolveFtpContact', () => {
  const type = {
    contactName: 'VENUE OFFICE',
    contactEmail: 'parking@venue.nz',
    contactPhone: '09 123 4567',
    useContactEmail: true,
    useContactPhone: true,
  }
  const member = {
    firstName: 'TEST',
    lastName: 'MEMBER',
    email: 'member@example.com',
    phone: '021 999 8888',
  }

  it('uses the type contact details and ignores the member when enabled', () => {
    expect(resolveFtpContact({ member, type })).toEqual({
      name: 'TEST MEMBER',
      email: 'parking@venue.nz',
      phone: '09 123 4567',
    })
  })

  it('uses the member details when the switches are off', () => {
    expect(
      resolveFtpContact({
        member,
        type: { ...type, useContactEmail: false, useContactPhone: false },
      }),
    ).toEqual({
      name: 'TEST MEMBER',
      email: 'member@example.com',
      phone: '021 999 8888',
    })
  })

  it('falls back to the type contact details when there is no member', () => {
    expect(resolveFtpContact({ member: null, type })).toEqual({
      name: 'VENUE OFFICE',
      email: 'parking@venue.nz',
      phone: '09 123 4567',
    })
  })
})

describe('normaliseTestMemberInput', () => {
  const base = {
    membershipNumber: '12345',
    firstName: 'test',
    lastName: 'member',
    email: 'test@example.com',
    phone: '021 123 4567',
    parkingTypeId: 'type-1',
  }

  it('accepts a valid test member', () => {
    const result = normaliseTestMemberInput(base)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toMatchObject({
      membershipNumber: '12345',
      firstName: 'TEST',
      lastName: 'MEMBER',
      parkingTypeId: 'type-1',
      isActive: true,
    })
  })

  it('rejects bad membership numbers and names', () => {
    expect(normaliseTestMemberInput({ ...base, membershipNumber: '1' }).ok).toBe(false)
    expect(normaliseTestMemberInput({ ...base, firstName: '' }).ok).toBe(false)
    expect(normaliseTestMemberInput({ ...base, lastName: '' }).ok).toBe(false)
  })

  it('requires a parking type', () => {
    expect(normaliseTestMemberInput({ ...base, parkingTypeId: '' })).toEqual({
      ok: false,
      error: 'CHOOSE A PARKING TYPE',
    })
  })
})

describe('display helpers', () => {
  it('sorts the default plate first', () => {
    const plates = sortMemberPlates([
      { id: 'b', isDefault: false, createdAt: '2026-01-02' },
      { id: 'a', isDefault: true, createdAt: '2026-01-01' },
    ])
    expect(plates[0].id).toBe('a')
    expect(defaultMemberPlate(plates)?.id).toBe('a')
  })

  it('formats names, validity and status tone', () => {
    expect(memberDisplayName({ firstName: 'TEST', lastName: 'MEMBER' })).toBe('TEST MEMBER')
    expect(describeValidity('8:00 PM', '12:00 AM')).toBe('8:00 PM – 12:00 AM')
    expect(describeValidity(null, null)).toBe('NO VALIDITY RETURNED')
    expect(claimStatusTone('CONFIRMED')).toBe('success')
    expect(claimStatusTone('ALREADY_CLAIMED')).toBe('warning')
    expect(claimStatusTone('CAPTCHA_BLOCKED')).toBe('danger')
  })
})
