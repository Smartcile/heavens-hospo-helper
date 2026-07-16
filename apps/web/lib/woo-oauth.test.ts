import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'
import { oauthSignedUrl, rfc3986 } from './woo-oauth'

const KEY = 'ck_test'
const SECRET = 'cs_test'
const NONCE = 'fixednonce123'
const TS = 1752624000

describe('rfc3986', () => {
  it('encodes the characters encodeURIComponent misses', () => {
    expect(rfc3986("a!b'c(d)e*f")).toBe('a%21b%27c%28d%29e%2Af')
  })

  it('encodes standard reserved characters', () => {
    expect(rfc3986('a b&c=d')).toBe('a%20b%26c%3Dd')
  })
})

describe('oauthSignedUrl', () => {
  const url = 'https://example.com/wp-json/wc/v3/products?per_page=100&page=1'

  it('includes all oauth params and preserves original query params', () => {
    const signed = oauthSignedUrl('GET', url, KEY, SECRET, NONCE, TS)
    expect(signed).toContain('per_page=100')
    expect(signed).toContain('page=1')
    expect(signed).toContain(`oauth_consumer_key=${KEY}`)
    expect(signed).toContain(`oauth_nonce=${NONCE}`)
    expect(signed).toContain('oauth_signature_method=HMAC-SHA256')
    expect(signed).toContain(`oauth_timestamp=${TS}`)
    expect(signed).toContain('oauth_signature=')
  })

  it('is deterministic for fixed nonce and timestamp', () => {
    const a = oauthSignedUrl('GET', url, KEY, SECRET, NONCE, TS)
    const b = oauthSignedUrl('GET', url, KEY, SECRET, NONCE, TS)
    expect(a).toBe(b)
  })

  it('produces a spec-correct HMAC-SHA256 signature', () => {
    const signed = oauthSignedUrl('GET', url, KEY, SECRET, NONCE, TS)
    const sig = decodeURIComponent(signed.split('oauth_signature=')[1])

    // Recompute per OAuth 1.0a spec
    const params = [
      `oauth_consumer_key=${KEY}`,
      `oauth_nonce=${NONCE}`,
      'oauth_signature_method=HMAC-SHA256',
      `oauth_timestamp=${TS}`,
      'page=1',
      'per_page=100',
    ].join('&')
    const base = [
      'GET',
      rfc3986('https://example.com/wp-json/wc/v3/products'),
      rfc3986(params),
    ].join('&')
    const expected = createHmac('sha256', `${SECRET}&`).update(base).digest('base64')
    expect(sig).toBe(expected)
  })

  it('signature changes when the method changes', () => {
    const get = oauthSignedUrl('GET', url, KEY, SECRET, NONCE, TS)
    const put = oauthSignedUrl('PUT', url, KEY, SECRET, NONCE, TS)
    expect(get.split('oauth_signature=')[1]).not.toBe(put.split('oauth_signature=')[1])
  })

  it('handles URLs without an existing query string', () => {
    const signed = oauthSignedUrl('PUT', 'https://example.com/wp-json/wc/v3/orders/9', KEY, SECRET, NONCE, TS)
    expect(signed).toContain('/wp-json/wc/v3/orders/9?')
    expect(signed).toContain('oauth_signature=')
  })
})
