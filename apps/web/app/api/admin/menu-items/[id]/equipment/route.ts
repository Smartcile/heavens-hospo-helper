import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'

interface Params {
  params: { id: string }
}

// Equipment links on a product — "the glass this wine is served in". Mirrors
// guide step links: an optional qty + note per linked stock item. Replaced
// wholesale on save; the unique (menuItemId, inventoryItemId) row is restored
// rather than duplicated when a link is re-added.

const linkInclude = {
  inventoryItem: { select: { id: true, name: true, unit: true, category: { select: { name: true } } } },
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

  const links = await prisma.menuItemInventoryItem.findMany({
    where: { menuItemId: params.id, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    include: linkInclude,
  })
  return NextResponse.json(links)
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
  const raw = Array.isArray(body.links) ? body.links : []
  const clean = raw
    .filter((l: unknown): l is { inventoryItemId: string; qty?: unknown; note?: unknown } =>
      !!l && typeof l === 'object' && typeof (l as { inventoryItemId?: unknown }).inventoryItemId === 'string' && !!(l as { inventoryItemId: string }).inventoryItemId)
    .map((l: { inventoryItemId: string; qty?: unknown; note?: unknown }) => ({
      inventoryItemId: l.inventoryItemId,
      qty: l.qty == null || l.qty === '' ? null : Math.max(1, parseInt(String(l.qty), 10) || 1),
      note: typeof l.note === 'string' && l.note.trim() ? l.note.trim() : null,
    }))

  // Dedupe by target (the unique key would reject duplicates).
  const seen = new Set<string>()
  const deduped = clean.filter((l: { inventoryItemId: string }) => {
    if (seen.has(l.inventoryItemId)) return false
    seen.add(l.inventoryItemId)
    return true
  })

  const ids = deduped.map((l: { inventoryItemId: string }) => l.inventoryItemId)
  const valid = ids.length
    ? await prisma.inventoryItem.findMany({ where: { id: { in: ids }, venueId, deletedAt: null }, select: { id: true } })
    : []
  if (ids.some((id: string) => !valid.some((v) => v.id === id))) {
    return NextResponse.json({ error: 'A linked stock item is missing' }, { status: 400 })
  }

  await prisma.$transaction(async (tx) => {
    await tx.menuItemInventoryItem.updateMany({
      where: { menuItemId: params.id, deletedAt: null },
      data: { deletedAt: new Date() },
    })
    for (const l of deduped) {
      await tx.menuItemInventoryItem.upsert({
        where: { menuItemId_inventoryItemId: { menuItemId: params.id, inventoryItemId: l.inventoryItemId } },
        update: { qty: l.qty, note: l.note, deletedAt: null },
        create: { menuItemId: params.id, inventoryItemId: l.inventoryItemId, qty: l.qty, note: l.note },
      })
    }
  })

  const links = await prisma.menuItemInventoryItem.findMany({
    where: { menuItemId: params.id, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    include: linkInclude,
  })
  return NextResponse.json(links)
}
