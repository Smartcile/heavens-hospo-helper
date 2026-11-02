import { NextRequest, NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { workerMayIssueGiftCards } from '@/lib/worker-gift-access'
import { prisma } from '@hospo-ops/db'
import { nextDraft, issuePremade, nextPremadeNumber } from '@/lib/gift-cards'
import { logGiftCardEvent } from '@/lib/gift-card-history'

// ── Worker gift card issuing ─────────────────────────────────────────────
// Floor staff (granted PERFORMANCE → GIFT CARDS → ISSUE) can sell a physical
// gift card from the phone app: they get the LOWEST-numbered premade draft,
// fill in the buyer, and the PDF is generated for printing. No number is ever
// invented at issue time — the next premade card is consumed (and one is
// premade in the current year's series when none remain).

const MAX_AMOUNT = 10000

/** GET /api/worker/giftcards — next draft + availability for the module. */
export async function GET() {
  const session = await getWorkerSession()
  if (!(await workerMayIssueGiftCards(session))) {
    return NextResponse.json({ error: 'ACCESS DENIED' }, { status: 403 })
  }

  const venueId = session!.venueId
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
    draft,
    draftCount: drafts.length,
    nextNumber,
    poolFull: draft === null && nextNumber === null,
  })
}

/** POST /api/worker/giftcards — sell the next premade card. */
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

  const venueId = session!.venueId

  const card = await issuePremade(venueId, {
    amount,
    customerName,
    customerEmail,
    message,
    isInternal,
  })
  await logGiftCardEvent(card.id, 'ISSUED', `ISSUED ON THE WORKER APP — $${amount.toFixed(2)}`)

  return NextResponse.json({ cardId: card.id, number: card.number, amount, status: card.status }, { status: 201 })
}
