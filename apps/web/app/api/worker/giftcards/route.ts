import { NextRequest, NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { workerMayIssueGiftCards, workerMayManageGiftCards } from '@/lib/worker-gift-access'
import { prisma } from '@hospo-ops/db'
import { issuePremade, issueSpecificPremade, nextPremadeNumber } from '@/lib/gift-cards'
import { giftCardSortValue } from '@/lib/gift-card-numbers'
import { MAX_GIFT_CARD_AMOUNT } from '@/lib/gift-card-redemption'
import { logGiftCardEvent } from '@/lib/gift-card-history'

// ── Worker gift cards ────────────────────────────────────────────────────
// Floor staff (granted PERFORMANCE → GIFT CARDS → ISSUE) can sell a physical
// gift card from the phone app: they get the LOWEST-numbered premade draft by
// default, or PICK a specific draft card first. The same screen looks up any
// issued card (number / customer name / email), shows its remaining balance
// and redeems part or all of it. No number is ever invented at issue time.

const MAX_AMOUNT = MAX_GIFT_CARD_AMOUNT
const CARD_STATUSES = ['DRAFT', 'ISSUED', 'SENT', 'REDEEMED', 'VOIDED', 'EXPIRED']

const LIST_SELECT = {
  id: true,
  number: true,
  amount: true,
  redeemedAmount: true,
  status: true,
  customerName: true,
  customerEmail: true,
  message: true,
  issuedAt: true,
  expiresAt: true,
  redeemedAt: true,
  createdAt: true,
} as const

/**
 * GET /api/worker/giftcards
 *  - no query              → module state (next draft + availability)
 *  - ?search=&status=      → venue-scoped lookup (number / customer name / email)
 *  - ?list=1               → the same lookup with no search text (e.g. DRAFTs)
 */
export async function GET(req: NextRequest) {
  const session = await getWorkerSession()
  if (!(await workerMayIssueGiftCards(session))) {
    return NextResponse.json({ error: 'ACCESS DENIED' }, { status: 403 })
  }

  const venueId = session!.venueId
  const url = new URL(req.url)
  const search = (url.searchParams.get('search') ?? '').trim()
  const status = (url.searchParams.get('status') ?? '').trim().toUpperCase()
  const listMode = search !== '' || status !== '' || url.searchParams.get('list') === '1'

  if (listMode) {
    const where: Record<string, unknown> = { venueId, deletedAt: null }
    if (status && CARD_STATUSES.includes(status)) where.status = status
    if (search) {
      where.OR = [
        { number: { contains: search } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { customerEmail: { contains: search, mode: 'insensitive' } },
      ]
    }

    const cards = await prisma.giftCard.findMany({
      where: where as never,
      select: LIST_SELECT,
      take: 100,
    })
    cards.sort((a, b) => giftCardSortValue(b.number) - giftCardSortValue(a.number))

    return NextResponse.json({
      cards,
      canManage: await workerMayManageGiftCards(session),
    })
  }

  const drafts = await prisma.giftCard.findMany({
    where: { venueId, status: 'DRAFT', deletedAt: null },
    select: { id: true, number: true },
    orderBy: { number: 'asc' },
  })
  const draft = drafts[0] ?? null
  // When no premade draft remains, selling premakes the next one in the
  // current year's series automatically — show which number that will be.
  const nextNumber = draft?.number ?? (await nextPremadeNumber(venueId))

  return NextResponse.json({
    allowed: true,
    canManage: await workerMayManageGiftCards(session),
    draft,
    draftCount: drafts.length,
    nextNumber,
    poolFull: draft === null && nextNumber === null,
  })
}

/**
 * POST /api/worker/giftcards — sell a premade card.
 * Body may include `cardId` to issue a SPECIFIC draft chosen from the list;
 * otherwise the lowest-numbered draft is consumed (one is premade when none
 * remain).
 */
export async function POST(req: NextRequest) {
  const session = await getWorkerSession()
  if (!(await workerMayIssueGiftCards(session))) {
    return NextResponse.json({ error: 'ACCESS DENIED' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const amount = parseFloat(String(body?.amount))
  if (!amount || amount <= 0 || amount > MAX_AMOUNT) {
    return NextResponse.json({ error: `Enter an amount between $1 and $${MAX_AMOUNT}` }, { status: 400 })
  }
  const customerName = String(body?.customerName ?? '').trim() || null
  const customerEmail = String(body?.customerEmail ?? '').trim() || null
  const message = String(body?.message ?? '').trim() || null
  const isInternal = !!body?.isInternal
  const cardId = String(body?.cardId ?? '').trim() || null

  const venueId = session!.venueId

  try {
    const card = cardId
      ? await issueSpecificPremade(venueId, cardId, {
          amount,
          customerName,
          customerEmail,
          message,
          isInternal,
        })
      : await issuePremade(venueId, {
          amount,
          customerName,
          customerEmail,
          message,
          isInternal,
        })

    await logGiftCardEvent(card.id, 'ISSUED', `ISSUED ON THE WORKER APP — $${amount.toFixed(2)}`)

    return NextResponse.json(
      { cardId: card.id, number: card.number, amount, status: card.status },
      { status: 201 },
    )
  } catch (e) {
    const messageText = (e as Error).message || 'ISSUE FAILED'
    const status = messageText.startsWith('CARD NO LONGER AVAILABLE') ? 409 : 400
    return NextResponse.json({ error: messageText }, { status })
  }
}
