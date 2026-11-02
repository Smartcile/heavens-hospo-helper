import { prisma } from '@hospo-ops/db'

// ── Lifecycle logs ───────────────────────────────────────────────────────
// Cards AND orders keep an append-only `history` Json: [{ at, type, note }].
// GiftCard.history records what happened to the card (create/issue/email/
// status/notes/auto-issue/replacement). WooOrder.history records what the APP
// did to the order (status changes, payment confirmations, item edits, card
// issues/replacements) — the WooCommerce store's own activity already lives in
// SyncLog. The gift card popup merges card history (APP), order history (APP)
// and SyncLog (STORE) into one clearly-labelled feed.
//
// Events are append-only — RESET and DELETE keep the log intact so a card's
// story is never rewritten.

export type GiftCardEventType =
  | 'CREATED'
  | 'DETAILS_UPDATED'
  | 'ISSUED'
  | 'EMAIL_SENT'
  | 'STATUS'
  | 'NOTE'
  | 'AUTO_ISSUED'
  | 'REDEEMED'
  | 'REPLACED'
  | 'RESET'

export interface GiftCardHistoryEvent {
  at: string
  type: GiftCardEventType | string
  note: string
}

const MAX_EVENTS = 200

/** Append an event to a history array (pure — no DB access). */
export function appendHistoryEvent(
  history: GiftCardHistoryEvent[] | null | undefined,
  type: GiftCardEventType | string,
  note: string,
  at: Date = new Date(),
): GiftCardHistoryEvent[] {
  const next = Array.isArray(history) ? [...history] : []
  next.push({ at: at.toISOString(), type, note })
  if (next.length > MAX_EVENTS) return next.slice(next.length - MAX_EVENTS)
  return next
}

/** Load the card's history, append an event and persist it. */
export async function logGiftCardEvent(
  cardId: string,
  type: GiftCardEventType | string,
  note: string,
): Promise<void> {
  const card = await prisma.giftCard.findUnique({
    where: { id: cardId },
    select: { history: true },
  })
  if (!card) return
  await prisma.giftCard.update({
    where: { id: cardId },
    data: {
      history: JSON.parse(JSON.stringify(appendHistoryEvent(card.history as unknown as GiftCardHistoryEvent[], type, note))),
    },
  })
}

/** Load the order's history, append an event and persist it. */
export async function logOrderEvent(
  orderId: string,
  type: string,
  note: string,
): Promise<void> {
  const order = await prisma.wooOrder.findUnique({
    where: { id: orderId },
    select: { history: true },
  })
  if (!order) return
  await prisma.wooOrder.update({
    where: { id: orderId },
    data: {
      history: JSON.parse(JSON.stringify(appendHistoryEvent(order.history as unknown as GiftCardHistoryEvent[], type, note))),
    },
  })
}

export const EVENT_LABELS: Record<string, string> = {
  CREATED: 'CARD CREATED',
  DETAILS_UPDATED: 'DETAILS UPDATED',
  ISSUED: 'ISSUED',
  EMAIL_SENT: 'EMAIL SENT',
  STATUS: 'STATUS CHANGED',
  NOTE: 'PRIVATE NOTE',
  AUTO_ISSUED: 'AUTO-ISSUED (WOOCOMMERCE)',
  REDEEMED: 'REDEEMED',
  REPLACED: 'REPLACED (VOIDED)',
  RESET: 'RESET TO DRAFT',
}

export const ORDER_EVENT_LABELS: Record<string, string> = {
  CREATED: 'ORDER CREATED',
  STATUS: 'STATUS CHANGED',
  DETAILS_UPDATED: 'DETAILS UPDATED',
  NOTE: 'NOTE',
  PAYMENT_CONFIRMED: 'PAYMENT CONFIRMED',
  CARD_ISSUED: 'GIFT CARD ISSUED',
  CARD_REPLACED: 'GIFT CARD REPLACED',
}
