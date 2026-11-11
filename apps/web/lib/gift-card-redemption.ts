// Gift card balance + redemption rules (pure — safe for the browser).
//
// A card's spendable value is `amount - redeemedAmount`. Partial redemptions
// are supported: the card stays ISSUED/SENT until the remaining balance hits
// zero, at which point it becomes REDEEMED. Every redemption is appended to
// the card's lifecycle history by the server half.

export const MAX_REDEEM_AMOUNT = 10000

export interface RedeemableCard {
  amount: number
  redeemedAmount?: number | null
  status: string
  expiresAt?: Date | string | null
  number?: string
}

export interface RedemptionError {
  status: number
  error: string
}

const REDEEMABLE_STATUSES = ['ISSUED', 'SENT']

/** Round to cents, avoiding float drift (0.1 + 0.2). */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/** Spendable value left on the card (never negative). */
export function remainingBalance(card: { amount: number; redeemedAmount?: number | null }): number {
  const balance = roundMoney(Number(card.amount ?? 0) - Number(card.redeemedAmount ?? 0))
  return balance > 0 ? balance : 0
}

/** True when the card has an expiry date that is already in the past. */
export function isCardExpired(
  card: Pick<RedeemableCard, 'expiresAt'>,
  now: Date = new Date(),
): boolean {
  if (!card.expiresAt) return false
  const expiry = card.expiresAt instanceof Date ? card.expiresAt : new Date(card.expiresAt)
  if (Number.isNaN(expiry.getTime())) return false
  return expiry.getTime() < now.getTime()
}

/**
 * Validate a redemption request. Returns null when the redemption is allowed,
 * otherwise the HTTP status and a clear message for the UI.
 */
export function validateRedemption(
  card: RedeemableCard,
  amount: number | string,
  now: Date = new Date(),
): RedemptionError | null {
  const value = typeof amount === 'number' ? amount : Number(amount)

  if (!Number.isFinite(value) || value <= 0) {
    return { status: 400, error: 'ENTER A REDEEM AMOUNT GREATER THAN $0' }
  }
  if (value > MAX_REDEEM_AMOUNT) {
    return { status: 400, error: `AMOUNT MUST BE $${MAX_REDEEM_AMOUNT} OR LESS` }
  }

  const label = card.number ? `CARD #${card.number}` : 'THIS CARD'

  if (!REDEEMABLE_STATUSES.includes(card.status)) {
    return {
      status: 409,
      error: `${label} IS ${card.status} — ONLY ISSUED OR SENT CARDS CAN BE REDEEMED`,
    }
  }

  if (isCardExpired(card, now)) {
    return { status: 409, error: `${label} HAS EXPIRED — IT CANNOT BE REDEEMED` }
  }

  const balance = remainingBalance(card)
  if (balance <= 0) {
    return { status: 409, error: `${label} HAS NO BALANCE LEFT` }
  }
  if (roundMoney(value) > balance) {
    return { status: 409, error: `ONLY $${balance.toFixed(2)} REMAINS ON ${label}` }
  }

  return null
}

export interface RedemptionState {
  redeemedAmount: number
  status: string
  redeemedAt: Date | null
}

/** The next card state after redeeming `amount` (call validate first). */
export function nextRedemptionState(
  card: RedeemableCard,
  amount: number | string,
  now: Date = new Date(),
): RedemptionState {
  const value = roundMoney(Number(amount))
  const redeemedAmount = roundMoney(Number(card.redeemedAmount ?? 0) + value)
  const remaining = roundMoney(Number(card.amount) - redeemedAmount)
  const fullyRedeemed = remaining <= 0

  return {
    redeemedAmount: fullyRedeemed ? roundMoney(Number(card.amount)) : redeemedAmount,
    status: fullyRedeemed ? 'REDEEMED' : card.status,
    redeemedAt: fullyRedeemed ? now : null,
  }
}
