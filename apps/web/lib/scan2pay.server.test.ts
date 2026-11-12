import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  fetchSelectTime,
  fetchCarparkName,
  registerParking,
  checkParking,
  type ParkingTarget,
} from './scan2pay.server'

const TARGET: ParkingTarget = {
  baseUrl: 'https://scan2pay.nz',
  carparkId: 19,
  carparkName: 'The Landing Carpark - Vehicle Parking',
  durationMinutes: 90,
}

const TZ = 'Pacific/Auckland'
const ARRIVED = new Date('2026-11-12T09:47:56Z')

const SELECT_HTML = `
<form method="post" id="parkingForm" action="/Parking/CreateSession">
  <input type="hidden" id="CarparkId" name="CarparkId" value="19" />
  <input type="hidden" id="isExtendingSession" name="IsExtendingSession" value="False" />
  <input type="hidden" id="existingTransactionId" name="ExistingTransactionId" value="" />
  <input name="__RequestVerificationToken" type="hidden" value="TOKEN123" />
</form>`

function selectResponse(html = SELECT_HTML): Response {
  return new Response(html, {
    status: 200,
    headers: { 'set-cookie': '.AspNetCore.Antiforgery.abc=CfCookie; path=/; secure; httponly' },
  })
}

function installFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const mock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(handler(String(input), init)))
  vi.stubGlobal('fetch', mock)
  return mock
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('fetchSelectTime', () => {
  it('returns the token, existing-session state and antiforgery cookie', async () => {
    installFetch(() => selectResponse())
    const result = await fetchSelectTime(TARGET, 'quz 69')
    expect(result.ok).toBe(true)
    expect(result.token).toBe('TOKEN123')
    expect(result.existing.active).toBe(false)
    expect(result.jar['.AspNetCore.Antiforgery.abc']).toBe('CfCookie')
    expect(result.url).toContain('LicensePlate=QUZ69')
  })

  it('detects an existing session', async () => {
    const html = SELECT_HTML.replace(
      '<input type="hidden" id="existingTransactionId" name="ExistingTransactionId" value="" />',
      '<input type="hidden" id="existingTransactionId" name="ExistingTransactionId" value="TX-1" />',
    )
    installFetch(() => selectResponse(html))
    const result = await fetchSelectTime(TARGET, 'QUZ69')
    expect(result.existing.active).toBe(true)
    expect(result.existing.transactionId).toBe('TX-1')
  })
})

