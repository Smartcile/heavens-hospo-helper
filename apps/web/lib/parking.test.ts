import { describe, it, expect } from 'vitest'
import {
  normalisePlate,
  isValidPlate,
  parseScan2PayUrl,
  buildSelectTimeUrl,
  wallClockParts,
  buildParkingWindow,
  checkArrival,
  parseAntiforgeryToken,
  parseCarparkName,
  detectExistingSession,
  parseCreateSessionResult,
  applySetCookies,
  cookieHeader,
  parkingHealthState,
  normaliseCheckMode,
  formatVenueDateTime,
} from './parking'

const TZ = 'Pacific/Auckland'

describe('normalisePlate / isValidPlate', () => {
  it('uppercases and strips spaces and hyphens', () => {
    expect(normalisePlate('quz 69')).toBe('QUZ69')
    expect(normalisePlate('quz-69')).toBe('QUZ69')
    expect(normalisePlate('  Stella ')).toBe('STELLA')
  })

  it('accepts 1-6 uppercase letters/digits and rejects everything else', () => {
    expect(isValidPlate('STELLA')).toBe(true)
    expect(isValidPlate('QUZ69')).toBe(true)
    expect(isValidPlate('A')).toBe(true)
    expect(isValidPlate('')).toBe(false)
    expect(isValidPlate('TOOLONG')).toBe(false)
    expect(isValidPlate('QUZ 69')).toBe(false)
    expect(isValidPlate('QUZ-69')).toBe(false)
  })
})

describe('parseScan2PayUrl', () => {
  it('accepts the landing carpark URL and derives the id', () => {
    const result = parseScan2PayUrl('https://scan2pay.nz/Parking/Scan?carparkId=19')
    expect(result).toEqual({
      ok: true,
      url: {
        baseUrl: 'https://scan2pay.nz',
        carparkId: 19,
        entryUrl: 'https://scan2pay.nz/Parking/Scan?carparkId=19',
      },
    })
  })

  it('accepts www and a trailing slash', () => {
    const result = parseScan2PayUrl('https://www.scan2pay.nz/parking/scan/?carparkId=19')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.url.carparkId).toBe(19)
  })

  it('refuses a different host so FOSS installs cannot point it elsewhere', () => {
    const result = parseScan2PayUrl('https://example.com/Parking/Scan?carparkId=19')
    expect(result).toEqual({ ok: false, error: 'ONLY SCAN2PAY.NZ CARPARK URLS ARE SUPPORTED' })
  })

  it('refuses the wrong path', () => {
    const result = parseScan2PayUrl('https://scan2pay.nz/Parking/SelectTime?carparkId=19')
    expect(result.ok).toBe(false)
  })

  it('refuses a missing or invalid carparkId', () => {
    expect(parseScan2PayUrl('https://scan2pay.nz/Parking/Scan').ok).toBe(false)
    expect(parseScan2PayUrl('https://scan2pay.nz/Parking/Scan?carparkId=abc').ok).toBe(false)
    expect(parseScan2PayUrl('https://scan2pay.nz/Parking/Scan?carparkId=0').ok).toBe(false)
  })

  it('handles empty and malformed input', () => {
    expect(parseScan2PayUrl('')).toEqual({ ok: false, error: 'PASTE THE CARPARK URL' })
    expect(parseScan2PayUrl('not a url').ok).toBe(false)
  })
})

describe('buildSelectTimeUrl', () => {
  it('encodes the carpark name, id and plate', () => {
    const url = buildSelectTimeUrl({
      baseUrl: 'https://scan2pay.nz',
      carparkId: 19,
      carparkName: 'The Landing Carpark - Vehicle Parking',
      plate: 'QUZ69',
    })
    expect(url).toBe(
      'https://scan2pay.nz/Parking/SelectTime?CarparkId=19&CarparkName=The+Landing+Carpark+-+Vehicle+Parking&LicensePlate=QUZ69',
    )
  })
})

