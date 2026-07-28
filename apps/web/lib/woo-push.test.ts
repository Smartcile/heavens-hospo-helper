import { describe, it, expect, vi } from 'vitest'
import {
  mapStatusToWoo,
  buildProductPushPayload,
  buildOrderStatusPayload,
  isSelfEcho,
  PUSH_ECHO_WINDOW_MS,
} from './woo-push'

vi.mock('@hospo-ops/db', () => ({
  prisma: {
    menuItem: { findFirst: vi.fn(), findMany: vi.fn() },
    wooOrder: { findFirst: vi.fn() },
    wooIntegration: { findFirst: vi.fn() },
    syncLog: { create: vi.fn() },
  },
}))

const NOW = new Date('2026-07-15T10:00:00Z')

describe('mapStatusToWoo', () => {
  it('maps PENDING to pending', () => {
    expect(mapStatusToWoo('PENDING')).toBe('pending')
  })

  it('maps PROCESSING to processing', () => {
    expect(mapStatusToWoo('PROCESSING')).toBe('processing')
  })

  it('maps COMPLETED to completed', () => {
    expect(mapStatusToWoo('COMPLETED')).toBe('completed')
  })

  it('maps CANCELLED to cancelled', () => {
    expect(mapStatusToWoo('CANCELLED')).toBe('cancelled')
  })
})

describe('buildProductPushPayload', () => {
  it('includes name, price string, and the self-update meta stamps', () => {
    const payload = buildProductPushPayload({ name: 'FISH & CHIPS', price: 24.5, wooCategoryId: null, imageUrl: null, shortDescription: null, isVariable: false, variations: null }, NOW)
    expect(payload.name).toBe('FISH & CHIPS')
    expect(payload.regular_price).toBe('24.5')
    expect(payload.meta_data).toEqual([
      { key: '_updated_by', value: 'hospo-ops' },
      { key: '_hospo_ops_pushed_at', value: NOW.toISOString() },
    ])
    expect(payload.categories).toBeUndefined()
    expect(payload.images).toBeUndefined()
  })

  it('includes categories when wooCategoryId is numeric', () => {
    const payload = buildProductPushPayload({ name: 'PIE', price: 8, wooCategoryId: '17', imageUrl: null, shortDescription: null, isVariable: false, variations: null }, NOW)
    expect(payload.categories).toEqual([{ id: 17 }])
  })

  it('omits categories when wooCategoryId is not numeric', () => {
    const payload = buildProductPushPayload({ name: 'PIE', price: 8, wooCategoryId: 'mains', imageUrl: null, shortDescription: null, isVariable: false, variations: null }, NOW)
    expect(payload.categories).toBeUndefined()
  })

  it('includes images when imageUrl is set', () => {
    const payload = buildProductPushPayload({ name: 'BURGER', price: 12, wooCategoryId: null, imageUrl: '/api/upload/abc.jpg', shortDescription: null, isVariable: false, variations: null }, NOW)
    expect(payload.images).toEqual([{ src: '/api/upload/abc.jpg' }])
  })

  it('defaults price to "0" when null-ish', () => {
    const payload = buildProductPushPayload({ name: 'X', price: null as unknown as number, wooCategoryId: null, imageUrl: null, shortDescription: null, isVariable: false, variations: null }, NOW)
    expect(payload.regular_price).toBe('0')
  })
})

describe('buildOrderStatusPayload', () => {
  it('maps status and stamps _updated_by + pushed_at', () => {
    expect(buildOrderStatusPayload('COMPLETED', NOW)).toEqual({
      status: 'completed',
      meta_data: [
        { key: '_updated_by', value: 'hospo-ops' },
        { key: '_hospo_ops_pushed_at', value: NOW.toISOString() },
      ],
    })
  })
})

describe('isSelfEcho', () => {
  it('detects a webhook that echoes our own recent push', () => {
    const meta = [
      { key: '_updated_by', value: 'hospo-ops' },
      { key: '_hospo_ops_pushed_at', value: new Date(NOW.getTime() - 5000).toISOString() },
    ]
    expect(isSelfEcho(meta, NOW)).toBe(true)
  })

  it('does NOT skip a genuine edit made long after our last push', () => {
    const meta = [
      { key: '_updated_by', value: 'hospo-ops' },
      { key: '_hospo_ops_pushed_at', value: new Date(NOW.getTime() - PUSH_ECHO_WINDOW_MS - 1000).toISOString() },
    ]
    expect(isSelfEcho(meta, NOW)).toBe(false)
  })

  it('returns false when _updated_by is someone else', () => {
    const meta = [{ key: '_updated_by', value: 'someone-else' }]
    expect(isSelfEcho(meta, NOW)).toBe(false)
  })

  it('returns false when meta is empty', () => {
    expect(isSelfEcho([], NOW)).toBe(false)
  })

  it('returns false when pushed_at is missing or invalid', () => {
    expect(isSelfEcho([{ key: '_updated_by', value: 'hospo-ops' }], NOW)).toBe(false)
    expect(
      isSelfEcho(
        [
          { key: '_updated_by', value: 'hospo-ops' },
          { key: '_hospo_ops_pushed_at', value: 'not-a-date' },
        ],
        NOW,
      ),
    ).toBe(false)
  })
})
