import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, Prisma } from '@hospo-ops/db'
import { ensureWooCategory, renameWooCategory } from '@/lib/woo-categories'
import { diffItemIds, syncMenuItemCategory } from '@/lib/menu-sync'
import { guardAccess } from '@/lib/permissions'
import { menuInclude, shapeMenuLine } from '@/lib/menu-lines.server'
import { cleanSizes } from '@/lib/menu-lines'

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
  const denied = await guardAccess(session, _req, 'ops.menus.view')
  if (denied) return denied

  const scoped = await loadScoped(params.id, session)
  if (scoped.error) return scoped.error

  const menu = await prisma.menu.findUnique({
    where: { id: params.id },
    include: menuInclude,
  })

  return NextResponse.json(menu ? { ...menu, items: menu.items.map(shapeMenuLine) } : null)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.menus.edit')
  if (denied) return denied

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
   * `groups` and `items` are full replacement sets when supplied — diffed
   * rather than deleted-and-recreated so junction ids survive an edit that
   * only changes a limit. A line is a product (`menuItemId`) or a stock item
   * (`inventoryItemId`); stock lines carry their own `sizeOptions`. Items added
   * to or removed from the menu get their WooCommerce category re-synced.
   */
  const changedItemIds: string[] = []
  if (Array.isArray(body.groups) || Array.isArray(body.items)) {
    // Maps a group's real id (and any client-generated temp id) to its real id,
    // so items saved in the same request can reference a brand-new group.
    const groupKeyToId = new Map<string, string>()

    await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.menu.update({ where: { id: params.id }, data })
      }

      if (Array.isArray(body.groups)) {
        const existingGroups = await tx.menuGroup.findMany({ where: { menuId: params.id } })
        const byId = new Map(existingGroups.map((g) => [g.id, g]))
        const keep = new Set<string>()

        for (let i = 0; i < body.groups.length; i++) {
          const g = body.groups[i] as { id?: string; _clientId?: string; name?: unknown; sortOrder?: unknown }
          const name = String(g.name ?? '').toUpperCase().trim()
          if (!name) continue
          const found = g.id ? byId.get(g.id) : undefined
          if (found) {
            await tx.menuGroup.update({
              where: { id: found.id },
              data: { name, sortOrder: toIntOrNull(g.sortOrder) ?? i, deletedAt: null },
            })
            keep.add(found.id)
            groupKeyToId.set(found.id, found.id)
            if (g._clientId) groupKeyToId.set(String(g._clientId), found.id)
          } else {
            const created = await tx.menuGroup.create({
              data: { menuId: params.id, name, sortOrder: toIntOrNull(g.sortOrder) ?? i },
            })
            keep.add(created.id)
            groupKeyToId.set(created.id, created.id)
            if (g._clientId) groupKeyToId.set(String(g._clientId), created.id)
          }
        }

        const removedGroups = existingGroups.filter((g) => !keep.has(g.id)).map((g) => g.id)
        if (removedGroups.length > 0) {
          await tx.menuGroup.updateMany({ where: { id: { in: removedGroups } }, data: { deletedAt: new Date() } })
          await tx.menuMenuItem.updateMany({ where: { groupId: { in: removedGroups } }, data: { groupId: null } })
        }
      }

      if (Array.isArray(body.items)) {
        const existing = await tx.menuMenuItem.findMany({
          where: { menuId: params.id },
          select: { id: true, menuItemId: true, inventoryItemId: true },
        })
        const byId = new Map(existing.map((e) => [e.id, e]))
        const byMenuItem = new Map(existing.filter((e) => e.menuItemId).map((e) => [e.menuItemId as string, e]))
        const byInv = new Map(existing.filter((e) => e.inventoryItemId).map((e) => [e.inventoryItemId as string, e]))
        const keep = new Set<string>()

        for (let i = 0; i < body.items.length; i++) {
          const row = body.items[i] as {
            id?: string
            menuItemId?: unknown
            inventoryItemId?: unknown
            groupId?: unknown
            minQty?: unknown
            maxQty?: unknown
            sortOrder?: unknown
            sizeOptions?: unknown
          }
          const menuItemId = row.menuItemId ? String(row.menuItemId) : null
          const inventoryItemId = row.inventoryItemId ? String(row.inventoryItemId) : null
          if (!menuItemId && !inventoryItemId) continue
          if (menuItemId && inventoryItemId) continue

          const rawGroup = row.groupId ? String(row.groupId) : null
          const groupId = rawGroup ? groupKeyToId.get(rawGroup) ?? rawGroup : null
          // Only stock lines carry their own sizes; products read MenuItem.variations.
          const sizeOptions: Prisma.InputJsonValue | typeof Prisma.DbNull =
            !menuItemId && Array.isArray(row.sizeOptions)
              ? (cleanSizes(row.sizeOptions) as unknown as Prisma.InputJsonValue)
              : Prisma.DbNull

          const found = row.id
            ? byId.get(String(row.id))
            : menuItemId
              ? byMenuItem.get(menuItemId)
              : byInv.get(inventoryItemId as string)

          const line = {
            menuItemId,
            inventoryItemId,
            groupId,
            minQty: toIntOrNull(row.minQty),
            maxQty: toIntOrNull(row.maxQty),
            sizeOptions,
            sortOrder: toIntOrNull(row.sortOrder) ?? i,
          }

          if (found) {
            await tx.menuMenuItem.update({ where: { id: found.id }, data: line })
            keep.add(found.id)
          } else {
            const created = await tx.menuMenuItem.create({ data: { ...line, menuId: params.id } })
            keep.add(created.id)
          }
        }

        const remove = existing.filter((e) => !keep.has(e.id)).map((e) => e.id)
        if (remove.length > 0) {
          await tx.menuMenuItem.deleteMany({ where: { id: { in: remove } } })
        }

        const prevMenuItemIds = existing.map((e) => e.menuItemId).filter((x): x is string => !!x)
        const nextMenuItemIds = (body.items as { menuItemId?: unknown }[])
          .map((r) => (r.menuItemId ? String(r.menuItemId) : ''))
          .filter(Boolean)
        const { added, removed } = diffItemIds(prevMenuItemIds, nextMenuItemIds)
        changedItemIds.push(...added, ...removed)
      }
    })
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
      where: { menuId: params.id, menuItemId: { not: null } },
      select: { menuItemId: true },
    })).map((e) => e.menuItemId)
      .filter((x): x is string => !!x)
    for (const itemId of itemIds) {
      await syncMenuItemCategory(itemId)
    }
  }

  for (const itemId of changedItemIds) {
    await syncMenuItemCategory(itemId)
  }

  const updated = await prisma.menu.findUnique({
    where: { id: params.id },
    include: menuInclude,
  })

  return NextResponse.json(updated ? { ...updated, items: updated.items.map(shapeMenuLine) } : null)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, _req, 'ops.menus.delete')
  if (denied) return denied

  const scoped = await loadScoped(params.id, session)
  if (scoped.error) return scoped.error

  const itemIds = (await prisma.menuMenuItem.findMany({
    where: { menuId: params.id, menuItemId: { not: null } },
    select: { menuItemId: true },
  })).map((e) => e.menuItemId)
    .filter((x): x is string => !!x)

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