describe('venue wall clock', () => {
  it('formats an instant in the venue timezone', () => {
    const instant = new Date('2026-11-12T09:47:56Z')
    expect(wallClockParts(instant, TZ).dateTime).toBe('2026-11-12T22:47:56')
  })

  it('builds a 90-minute window in venue-local Scan2Pay format', () => {
    const arrivedAt = new Date('2026-11-12T09:47:56Z')
    const window = buildParkingWindow(arrivedAt, TZ, 90)
    expect(window.entry).toBe('2026-11-12T22:47:56')
    expect(window.exit).toBe('2026-11-13T00:17:56')
    expect(window.expiresAt.toISOString()).toBe('2026-11-12T11:17:56.000Z')
  })

  it('formats a short label for the UI', () => {
    expect(formatVenueDateTime(new Date('2026-11-12T09:47:56Z'), TZ)).toBe('11/12 22:47')
  })
})

describe('checkArrival', () => {
  const now = new Date('2026-11-12T10:00:00Z')

  it('rejects a future arrival', () => {
    expect(checkArrival(new Date('2026-11-12T10:10:00Z'), now).error).toBe('ARRIVAL TIME IS IN THE FUTURE')
  })

  it('allows a small clock skew', () => {
    expect(checkArrival(new Date('2026-11-12T10:01:00Z'), now).error).toBeUndefined()
  })

  it('rejects an arrival whose free window has already passed', () => {
    expect(checkArrival(new Date('2026-11-12T08:00:00Z'), now).error).toContain('FREE WINDOW HAS ALREADY PASSED')
  })

  it('allows an arrival inside the window', () => {
    expect(checkArrival(new Date('2026-11-12T09:30:00Z'), now)).toEqual({})
  })

  it('rejects an invalid date', () => {
    expect(checkArrival(new Date('nope'), now).error).toBe('ARRIVAL TIME IS NOT VALID')
  })
})

describe('parseAntiforgeryToken', () => {
  it('extracts the token from the hidden input', () => {
    const html =
      '<input name="__RequestVerificationToken" type="hidden" value="CfDJ8-abc_123" />'
    expect(parseAntiforgeryToken(html)).toBe('CfDJ8-abc_123')
  })

  it('returns null when the form is missing', () => {
    expect(parseAntiforgeryToken('<html></html>')).toBeNull()
  })
})

describe('parseCarparkName', () => {
  it('reads the location div', () => {
    expect(
      parseCarparkName('<div class="location">The Landing Carpark - Vehicle Parking</div>'),
    ).toBe('The Landing Carpark - Vehicle Parking')
  })

  it('returns null when absent', () => {
    expect(parseCarparkName('<div>Nothing</div>')).toBeNull()
  })
})

describe('detectExistingSession', () => {
  it('is false for a fresh plate', () => {
    const html =
      '<input id="isExtendingSession" name="IsExtendingSession" value="False" />' +
      '<input id="existingTransactionId" name="ExistingTransactionId" value="" />'
    expect(detectExistingSession(html).active).toBe(false)
  })

  it('is true when a transaction id is present', () => {
    const html = '<input id="existingTransactionId" name="ExistingTransactionId" value="12345" />'
    const session = detectExistingSession(html)
    expect(session.active).toBe(true)
    expect(session.transactionId).toBe('12345')
  })

  it('is true when extending a session', () => {
    const html = '<input id="isExtendingSession" name="IsExtendingSession" value="True" />'
    expect(detectExistingSession(html).active).toBe(true)
  })

  it('is true when an expired-session notice is rendered', () => {
    expect(detectExistingSession('<div class="expired-session-notice"></div>').active).toBe(true)
  })
})

