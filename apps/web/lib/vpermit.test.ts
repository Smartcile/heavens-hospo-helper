import { describe, expect, it } from 'vitest'
import {
  adminPinError,
  describeClaimStatus,
  isTerminalClaimStatus,
  isValidAdminPin,
  isValidMembershipNumber,
  membershipNumberError,
  normaliseMembershipNumber,
  parseVpermitClaimUrl,
  parseVpermitConfirmation,
  pinHint,
} from './vpermit'

describe('parseVpermitClaimUrl', () => {
  it('accepts a claimable-event URL and normalises it', () => {
    const result = parseVpermitClaimUrl(
      'https://vpermit.com.au/tld/ClaimableEvents/Claim?code=12345',
    )
    expect(result).toEqual({
      ok: true,
      value: {
        url: 'https://vpermit.com.au/tld/ClaimableEvents/Claim?code=12345',
        code: '12345',
      },
    })
  })

  it('accepts www and http forms', () => {
    const result = parseVpermitClaimUrl(
      'http://www.vpermit.com.au/tld/ClaimableEvents/Claim?Code=ABC12',
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.code).toBe('ABC12')
  })

  it('rejects another host', () => {
    expect(parseVpermitClaimUrl('https://example.com/tld/ClaimableEvents/Claim?code=1')).toEqual({
      ok: false,
      error: 'ONLY VPERMIT.COM.AU CLAIM URLS ARE SUPPORTED',
    })
  })

  it('rejects a missing code', () => {
    expect(parseVpermitClaimUrl('https://vpermit.com.au/tld/ClaimableEvents/Claim')).toEqual({
      ok: false,
      error: 'THE URL IS MISSING A VALID CLAIM CODE',
    })
  })

  it('rejects a different path', () => {
    expect(parseVpermitClaimUrl('https://vpermit.com.au/tld/Home/About?code=1')).toEqual({
      ok: false,
      error: 'USE THE CLAIMABLE EVENT URL THAT ENDS /tld/ClaimableEvents/Claim?code=…',
    })
  })

  it('rejects blank input', () => {
    expect(parseVpermitClaimUrl('')).toEqual({
      ok: false,
      error: 'PASTE THE VPERMIT CLAIM URL',
    })
  })
})

describe('membership numbers', () => {
  it('normalises spaces and hyphens', () => {
    expect(normaliseMembershipNumber(' 123 456-7 ')).toBe('1234567')
  })

  it('accepts 4–12 digits', () => {
    expect(isValidMembershipNumber('1234')).toBe(true)
    expect(isValidMembershipNumber('123456789012')).toBe(true)
  })

  it('rejects short, long and letter input', () => {
    expect(membershipNumberError('123')).toMatch(/4–12 DIGITS/)
    expect(membershipNumberError('1234567890123')).toMatch(/4–12 DIGITS/)
    expect(membershipNumberError('ABCD12')).toMatch(/4–12 DIGITS/)
    expect(membershipNumberError('')).toBe('ENTER YOUR MEMBERSHIP NUMBER')
  })
})

describe('admin PINs', () => {
  it('accepts 4–8 digits and exposes a last-two hint', () => {
    expect(isValidAdminPin('1234')).toBe(true)
    expect(isValidAdminPin('12345678')).toBe(true)
    expect(pinHint('123456')).toBe('56')
  })

  it('rejects non-digits and wrong lengths', () => {
    expect(adminPinError('123')).toMatch(/4–8 DIGITS/)
    expect(adminPinError('abcd')).toMatch(/4–8 DIGITS/)
    expect(adminPinError('')).toBe('ENTER AN ADMIN PIN')
  })
})

describe('parseVpermitConfirmation', () => {
  const success = `
    <div class="alert alert-success">
      Congratulations, your parking session has been confirmed and will be valid between the times below:<br>
      Valid From: 15/11/2026 8:04 PM<br>
      Valid Until: 16/11/2026 12:04 AM<br><br>
      <strong>You may park in the following locations:</strong><br>
      <ul class="list-inline">
        <li>The Landing Carpark</li>
      </ul>
    </div>`

  it('parses a confirmed session', () => {
    const result = parseVpermitConfirmation(success)
    expect(result.status).toBe('CONFIRMED')
    expect(result.ok).toBe(true)
    expect(result.validFrom).toBe('15/11/2026 8:04 PM')
    expect(result.validUntil).toBe('16/11/2026 12:04 AM')
    expect(result.locations).toEqual(['The Landing Carpark'])
    expect(result.message).toMatch(/parking session has been confirmed/i)
  })

  it('parses the captcha error', () => {
    const html = `
      <div class="alert alert-dismissable alert-danger">
        <div class="validation-summary-errors">
          <ul><li>A problem occur with the captcha. Please try again later or report the problem.</li></ul>
        </div>
      </div>`
    const result = parseVpermitConfirmation(html)
    expect(result.status).toBe('CAPTCHA_BLOCKED')
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/captcha/i)
  })

  it('detects an already-active session', () => {
    const result = parseVpermitConfirmation(
      '<div class="alert alert-danger">This plate already has an existing session.</div>',
    )
    expect(result.status).toBe('ALREADY_CLAIMED')
    expect(result.ok).toBe(true)
  })

  it('detects an exhausted claim', () => {
    const result = parseVpermitConfirmation(
      '<div class="alert alert-danger">No parking sessions are available.</div>',
    )
    expect(result.status).toBe('EXHAUSTED')
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/No parking sessions/i)
  })

  it('decodes entities in location names', () => {
    const result = parseVpermitConfirmation(`
      <div class="alert alert-success">
        Congratulations, your parking session has been confirmed
        Valid From: 1/01/2027 8:00 AM
        Valid Until: 1/01/2027 12:00 PM
        <ul class="list-inline"><li>Pier &amp; Wharf</li></ul>
      </div>`)
    expect(result.status).toBe('CONFIRMED')
    expect(result.locations).toEqual(['Pier & Wharf'])
  })
})

describe('claim status labels', () => {
  it('labels terminal and manual states', () => {
    expect(isTerminalClaimStatus('CONFIRMED')).toBe(true)
    expect(isTerminalClaimStatus('PENDING')).toBe(false)
    expect(describeClaimStatus('ALREADY_CLAIMED')).toBe('ALREADY CLAIMED')
    expect(describeClaimStatus('CAPTCHA_BLOCKED')).toBe('BLOCKED')
    expect(describeClaimStatus('MANUAL_CONFIRMED')).toBe('CONFIRMED MANUALLY')
    expect(describeClaimStatus('nonsense')).toBe('FAILED')
  })
})