describe('registerParking', () => {
  it('submits the form with the token, cookie and 90-minute window', async () => {
    const mock = installFetch((url) => {
      if (url.includes('/Parking/SelectTime')) return selectResponse()
      if (url.includes('/Parking/CreateSession')) {
        return new Response('<h1>Success</h1><p>Transaction ID: 12345</p>', { status: 200 })
      }
      throw new Error(`unexpected url ${url}`)
    })

    const result = await registerParking({ target: TARGET, plate: 'quz 69', arrivedAt: ARRIVED, timezone: TZ })

    expect(result.status).toBe('CONFIRMED')
    expect(result.ok).toBe(true)
    expect(result.licensePlate).toBe('QUZ69')
    expect(result.confirmationRef).toBe('12345')
    expect(result.window.entry).toBe('2026-11-12T22:47:56')
    expect(result.window.exit).toBe('2026-11-13T00:17:56')
    expect(mock).toHaveBeenCalledTimes(2)

    const postCall = mock.mock.calls[1]
    const init = postCall[1] as RequestInit
    expect(init.method).toBe('POST')
    const headers = init.headers as Headers
    expect(headers.get('cookie')).toContain('.AspNetCore.Antiforgery.abc=CfCookie')
    expect(headers.get('referer')).toContain('/Parking/SelectTime')

    const body = new URLSearchParams(String(init.body))
    expect(body.get('CarparkId')).toBe('19')
    expect(body.get('LicensePlate')).toBe('QUZ69')
    expect(body.get('EntryTime')).toBe('2026-11-12T22:47:56')
    expect(body.get('ExitTime')).toBe('2026-11-13T00:17:56')
    expect(body.get('CalculatedFee')).toBe('0')
    expect(body.get('__RequestVerificationToken')).toBe('TOKEN123')
  })

  it('does not resubmit when the plate already has a session', async () => {
    const html = SELECT_HTML.replace(
      '<input type="hidden" id="existingTransactionId" name="ExistingTransactionId" value="" />',
      '<input type="hidden" id="existingTransactionId" name="ExistingTransactionId" value="TX-1" />',
    )
    const mock = installFetch(() => selectResponse(html))

    const result = await registerParking({ target: TARGET, plate: 'QUZ69', arrivedAt: ARRIVED, timezone: TZ })

    expect(result.status).toBe('ALREADY_ACTIVE')
    expect(result.ok).toBe(true)
    expect(mock).toHaveBeenCalledTimes(1)
  })

  it('fails when the form token is missing', async () => {
    installFetch(() => selectResponse('<form><input name="CarparkId" value="19" /></form>'))
    const result = await registerParking({ target: TARGET, plate: 'QUZ69', arrivedAt: ARRIVED, timezone: TZ })
    expect(result.status).toBe('FAILED')
    expect(result.message).toContain('NO ANTIFORGERY TOKEN')
  })

  it('fails when Scan2Pay returns an error status', async () => {
    installFetch(() => new Response('down', { status: 503 }))
    const result = await registerParking({ target: TARGET, plate: 'QUZ69', arrivedAt: ARRIVED, timezone: TZ })
    expect(result.status).toBe('FAILED')
    expect(result.message).toBe('SCAN2PAY RETURNED 503')
  })

  it('fails when the network throws', async () => {
    installFetch(() => {
      throw new Error('getaddrinfo ENOTFOUND')
    })
    const result = await registerParking({ target: TARGET, plate: 'QUZ69', arrivedAt: ARRIVED, timezone: TZ })
    expect(result.status).toBe('FAILED')
    expect(result.message).toContain('COULD NOT REACH SCAN2PAY')
  })

  it('surfaces a validation error from the POST response', async () => {
    installFetch((url) => {
      if (url.includes('/Parking/SelectTime')) return selectResponse()
      return new Response('<div class="text-danger">Licence plate is required</div>', { status: 200 })
    })
    const result = await registerParking({ target: TARGET, plate: 'QUZ69', arrivedAt: ARRIVED, timezone: TZ })
    expect(result.status).toBe('FAILED')
  })

  it('rejects an invalid plate without calling Scan2Pay', async () => {
    const mock = installFetch(() => selectResponse())
    const result = await registerParking({ target: TARGET, plate: 'TOOLONG', arrivedAt: ARRIVED, timezone: TZ })
    expect(result.status).toBe('FAILED')
    expect(result.message).toBe('INVALID NUMBER PLATE')
    expect(mock).not.toHaveBeenCalled()
  })

  it('follows a redirect from the POST to the confirmation page', async () => {
    const mock = installFetch((url) => {
      if (url.includes('/Parking/SelectTime')) return selectResponse()
      if (url.includes('/Parking/CreateSession')) {
        return new Response('', { status: 302, headers: { location: '/Parking/Confirmation/12345' } })
      }
      if (url.includes('/Parking/Confirmation/12345')) {
        return new Response('<h1>Success</h1><p>Confirmed</p>', { status: 200 })
      }
      throw new Error(`unexpected url ${url}`)
    })
    const result = await registerParking({ target: TARGET, plate: 'QUZ69', arrivedAt: ARRIVED, timezone: TZ })
    expect(result.status).toBe('CONFIRMED')
    expect(mock).toHaveBeenCalledTimes(3)
  })

  it('completes the payment step and parses the final confirmation page', async () => {
    const mock = installFetch((url) => {
      if (url.includes('/Parking/SelectTime')) return selectResponse()
      if (url.includes('/Parking/CreateSession')) {
        return new Response('', { status: 302, headers: { location: '/Parking/Payment?token=PAYTOKEN' } })
      }
      if (url.includes('/Parking/Payment?token=PAYTOKEN')) {
        return new Response('<button>CONFIRM FREE PARKING</button>', { status: 200 })
      }
      if (url.includes('/Parking/ProcessPayment?token=PAYTOKEN')) {
        return new Response(
          JSON.stringify({ redirectUrl: 'https://scan2pay.nz/Parking/Confirmation?token=PAYTOKEN' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      if (url.includes('/Parking/Confirmation?token=PAYTOKEN')) {
        return new Response(
          '<h1>Payment Successful!</h1><p>Paid until 1:28 AM</p><p>Free Transaction</p>',
          { status: 200 },
        )
      }
      throw new Error(`unexpected url ${url}`)
    })

    const result = await registerParking({ target: TARGET, plate: 'QUZ69', arrivedAt: ARRIVED, timezone: TZ })

    expect(result.status).toBe('CONFIRMED')
    expect(result.ok).toBe(true)
    expect(result.message).toBe('PARKING REGISTERED')
    expect(result.confirmationRef).toBe('PAYTOKEN')
    expect(mock).toHaveBeenCalledTimes(5)

    const processCall = mock.mock.calls.find((call) => String(call[0]).includes('/Parking/ProcessPayment'))
    expect(processCall).toBeTruthy()
    const init = processCall?.[1] as RequestInit
    expect(init.method).toBe('POST')
    expect((init.headers as Headers).get('content-type')).toBe('application/json')
    expect((init.headers as Headers).get('cookie')).toContain('.AspNetCore.Antiforgery.abc=CfCookie')
    expect(String(init.body)).toBe('{"CustomerEmail":""}')
  })

  it('reports a paid Stripe flow instead of silently confirming', async () => {
    installFetch((url) => {
      if (url.includes('/Parking/SelectTime')) return selectResponse()
      if (url.includes('/Parking/CreateSession')) {
        return new Response('', { status: 302, headers: { location: '/Parking/Payment?token=PAYTOKEN' } })
      }
      if (url.includes('/Parking/Payment?token=PAYTOKEN')) {
        return new Response('<button>CONFIRM</button>', { status: 200 })
      }
      if (url.includes('/Parking/ProcessPayment?token=PAYTOKEN')) {
        return new Response(JSON.stringify({ sessionId: 'cs_test_123' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      throw new Error(`unexpected url ${url}`)
    })

    const result = await registerParking({ target: TARGET, plate: 'QUZ69', arrivedAt: ARRIVED, timezone: TZ })
    expect(result.status).toBe('FAILED')
    expect(result.message).toContain('PAYMENT REQUIRED')
  })

  it('reports a failed payment step', async () => {
    installFetch((url) => {
      if (url.includes('/Parking/SelectTime')) return selectResponse()
      if (url.includes('/Parking/CreateSession')) {
        return new Response('', { status: 302, headers: { location: '/Parking/Payment?token=PAYTOKEN' } })
      }
      if (url.includes('/Parking/Payment?token=PAYTOKEN')) {
        return new Response('<button>CONFIRM</button>', { status: 200 })
      }
      if (url.includes('/Parking/ProcessPayment?token=PAYTOKEN')) {
        return new Response('down', { status: 500 })
      }
      throw new Error(`unexpected url ${url}`)
    })

    const result = await registerParking({ target: TARGET, plate: 'QUZ69', arrivedAt: ARRIVED, timezone: TZ })
    expect(result.status).toBe('FAILED')
    expect(result.message).toBe('SCAN2PAY PAYMENT STEP RETURNED 500')
  })
})

describe('checkParking', () => {
  it('READINESS only fetches the form (no POST)', async () => {
    const mock = installFetch(() => selectResponse())
    const result = await checkParking({ target: TARGET, plate: 'STELLA', mode: 'READINESS', timezone: TZ })
    expect(result).toEqual({
      ok: true,
      httpStatus: 200,
      message: 'FORM READY',
      mode: 'READINESS',
      snippet: '',
      existing: { active: false, transactionId: undefined, expiry: undefined },
    })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  it('FULL submits the fake plate end-to-end', async () => {
    const mock = installFetch((url) => {
      if (url.includes('/Parking/SelectTime')) return selectResponse()
      return new Response('<h1>Success</h1><p>Transaction ID: 999</p>', { status: 200 })
    })
    const result = await checkParking({ target: TARGET, plate: 'STELLA', mode: 'FULL', timezone: TZ })
    expect(result.ok).toBe(true)
    expect(result.mode).toBe('FULL')
    expect(result.confirmationRef).toBe('999')
    expect(mock).toHaveBeenCalledTimes(2)
  })

  it('reports a missing token as a failure', async () => {
    installFetch(() => selectResponse('<form></form>'))
    const result = await checkParking({ target: TARGET, plate: 'STELLA', mode: 'READINESS', timezone: TZ })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('NO ANTIFORGERY TOKEN')
  })
})

describe('fetchCarparkName', () => {
  it('reads the location div from the Scan page', async () => {
    installFetch(() =>
      new Response('<div class="location">The Landing Carpark - Vehicle Parking</div>', { status: 200 }),
    )
    await expect(fetchCarparkName({ baseUrl: 'https://scan2pay.nz', carparkId: 19 })).resolves.toBe(
      'The Landing Carpark - Vehicle Parking',
    )
  })

  it('returns null when the page is not ok', async () => {
    installFetch(() => new Response('nope', { status: 404 }))
    await expect(fetchCarparkName({ baseUrl: 'https://scan2pay.nz', carparkId: 19 })).resolves.toBeNull()
  })
})
