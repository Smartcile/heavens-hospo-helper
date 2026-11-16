// Pure mapping between a gift card and its GIFT CARDS membership. The card
// number is the SwiftPOS member number; no gift card data is sent to SwiftPOS.

import { splitDisplayName } from './member-name'

const ACTIVE_CARD_STATUSES = new Set(['ISSUED', 'SENT'])

export function giftCardMemberIsActive(status: string | null | undefined): boolean {
  return ACTIVE_CARD_STATUSES.has(String(status ?? '').toUpperCase())
}

export interface GiftCardMemberIdentity {
  firstName: string
  lastName: string
}

export function giftCardMemberIdentity(card: {
  number: string
  customerName?: string | null
}): GiftCardMemberIdentity {
  const split = splitDisplayName(card.customerName)
  if (split.firstName || split.lastName) return split
  // An anonymous card still has a membership: the number is the identity.
  return { firstName: 'GIFT CARD', lastName: card.number }
}

export function giftCardMemberIsActiveForCard(
  card: { status: string; expiresAt?: Date | string | null },
  now = new Date(),
): boolean {
  if (!giftCardMemberIsActive(card.status)) return false
  if (!card.expiresAt) return true
  const expiry = card.expiresAt instanceof Date ? card.expiresAt : new Date(card.expiresAt)
  return Number.isNaN(expiry.getTime()) ? true : expiry.getTime() >= now.getTime()
}
