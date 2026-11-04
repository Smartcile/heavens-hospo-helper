import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { formatAllergens, parseAllergens } from '@/lib/allergens'
import type { MenuImportData, MenuImportItem } from '@/lib/menu-import'
import { syncMenuItemCategory } from '@/lib/menu-sync'

class ImportError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

const MAX_ITEMS = 400

function normaliseItem(raw: unknown): MenuImportItem | null {
  const item = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const name = String(item.name ?? '').toUpperCase().trim()
  if (!name) return null
  const price = typeof item.price === 'number' && Number.isFinite(item.price) && item.price >= 0 ? item.price : null
  const description = typeof item.description === 'string' && item.description.trim() ? item.description.trim() : null
  const dietary = parseAllergens(Array.isArray(item.dietary) ? item.dietary.join(',') : '')
  return { name, price, description, dietary }
}

function normaliseData(raw: unknown): MenuImportData {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const groups = (Array.isArray(data.groups) ? data.groups : []).map((rawGroup) => {
    const group = (rawGroup && typeof rawGroup === 'object' ? rawGroup : {}) as Record<string, unknown>
    return {
      name: String(group.name ?? 'MENU').toUpperCase().trim() || 'MENU',
      items: (Array.isArray(group.items) ? group.items : [])
        .map(normaliseItem)
        .filter((i): i is MenuImportItem => !!i),
    }
  }).filter((g) => g.items.length > 0)

  const total = groups.reduce((n, g) => n + g.items.length, 0)
  if (total === 0) throw new ImportError('NO ITEMS TO IMPORT', 400)
  if (total > MAX_ITEMS) throw new ImportError(`TOO MANY ITEMS (${total}) — MAX ${MAX_ITEMS}`, 400)

  return {
    name: String(data.name ?? '').toUpperCase().trim() || 'IMPORTED MENU',
    description: typeof data.description === 'string' && data.description.trim() ? data.description.trim() : null,
    groups,
  }
}

// Import a parsed menu (from the pasted LLM answer) into a new or existing menu.
// No WooCommerce writes: new products have wooProductId null, so syncMenuItemCategory
// never triggers the create-on-missing push.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.menus.create')
  if (denied) return denied

  const body = await req.json().catch(() => null) as {
    venueId?: string
    menuId?: string
    menuName?: string
    data?: unknown
  } | null

  const venueId = session.user.role === 'MANAGER' ? session.user.venueId : body?.venueId || session.user.venueId
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  let data: MenuImportData
  try {
    data = normaliseData(body?.data)
  } catch (e) {
    if (e instanceof ImportError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }

  const createdProductIds: string[] = []

  try {
    const out = await prisma.$transaction(async (tx) => {
      let menu
      if (body?.menuId) {
        menu = await tx.menu.findFirst({ where: { id: body.menuId, venueId, deletedAt: null } })
        if (!menu) throw new ImportError('MENU NOT FOUND', 404)
      } else {
        const name = (body?.menuName ? String(body.menuName) : data.name).toUpperCase().trim()
        if (!name) throw new ImportError('MENU NAME IS REQUIRED', 400)
        const existing = await tx.menu.findFirst({ where: { venueId, name } })
        if (existing && !existing.deletedAt) {
          menu = existing
        } else if (existing) {
          menu = await tx.menu.update({
            where: { id: existing.id },
            data: { deletedAt: null, description: data.description ?? existing.description },
          })
        } else {
          menu = await tx.menu.create({
            data: {
              venueId,
              name,
              description: data.description ?? null,
              isActive: true,
              sortOrder: 0,
              // Local-only until the operator links a Woo category; never create one here.
              wooCategoryId: null,
            },
          })
        }
      }

      let created = 0
      let matched = 0
      let skipped = 0

      for (const [groupIndex, group] of data.groups.entries()) {
        let menuGroup = await tx.menuGroup.findFirst({
          where: { menuId: menu.id, deletedAt: null, name: { equals: group.name, mode: 'insensitive' } },
        })
        if (!menuGroup) {
          menuGroup = await tx.menuGroup.create({
            data: { menuId: menu.id, name: group.name, sortOrder: groupIndex },
          })
        }

        for (const [itemIndex, item] of group.items.entries()) {
          let product = await tx.menuItem.findFirst({
            where: { venueId, deletedAt: null, name: { equals: item.name, mode: 'insensitive' } },
            orderBy: { createdAt: 'asc' },
          })
          if (product) {
            matched++
          } else {
            product = await tx.menuItem.create({
              data: {
                venueId,
                name: item.name,
                price: item.price ?? 0,
                description: item.description,
                dietaryInfo: item.dietary.length > 0 ? formatAllergens(item.dietary) : null,
                recipeId: null,
                wooProductId: null,
                isActive: true,
              },
            })
            createdProductIds.push(product.id)
            created++
          }

          const line = await tx.menuMenuItem.findFirst({
            where: { menuId: menu.id, menuItemId: product.id },
          })
          if (line) {
            skipped++
            continue
          }
          await tx.menuMenuItem.create({
            data: { menuId: menu.id, menuItemId: product.id, groupId: menuGroup.id, sortOrder: itemIndex },
          })
        }
      }

      return { menuId: menu.id, created, matched, skipped }
    })

    // Best-effort category mirror for the new products (DB-only: they have no Woo id).
    for (const id of createdProductIds) await syncMenuItemCategory(id)

    return NextResponse.json(out)
  } catch (e) {
    if (e instanceof ImportError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error('menu import failed:', e)
    return NextResponse.json({ error: 'IMPORT FAILED' }, { status: 500 })
  }
}
