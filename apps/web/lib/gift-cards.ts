import { prisma } from '@hospo-ops/db'
import { giftCardNumberForYear, parseGiftCardNumber, GIFT_CARD_YEAR_MAX_SEQUENCE } from './gift-card-numbers'
import { issueGiftCardPdf } from './gift-card-issue'
import { logGiftCardEvent, logOrderEvent } from './gift-card-history'
import { getTodayDate } from '@/lib/utils'

// ── Gift card numbers: PREMADE year-series drafts ───────────────────────
// Cards are pre-created (CREATE GIFT CARDS) as numbered DRAFT rows —
// `${currentVenueYear}` + 4-digit sequence, e.g. 20260019 — and issuing
// CONSUMES the lowest-numbered draft without ever inventing a number. When no
// draft remains an issuer premakes the next one in the year's series and uses
// it. This matches physical pre-printed cards: the number on the paper card
// is the number in the database.

export {
  giftCardNumberForYear,
  parseGiftCardNumber,
  giftCardSortValue,
  GIFT_CARD_YEAR_MAX_SEQUENCE,
} from './gift-card-numbers'

async function venueYear(venueId: string): Promise<number> {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { timezone: true },
  })
  const tz = venue?.timezone ?? process.env.DEFAULT_TIMEZONE
  return getTodayDate(tz).getUTCFullYear()
}

/** The next sequence in a year series after the highest number in the DB. */
async function nextSequenceForYear(venueId: string, year: number): Promise<number> {
  const prefix = String(year)
  const rows = await prisma.giftCard.findMany({
    where: { venueId, deletedAt: null, number: { startsWith: prefix } },
    select: { number: true },
  })
  let max = 0
  for (const r of rows) {
    const parsed = parseGiftCardNumber(r.number)
    if (parsed && parsed.year === year && parsed.sequence > max) max = parsed.sequence
  }
  return max + 1
}

/** Premake `count` blank DRAFT cards continuing the CURRENT year's series. */
export async function premadeCards(
  venueId: string,
  count: number,
  amount = 0,
): Promise<string[]> {
  if (count < 1 || count > 1000) throw new Error('Count must be between 1 and 1000')

  const year = await venueYear(venueId)
  const start = await nextSequenceForYear(venueId, year)
  if (start + count - 1 > GIFT_CARD_YEAR_MAX_SEQUENCE) {
    throw new Error(`NO NUMBERS LEFT IN THE ${year} SERIES — MAX IS ${year}${GIFT_CARD_YEAR_MAX_SEQUENCE}`)
  }

  const numbers = Array.from({ length: count }, (_, i) =>
    giftCardNumberForYear(year, start + i),
  )

  await prisma.giftCard.createMany({
    data: numbers.map((number) => ({
      venueId,
      number,
      amount,
      status: 'DRAFT' as const,
    })),
  })
  return numbers
}

/** The lowest-numbered DRAFT card for the venue (any year), or null. */
export async function nextDraft(
  venueId: string,
): Promise<{ id: string; number: string } | null> {
  const draft = await prisma.giftCard.findFirst({
    where: { venueId, status: 'DRAFT', deletedAt: null },
    orderBy: { number: 'asc' },
    select: { id: true, number: true },
  })
  return draft
}

/** The number the NEXT premade card would take in the current year's series
 *  (used for previews — premakeCards actually creates it). */
export async function nextPremadeNumber(venueId: string): Promise<string | null> {
  const year = await venueYear(venueId)
  const seq = await nextSequenceForYear(venueId, year)
  return seq <= GIFT_CARD_YEAR_MAX_SEQUENCE ? giftCardNumberForYear(year, seq) : null
}

export interface IssueDetails {
  amount: number
  customerName?: string | null
  customerEmail?: string | null
  message?: string | null
  isInternal?: boolean
  wooOrderId?: string | null
  replacesId?: string | null
  notes?: string | null
}

export interface IssuedCard {
  id: string
  number: string
  amount: number
  status: string
}

/**
 * Issue the next premade card for the venue: takes the LOWEST-numbered DRAFT
 * (premaking one in the current year's series when none remain), generates its
 * PDF and claims it atomically (the claim only wins while the row is still
 * DRAFT, so two simultaneous issuers never share a number). Returns the issued
 * card or throws.
 */
