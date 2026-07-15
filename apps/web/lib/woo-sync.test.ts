import { describe, it, expect, vi } from 'vitest'
import { isWebhookPing, wooAuthHeader } from './woo-sync'

vi.mock('@hospo-ops/db', () => ({
  prisma: {
    wooIntegration: { findMany: vi.fn(), update: vi.fn() },
    menuItem: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    syncLog: { create: vi.fn() },
  },
}))

describe('isWebhookPing', () => {
  it('detects the WooCommerce activation ping body', () => {
    expect(isWebhookPing('webhook_id=12')).toBe(true)
  })

  it('tolerates surrounding whitespace', () => {
    expect(isWebhookPing(' webhook_id=7\n')).toBe(true)
  })

  it('rejects a real JSON order payload', () => {
    expect(isWebhookPing('{"id":123,"status":"processing"}')).toBe(false)
  })

  it('rejects an empty body', () => {
    expect(isWebhookPing('')).toBe(false)
  })

  it('rejects lookalike bodies with extra params', () => {
    expect(isWebhookPing('webhook_id=12&other=1')).toBe(false)
    expect(isWebhookPing('webhook_id=abc')).toBe(false)
  })
})

describe('wooAuthHeader', () => {
  it('builds a Basic auth header from key and secret', () => {
    expect(wooAuthHeader('ck_test', 'cs_test')).toBe(
      `Basic ${Buffer.from('ck_test:cs_test').toString('base64')}`,
    )
  })
})
