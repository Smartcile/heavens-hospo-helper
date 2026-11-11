import { prisma } from '@hospo-ops/db'
import { appendHistoryEvent, type GiftCardHistoryEvent } from './gift-card-history'
import { GIFT_CARD_PHONE_SELECT } from './gift-card-select'
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

export interface RedeemOptions {
  now?: Date
  /** Human label of the staff member performing the redemption (history audit). */
  actor?: string | null
}

/**
 * Redeem part or all of a card's remaining balance. Venue-scoped and
 * server-authoritative: the same rules run for the worker app and the admin
 * gift-card page. The balance write is an OPTIMISTIC CONDITIONAL update on
 * `redeemedAmount` + an allowed status, so two concurrent redemptions cannot
 * both pass (the loser sees 409). The history event is written in the same
 * update, so it cannot be lost. History is never rewritten or deleted.
 */
export async function redeemGiftCard(
  venueId: string,
  cardId: string,
  amountInput: unknown,
  opts: RedeemOptions = {},
): Promise<RedeemResult> {
  const { now = new Date(), actor = null } = opts

  const card = await prisma.giftCard.findFirst({
    where: { id: cardId, venueId, deletedAt: null },
  })
  if (!card) return { status: 404, body: { error: 'Not found' } }

  // Expiry is a status rule, not a balance rule: stamp the card EXPIRED once
  // it is past its date so the lookup shows the truth, then refuse the sale.
  // Conditional on the same state read, so concurrent expiry/redemption
  // cannot both append history.
  if (isCardExpired(card, now) && (card.status === 'ISSUED' || card.status === 'SENT')) {
    const history = appendHistoryEvent(
      card.history as unknown as GiftCardHistoryEvent[],
      'STATUS',
      `${card.status} → EXPIRED`,
    )
    await prisma.giftCard.updateMany({
      where: {
        id: card.id,
        venueId,
        deletedAt: null,
        status: card.status,
        redeemedAmount: card.redeemedAmount,
      },
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
  const by = actor ? ` — BY ${actor}` : ''
  const note =
    next.status === 'REDEEMED'
      ? `REDEEMED $${amount.toFixed(2)} — FULL BALANCE USED${by}`
      : `REDEEMED $${amount.toFixed(2)} — $${balance.toFixed(2)} REMAINING${by}`
  const history = appendHistoryEvent(
    card.history as unknown as GiftCardHistoryEvent[],
    'REDEEMED',
    note,
  )

  const updated = await prisma.$transaction(async (tx) => {
    const claimed = await tx.giftCard.updateMany({
      where: {
        id: card.id,
        venueId,
        deletedAt: null,
        status: { in: ['ISSUED', 'SENT'] },
        redeemedAmount: card.redeemedAmount,
      },
      data: {
        redeemedAmount: next.redeemedAmount,
        status: next.status as typeof card.status,
        // Partial redemptions clear any stale redeemedAt timestamp.
        redeemedAt: next.redeemedAt,
        history: JSON.parse(JSON.stringify(history)),
      },
    })
    if (claimed.count !== 1) return null
    return tx.giftCard.findUnique({
      where: { id: card.id },
      select: GIFT_CARD_PHONE_SELECT,
    })
  })

  if (!updated) {
    return {
      status: 409,
      body: { error: `CARD #${card.number} CHANGED WHILE REDEEMING — REFRESH AND TRY AGAIN` },
    }
  }

  return { status: 200, body: { card: updated, balance } }
}
