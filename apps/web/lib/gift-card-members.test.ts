import { describe, expect, it } from 'vitest'
import {
  giftCardMemberIdentity,
  giftCardMemberIsActive,
  giftCardMemberIsActiveForCard,
} from './gift-card-members'

describe('gift-card-members', () => {
  it('only treats issued/sent cards as active members', () => {
    expect(giftCardMemberIsActive('ISSUED')).toBe(true)
    expect(giftCardMemberIsActive('SENT')).toBe(true)
    expect(giftCardMemberIsActive('DRAFT')).toBe(false)
    expect(giftCardMemberIsActive('REDEEMED')).toBe(false)
    expect(giftCardMemberIsActive('VOIDED')).toBe(false)
    expect(giftCardMemberIsActive('EXPIRED')).toBe(false)
  })

  it('keeps anonymous cards identifiable by their number', () => {
    expect(giftCardMemberIdentity({ number: '20260001' })).toEqual({
      firstName: 'GIFT CARD',
      lastName: '20260001',
    })
    expect(giftCardMemberIdentity({ number: '20260002', customerName: 'Sue Smith' })).toEqual({
      firstName: 'Sue',
      lastName: 'Smith',
    })
  })

  it('respects expiry for active cards', () => {
    const now = new Date('2026-06-01T00:00:00Z')
    expect(giftCardMemberIsActiveForCard({ status: 'ISSUED', expiresAt: '2026-05-01' }, now)).toBe(false)
    expect(giftCardMemberIsActiveForCard({ status: 'ISSUED', expiresAt: '2026-07-01' }, now)).toBe(true)
  })
})