export async function issuePremade(venueId: string, details: IssueDetails): Promise<IssuedCard> {
  if (!details.amount || details.amount <= 0) throw new Error('Amount is required')

  for (let attempt = 0; attempt < 3; attempt++) {
    let draft = await nextDraft(venueId)
    if (!draft) {
      await premadeCards(venueId, 1)
      draft = await nextDraft(venueId)
    }
    if (!draft) throw new Error('NO GIFT CARDS COULD BE PREMADE — TRY AGAIN')

    const pdfPath = await issueGiftCardPdf({
      venueId,
      number: draft.number,
      amount: details.amount,
      customerName: details.customerName ?? null,
      message: details.message ?? null,
    })

    const claimed = await prisma.giftCard.updateMany({
      where: { id: draft.id, status: 'DRAFT', deletedAt: null },
      data: {
        amount: details.amount,
        customerName: details.customerName ?? null,
        customerEmail: details.customerEmail ?? null,
        message: details.message ?? null,
        isInternal: details.isInternal ?? false,
        wooOrderId: details.wooOrderId ?? null,
        replacesId: details.replacesId ?? null,
        notes: details.notes ?? null,
        pdfPath,
        status: 'ISSUED',
        issuedAt: new Date(),
      },
    })
    if (claimed.count === 1) {
      return { id: draft.id, number: draft.number, amount: details.amount, status: 'ISSUED' }
    }
  }
  throw new Error('A premade card could not be claimed — try again')
}

// ── Replacement (void + reissue) ────────────────────────────────────────
// A mistaken card (wrong name/message/amount printed, wrong recipient…) is
// VOIDED and the next premade card is issued with corrected details. The new
// card keeps the old one's WooCommerce order link (when there is one) so the
// store's order PDF flow serves the replacement — the public endpoint skips
// VOIDED cards, and the plugin refetches per email, so any resend delivers the
// corrected PDF. The old number is never reused (its PDF may be in the wild).

const REPLACEABLE_STATUSES = ['ISSUED', 'SENT']

export interface ReplacementInput {
  amount?: number | null
  customerName?: string | null
  customerEmail?: string | null
  message?: string | null
  reason: string
}

export interface ReplacementResult {
  oldCard: { id: string; number: string }
  newCard: IssuedCard
}

/** Void `cardId` and issue a replacement card with the given details. */
export async function replaceGiftCard(
  cardId: string,
  input: ReplacementInput,
): Promise<ReplacementResult> {
  const card = await prisma.giftCard.findFirst({
    where: { id: cardId, deletedAt: null },
  })
  if (!card) throw new Error('Card not found')
  if (!REPLACEABLE_STATUSES.includes(card.status)) {
    throw new Error(`Only ${REPLACEABLE_STATUSES.join('/')} cards can be replaced`)
  }

  const reason = input.reason.trim()
  if (!reason) throw new Error('A reason is required')

  const amount = input.amount ?? card.amount
  if (!amount || amount <= 0) throw new Error('Amount is required')

  for (let attempt = 0; attempt < 3; attempt++) {
    let draft = await nextDraft(card.venueId)
    if (!draft) {
      await premadeCards(card.venueId, 1)
      draft = await nextDraft(card.venueId)
    }
    if (!draft) throw new Error('NO GIFT CARDS COULD BE PREMADE — TRY AGAIN')

    const pdfPath = await issueGiftCardPdf({
      venueId: card.venueId,
      number: draft.number,
      amount,
      customerName: input.customerName ?? card.customerName,
      message: input.message !== undefined ? input.message : card.message,
    })

    // Claim the premade card and void the old one atomically — the claim only
    // wins while the draft is still untouched, so two concurrent replacements
    // can never take the same number.
    const claimed = await prisma.$transaction(async (tx) => {
      const res = await tx.giftCard.updateMany({
        where: { id: draft!.id, status: 'DRAFT', deletedAt: null },
        data: {
          amount,
          customerName: input.customerName ?? card.customerName,
          customerEmail: input.customerEmail ?? card.customerEmail,
          message: input.message !== undefined ? input.message : card.message,
          isInternal: card.isInternal,
          wooOrderId: card.wooOrderId,
          replacesId: card.id,
          notes: `Replacement for #${card.number} — ${reason}`,
          pdfPath,
          status: 'ISSUED',
          issuedAt: new Date(),
        },
      })
      if (res.count !== 1) return null
      await tx.giftCard.update({
        where: { id: card.id },
        data: {
          status: 'VOIDED',
          notes: [card.notes, `REPLACED BY #${draft!.number} — ${reason}`].filter(Boolean).join('\n'),
        },
      })
      return { id: draft!.id, number: draft!.number }
    })
    if (claimed) {
      await logGiftCardEvent(card.id, 'REPLACED', `VOIDED — REPLACED BY #${claimed.number} — ${reason}`)
      await logGiftCardEvent(
        claimed.id,
        'CREATED',
        `REPLACEMENT FOR #${card.number} — ${reason} — $${Number(amount).toFixed(2)}`,
      )
      await logGiftCardEvent(claimed.id, 'ISSUED', 'PDF GENERATED — REPLACEMENT')
      if (card.wooOrderId) {
        await logOrderEvent(
          card.wooOrderId,
          'CARD_REPLACED',
          `GIFT CARD #${card.number} VOIDED — REPLACED BY #${claimed.number} — ${reason}`,
        )
      }
      return {
        oldCard: { id: card.id, number: card.number },
        newCard: { id: claimed.id, number: claimed.number, amount, status: 'ISSUED' },
      }
    }
  }
  throw new Error('A premade card could not be claimed for the replacement — try again')
}
