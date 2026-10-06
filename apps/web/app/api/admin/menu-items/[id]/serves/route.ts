import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { cleanServes, validateServe, type UomKind } from '@/lib/menu-serves'

interface Params {
  params: { id: string }
}

// The serve spec = the app's POS item link: how selling one unit of a product
// draws from a recipe or a stock item. Authored on the Menus page. See MENUS.md.

const serveInclude = {
  uom: { select: { id: true, name: true, kind: true } },
  recipe: { select: { id: true, name: true } },
  inventoryItem: { select: { id: true, name: true, unit: true } },
}

async function scopedItem(id: string, session: { user: { role: string; venueId: string } }) {
  const item = await prisma.menuItem.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, venueId: true },
  })
  if (!item) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  if (session.user.role === 'MANAGER' && item.venueId !== session.user.venueId) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { item }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, _req, 'ops.menus.view')
  if (denied) return denied

  const scoped = await scopedItem(params.id, session)
  if (scoped.error) return scoped.error

  const serves = await prisma.menuItemServe.findMany({
    where: { menuItemId: params.id, deletedAt: null },
    orderBy: { sortOrder: 'asc' },
    include: serveInclude,
  })
  return NextResponse.json(serves)
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.menus.edit')
  if (denied) return denied

  const scoped = await scopedItem(params.id, session)
  if (scoped.error) return scoped.error
  const venueId = scoped.item!.venueId

  const body = await req.json()
  const clean = cleanServes(body.serves)

  for (const s of clean) {
    const err = validateServe(s)
    if (err) return NextResponse.json({ error: err }, { status: 400 })
  }

  // Targets must belong to this venue.
  const recipeIds = [...new Set(clean.map((s) => s.recipeId).filter((x): x is string => !!x))]
  const itemIds = [...new Set(clean.map((s) => s.inventoryItemId).filter((x): x is string => !!x))]
  const uomIds = [...new Set(clean.map((s) => s.uomId).filter((x): x is string => !!x))]

  const [recipes, invItems, uoms] = await Promise.all([
    recipeIds.length
      ? prisma.recipe.findMany({ where: { id: { in: recipeIds }, venueId, deletedAt: null }, select: { id: true } })
      : [],
    itemIds.length
      ? prisma.inventoryItem.findMany({
          where: { id: { in: itemIds }, venueId, deletedAt: null },
          select: { id: true, countingUnit: { select: { kind: true } } },
        })
      : [],
    uomIds.length
      ? prisma.unitOfMeasure.findMany({ where: { id: { in: uomIds } }, select: { id: true, kind: true } })
      : [],
  ])

  const recipeSet = new Set(recipes.map((r) => r.id))
  const itemKind = new Map<string, UomKind>(invItems.map((i) => [i.id, i.countingUnit?.kind as UomKind]))
  const uomKind = new Map<string, UomKind>(uoms.map((u) => [u.id, u.kind as UomKind]))

  if (recipeIds.some((id) => !recipeSet.has(id))) {
    return NextResponse.json({ error: 'A linked recipe is missing' }, { status: 400 })
  }
  if (itemIds.some((id) => !itemKind.has(id))) {
    return NextResponse.json({ error: 'A linked stock item is missing' }, { status: 400 })
  }

  // Unit consistency: a pour may not mix kinds with its stock item
  // (Volume↔Volume, Count↔Count) — the "bottle sold as a cup" safeguard.
  for (const s of clean) {
    if (!s.inventoryItemId || !s.uomId) continue
    const target = itemKind.get(s.inventoryItemId)
    const uom = uomKind.get(s.uomId)
    if (target && uom && target !== uom) {
      return NextResponse.json(
        { error: `UNIT MISMATCH — THE STOCK ITEM IS ${target}, THE SERVE IS ${uom}` },
        { status: 400 },
      )
    }
  }

  // Serves have no children, so replace the set wholesale (soft-delete + create).
  await prisma.$transaction(async (tx) => {
    await tx.menuItemServe.updateMany({
      where: { menuItemId: params.id, deletedAt: null },
      data: { deletedAt: new Date() },
    })
    if (clean.length) {
      await tx.menuItemServe.createMany({
        data: clean.map((s, i) => ({
          menuItemId: params.id,
          venueId,
          label: s.label ?? null,
          method: s.method ?? 'OTHER',
          recipeId: s.recipeId ?? null,
          inventoryItemId: s.inventoryItemId ?? null,
          qty: s.qty ?? 1,
          uomId: s.uomId ?? null,
          sortOrder: i,
        })),
      })
    }
  })

  const serves = await prisma.menuItemServe.findMany({
    where: { menuItemId: params.id, deletedAt: null },
    orderBy: { sortOrder: 'asc' },
    include: serveInclude,
  })
  return NextResponse.json(serves)
}
