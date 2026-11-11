import { prisma } from '@hospo-ops/db'
import { appendHistoryEvent, type GiftCardHistoryEvent } from './gift-card-history'
import {
  isCardExpired,
  nextRedemptionState,
  remainingBalance,
  roundMoney,
  validateRedemption,
} from './gift-card-redemption'

export interface RedeemResult {
  status: number
  body: Record<string, unknown>
}

/**
 * Redeem part or all of a card's remaining balance. Venue-scoped and
 * server-authoritative: the same rules run for the worker app and the admin
 * gift-card page. Every redemption appends a REDEEMED event to the card's
 * history; history is never rewritten or deleted.
 */
export async function redeemGiftCard(
  venueId: string,
  cardId: string,
  amountInput: unknown,
  now: Date = new Date(),
): Promise<RedeemResult> {
  const card = await prisma.giftCard.findFirst({
    where: { id: cardId, venueId, deletedAt: null },
  })
  if (!card) return { status: 404, body: { error: 'Not found' } }

  // Expiry is a status rule, not a balance rule: stamp the card EXPIRED once
  // it is past its date so the lookup shows the truth, then refuse the sale.
  if (isCardExpired(card, now) && (card.status === 'ISSUED' || card.status === 'SENT')) {
    const history = appendHistoryEvent(
      card.history as unknown as GiftCardHistoryEvent[],
      'STATUS',
      `${card.status} → EXPIRED`,
    )
    await prisma.giftCard.update({
      where: { id: card.id },
      data: { status: 'EXPIRED', history: JSON.parse(JSON.stringify(history)) },
    })
    return {
      status: 409,
      body: { error: `CARD #${card.number} HAS EXPIRED — IT CANNOT BE REDEEMED` },
    }
  }

  const invalid = validateRedemption(card, amountInput as number, now)
  if (invalid) return { status: invalid.status, body: { error: invalid.error } }

  const amount = roundMoney(Number(amountInput))
  const next = nextRedemptionState(card, amount, now)
  const balance = remainingBalance({ amount: card.amount, redeemedAmount: next.redeemedAmount })
  const note =
    next.status === 'REDEEMED'
      ? `REDEEMED $${amount.toFixed(2)} — FULL BALANCE USED`
      : `REDEEMED $${amount.toFixed(2)} — $${balance.toFixed(2)} REMAINING`
  const history = appendHistoryEvent(
    card.history as unknown as GiftCardHistoryEvent[],
    'REDEEMED',
    note,
  )

  const updated = await prisma.giftCard.update({
    where: { id: card.id },
    data: {
      redeemedAmount: next.redeemedAmount,
      status: next.status as typeof card.status,
      ...(next.redeemedAt ? { redeemedAt: next.redeemedAt } : {}),
      history: JSON.parse(JSON.stringify(history)),
    },
  })

  return { status: 200, body: { card: updated, balance } }
}
