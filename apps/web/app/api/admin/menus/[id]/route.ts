import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { ensureWooCategory, renameWooCategory } from '@/lib/woo-categories'
import { diffItemIds, syncMenuItemCategory } from '@/lib/menu-sync'

async function loadScoped(id: string, session: { user: { role: string; venueId: string } }) {
  const menu = await prisma.menu.findFirst({ where: { id, deletedAt: null } })
  if (!menu) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  if (session.user.role === 'MANAGER' && menu.venueId !== session.user.venueId) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { menu }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const scoped = await loadScoped(params.id, session)
  if (scoped.error) return scoped.error

  const menu = await prisma.menu.findUnique({
    where: { id: params.id },
    include: {
      items: {
        where: { menuItem: { deletedAt: null } },
        include: {
          menuItem: {
            select: { id: true, name: true, price: true, dietaryInfo: true, isActive: true },
          },
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
  })

  return NextResponse.json(menu)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const scoped = await loadScoped(params.id, session)
  if (scoped.error) return scoped.error

  const body = await req.json()
  const data: Record<string, unknown> = {}

  if (body.name !== undefined) data.name = String(body.name).toUpperCase().trim()
  if (body.description !== undefined) data.description = body.description || null
  if (body.minPax !== undefined) data.minPax = toIntOrNull(body.minPax)
  if (body.maxPax !== undefined) data.maxPax = toIntOrNull(body.maxPax)
  if (body.isActive !== undefined) data.isActive = !!body.isActive
  if (body.sortOrder !== undefined) data.sortOrder = toIntOrNull(body.sortOrder) ?? 0

  // Category resolution — same contract as POST:
  // '__new__' → match/create a store category named after the menu,
  // '' / null → local-only (never touches the store), <id> → verbatim.
  let resolvedCategory: string | null | undefined
  if (body.wooCategoryId !== undefined) {
    resolvedCategory =
      body.wooCategoryId === '__new__'
        ? await ensureWooCategory(scoped.menu!.venueId, String(data.name ?? scoped.menu!.name))
        : String(body.wooCategoryId || null)
    data.wooCategoryId = resolvedCategory
  }

  const minPax = (data.minPax as number | null) ?? scoped.menu!.minPax
  const maxPax = (data.maxPax as number | null) ?? scoped.menu!.maxPax
  if (minPax != null && maxPax != null && minPax > maxPax) {
    return NextResponse.json({ error: 'minPax cannot exceed maxPax' }, { status: 400 })
  }

  /*
   * `items` is a full replacement set when supplied — diffed rather than
   * deleted-and-recreated so the junction ids (and any future references to
   * them) survive an edit that only changes a limit. Items added to or
   * removed from the menu get their WooCommerce category re-synced afterwards.
   */
  const changedItemIds: string[] = []
  if (Array.isArray(body.items)) {
    const incoming = body.items as {
      menuItemId: string
      minQty?: unknown
      maxQty?: unknown
      sortOrder?: unknown
    }[]

    const prevIds = (await prisma.menuMenuItem.findMany({
      where: { menuId: params.id },
      select: { menuItemId: true },
    })).map((e) => e.menuItemId)

    await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.menu.update({ where: { id: params.id }, data })
      }

      const existing = await tx.menuMenuItem.findMany({
        where: { menuId: params.id },
        select: { id: true, menuItemId: true },
      })
      const existingByItem = new Map(existing.map((e) => [e.menuItemId, e.id]))
      const keep = new Set<string>()

      for (let i = 0; i < incoming.length; i++) {
        const row = incoming[i]
        if (!row?.menuItemId) continue
        const min = toIntOrNull(row.minQty)
        const max = toIntOrNull(row.maxQty)
        const found = existingByItem.get(row.menuItemId)

        if (found) {
          await tx.menuMenuItem.update({
            where: { id: found },
            data: { minQty: min, maxQty: max, sortOrder: toIntOrNull(row.sortOrder) ?? i },
          })
          keep.add(found)
        } else {
          const created = await tx.menuMenuItem.create({
            data: {
              menuId: params.id,
              menuItemId: row.menuItemId,
              minQty: min,
              maxQty: max,
              sortOrder: toIntOrNull(row.sortOrder) ?? i,
            },
          })
          keep.add(created.id)
        }
      }

      const remove = existing.filter((e) => !keep.has(e.id)).map((e) => e.id)
      if (remove.length > 0) {
        await tx.menuMenuItem.deleteMany({ where: { id: { in: remove } } })
      }
    })

    // Sync categories for membership changes, outside the transaction.
    const { added, removed } = diffItemIds(prevIds, incoming.map((r) => r.menuItemId).filter(Boolean))
    changedItemIds.push(...added, ...removed)
  } else if (Object.keys(data).length > 0) {
    await prisma.menu.update({ where: { id: params.id }, data })
  }

  // Menus and categories are the same thing — keep the store category in step.
  // A rename renames the linked category, but only when the link itself wasn't
  // also changed in this save (a relink supersedes the old category).
  const categoryChanged =
    resolvedCategory !== undefined && resolvedCategory !== scoped.menu!.wooCategoryId
  if (data.name !== undefined && data.name !== scoped.menu!.name && !categoryChanged) {
    const renamed = String(data.name)
    if (scoped.menu!.wooCategoryId) {
      await renameWooCategory(scoped.menu!.venueId, scoped.menu!.wooCategoryId, renamed)
    } else {
      const wooCategoryId = await ensureWooCategory(scoped.menu!.venueId, renamed)
      if (wooCategoryId) {
        await prisma.menu.update({ where: { id: params.id }, data: { wooCategoryId } })
      }
    }
  }

  // A relink moves the menu's items to the new category on the store.
  if (categoryChanged) {
    const itemIds = (await prisma.menuMenuItem.findMany({
      where: { menuId: params.id },
      select: { menuItemId: true },
    })).map((e) => e.menuItemId)
    for (const itemId of itemIds) {
      await syncMenuItemCategory(itemId)
    }
  }

  for (const itemId of changedItemIds) {
    await syncMenuItemCategory(itemId)
  }

  const updated = await prisma.menu.findUnique({
    where: { id: params.id },
    include: {
      items: {
        where: { menuItem: { deletedAt: null } },
        include: {
          menuItem: {
            select: { id: true, name: true, price: true, dietaryInfo: true, isActive: true },
          },
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const scoped = await loadScoped(params.id, session)
  if (scoped.error) return scoped.error

  const itemIds = (await prisma.menuMenuItem.findMany({
    where: { menuId: params.id },
    select: { menuItemId: true },
  })).map((e) => e.menuItemId)

  await prisma.menu.update({
    where: { id: params.id },
    data: { deletedAt: new Date() },
  })

  // Items that only lived in this menu lose their category on the store.
  for (const itemId of itemIds) {
    await syncMenuItemCategory(itemId)
  }

  return NextResponse.json({ ok: true })
}

function toIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = parseInt(String(v), 10)
  return isNaN(n) ? null : n
}
