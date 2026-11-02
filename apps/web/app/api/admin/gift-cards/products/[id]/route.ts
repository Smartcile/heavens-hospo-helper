import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { pushProduct, pushProductDisconnect, syncProductVariations } from '@/lib/woo-push'

const MAX_DENOMINATIONS = 20
const MAX_AMOUNT = 10000

/**
 * PUT /api/admin/gift-cards/products/[id] — edit the variable gift card
 * product { name?, shortDescription?, denominations? }.
 * Name/short description update the row AND the store product; the
 * denominations are pushed to the store's variations (created/updated/
 * removed to match).
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.giftcards.issue')
  if (denied) return denied

  const body = await req.json().catch(() => null)

  const item = await prisma.menuItem.findFirst({
    where: { id: params.id, venueId: session.user.venueId, deletedAt: null },
  })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const data: Record<string, unknown> = {}
  if (body?.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    data.name = name.toUpperCase()
  }
  if (body?.shortDescription !== undefined) {
    data.shortDescription = String(body.shortDescription).trim() || null
  }
  if (body?.imageUrl !== undefined) {
    const imageUrl = String(body.imageUrl).trim()
    data.imageUrl = imageUrl || null
  }

  let denominations: number[] | null = null
  if (body?.denominations !== undefined) {
    const raw = body.denominations
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_DENOMINATIONS) {
      return NextResponse.json({ error: `Provide 1-${MAX_DENOMINATIONS} denominations` }, { status: 400 })
    }
    const nums = raw.map((d: number) => Math.round(Number(d)))
    if (nums.some((d) => !Number.isFinite(d) || d <= 0 || d > MAX_AMOUNT)) {
      return NextResponse.json({ error: `Denominations must be between $1 and $${MAX_AMOUNT}` }, { status: 400 })
    }
    denominations = [...new Set(nums)]
  }

  if (Object.keys(data).length > 0) {
    await prisma.menuItem.update({ where: { id: item.id }, data })
  }

  // Base product first (name/short description/category/attributes), then the
  // variation set when denominations were sent.
  await pushProduct(item.id)
  let syncOk = true
  let syncErr: string | undefined
  if (denominations) {
    const s = await syncProductVariations(item.id, denominations)
    syncOk = s.ok
    syncErr = s.error
  }

  const saved = await prisma.menuItem.findUnique({
    where: { id: item.id },
    select: {
      id: true, name: true, price: true, wooProductId: true, wooCategoryId: true,
      imageUrl: true, shortDescription: true, isVariable: true, variations: true, createdAt: true,
    },
  })
  return NextResponse.json({ product: saved, synced: syncOk, syncError: syncErr ?? null })
}

/** DELETE /api/admin/gift-cards/products/[id] — remove a gift card product:
 *  soft-deletes the local row and hides the product on the store (draft +
 *  uncategorised) so it can no longer be purchased. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.giftcards.issue')
  if (denied) return denied

  const item = await prisma.menuItem.findFirst({
    where: { id: params.id, venueId: session.user.venueId, deletedAt: null },
    select: { id: true },
  })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.menuItem.update({ where: { id: params.id }, data: { deletedAt: new Date() } })
  // Best-effort: pushProductDisconnect reads the row without the soft-delete
  // guard and sends status=draft + categories:[] to the store.
  await pushProductDisconnect(params.id)

  return NextResponse.json({ ok: true })
}