describe('parseCreateSessionResult', () => {
  it('treats a success page as confirmed', () => {
    const result = parseCreateSessionResult({
      httpStatus: 200,
      html: '<h1>Success</h1><p>Your parking session is confirmed. Paid until 5:00pm.</p>',
    })
    expect(result.status).toBe('CONFIRMED')
    expect(result.ok).toBe(true)
  })

  it('extracts a confirmation reference', () => {
    const result = parseCreateSessionResult({
      httpStatus: 200,
      html: '<p>Success. Transaction ID: 987654</p>',
    })
    expect(result.confirmationRef).toBe('987654')
  })

  it('treats a 5xx as a failure', () => {
    const result = parseCreateSessionResult({ httpStatus: 500, html: '<h1>Server error</h1>' })
    expect(result.status).toBe('FAILED')
    expect(result.ok).toBe(false)
    expect(result.message).toBe('SCAN2PAY RETURNED 500')
  })

  it('detects an existing session', () => {
    const result = parseCreateSessionResult({
      httpStatus: 200,
      html: '<p>This plate already has an active session.</p>',
    })
    expect(result.status).toBe('ALREADY_ACTIVE')
  })

  it('detects validation errors', () => {
    const result = parseCreateSessionResult({
      httpStatus: 200,
      html: '<div class="text-danger">Licence plate is required</div>',
    })
    expect(result.status).toBe('FAILED')
    expect(result.ok).toBe(false)
  })

  it('trims the response to a short snippet', () => {
    const html = `<p>Success</p><div>${'x'.repeat(1000)}</div>`
    const result = parseCreateSessionResult({ httpStatus: 200, html })
    expect(result.snippet.length).toBeLessThanOrEqual(280)
  })
})

describe('cookie jar', () => {
  it('merges Set-Cookie values and builds a Cookie header', () => {
    let jar = applySetCookies({}, [
      '.AspNetCore.Antiforgery.abc=CfDJ8xyz; path=/; secure; samesite=strict; httponly',
      '.AspNetCore.Session=session123; path=/',
    ])
    expect(jar).toEqual({
      '.AspNetCore.Antiforgery.abc': 'CfDJ8xyz',
      '.AspNetCore.Session': 'session123',
    })
    expect(cookieHeader(jar)).toBe('.AspNetCore.Antiforgery.abc=CfDJ8xyz; .AspNetCore.Session=session123')

    jar = applySetCookies(jar, ['.AspNetCore.Session=updated; path=/'])
    expect(jar['.AspNetCore.Session']).toBe('updated')
  })

  it('ignores junk', () => {
    expect(applySetCookies({}, ['', 'junk', '=novalue'])).toEqual({})
  })
})

describe('parkingHealthState', () => {
  const now = new Date('2026-11-12T10:00:00Z')

  it('reports never-checked as stale', () => {
    expect(parkingHealthState(null, null, null, now)).toEqual({
      ok: false,
      stale: true,
      message: 'NO CHECK HAS RUN YET',
    })
  })

  it('reports an old check as stale', () => {
    const state = parkingHealthState(new Date('2026-11-10T10:00:00Z'), true, 'OK', now)
    expect(state.stale).toBe(true)
    expect(state.ok).toBe(false)
    expect(state.message).toContain('48H AGO')
  })

  it('reports a recent passing check as healthy', () => {
    expect(parkingHealthState(new Date('2026-11-12T05:00:00Z'), true, 'OK', now)).toEqual({
      ok: true,
      stale: false,
      message: 'OK',
    })
  })

  it('reports a recent failing check as unhealthy', () => {
    const state = parkingHealthState(new Date('2026-11-12T05:00:00Z'), false, 'HTTP 502', now)
    expect(state).toEqual({ ok: false, stale: false, message: 'HTTP 502' })
  })
})

describe('normaliseCheckMode', () => {
  it('defaults unknown values to READINESS', () => {
    expect(normaliseCheckMode('FULL')).toBe('FULL')
    expect(normaliseCheckMode('OFF')).toBe('OFF')
    expect(normaliseCheckMode('READINESS')).toBe('READINESS')
    expect(normaliseCheckMode('full')).toBe('READINESS')
    expect(normaliseCheckMode(undefined)).toBe('READINESS')
  })
})
