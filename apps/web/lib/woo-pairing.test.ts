import { describe, it, expect } from 'vitest'
import {
  normaliseStoreUrl,
  parsePairingPayload,
  webhookDeliveryUrl,
  generateWebhookSecret,
} from './woo-pairing'

describe('woo-pairing', () => {
  it('normalises store URLs and rejects anything not http(s)', () => {
    expect(normaliseStoreUrl('https://shop.example.co.nz/')).toBe('https://shop.example.co.nz')
    expect(normaliseStoreUrl('  http://localhost:8080///  ')).toBe('http://localhost:8080')
    expect(normaliseStoreUrl('ftp://shop.example.co.nz')).toBeNull()
    expect(normaliseStoreUrl('shop.example.co.nz')).toBeNull()
    expect(normaliseStoreUrl('')).toBeNull()
    expect(normaliseStoreUrl(42)).toBeNull()
  })

  it('parses a valid pairing payload and trims the credentials', () => {
    const result = parsePairingPayload({
      storeUrl: 'https://shop.example.co.nz/',
      consumerKey: ' ck_abc ',
      consumerSecret: ' cs_xyz ',
      pluginVersion: ' 0.5.0 ',
    })
    expect(result).toEqual({
      ok: true,
      payload: {
        storeUrl: 'https://shop.example.co.nz',
        consumerKey: 'ck_abc',
        consumerSecret: 'cs_xyz',
        pluginVersion: '0.5.0',
      },
    })
  })

  it('rejects a payload missing credentials or with a bad store URL', () => {
    expect(parsePairingPayload(null).ok).toBe(false)
    expect(parsePairingPayload({}).ok).toBe(false)
    expect(
      parsePairingPayload({ storeUrl: 'not-a-url', consumerKey: 'ck_a', consumerSecret: 'cs_b' }).ok,
    ).toBe(false)
    expect(
      parsePairingPayload({ storeUrl: 'https://x.test', consumerKey: '', consumerSecret: 'cs_b' }).ok,
    ).toBe(false)
    expect(
      parsePairingPayload({ storeUrl: 'https://x.test', consumerKey: 'ck_a', consumerSecret: '' }).ok,
    ).toBe(false)
  })

  it('defaults pluginVersion to null when absent', () => {
    const result = parsePairingPayload({
      storeUrl: 'https://x.test',
      consumerKey: 'ck_a',
      consumerSecret: 'cs_b',
    })
    expect(result.ok && result.payload.pluginVersion).toBeNull()
  })

  it('builds the webhook delivery URL off the app base', () => {
    expect(webhookDeliveryUrl('https://hospo.example.com')).toBe(
      'https://hospo.example.com/api/webhooks/woocommerce',
    )
    expect(webhookDeliveryUrl('http://host.docker.internal:3000/')).toBe(
      'http://host.docker.internal:3000/api/webhooks/woocommerce',
    )
  })

  it('generates unique whsec_ secrets', () => {
    const a = generateWebhookSecret()
    const b = generateWebhookSecret()
    expect(a.startsWith('whsec_')).toBe(true)
    expect(a.length).toBe('whsec_'.length + 64)
    expect(a).not.toBe(b)
  })
})
