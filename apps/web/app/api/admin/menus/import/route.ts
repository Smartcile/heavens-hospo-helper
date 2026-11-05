import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import {
  normaliseImportOptions,
  normaliseImportSizes,
  normaliseMenuName,
  parseImportPrice,
  type MenuImportData,
  type MenuImportItem,
} from '@/lib/menu-import'

class ImportError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

const MAX_ITEMS = 400
const DIETARY_NOTE = 'DIETARY NOT IMPORTED — ALLERGENS COME FROM THE PRODUCT'

function normaliseItem(raw: unknown): MenuImportItem | null {
  const item = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const name = normaliseMenuName(item.name)
  if (!name) return null
  const description = typeof item.description === 'string' && item.description.trim()
    ? item.description.trim()
    : null
  return {
    name,
    price: parseImportPrice(item.price ?? item.priceNzd ?? item.cost),
    description,
    sizes: normaliseImportSizes(item.sizes ?? item.variants ?? item.sizeOptions),
    options: normaliseImportOptions(item.options ?? item.optionGroups ?? item.modifiers),
  }
}

function normaliseData(raw: unknown): MenuImportData {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const groups = (Array.isArray(data.groups) ? data.groups : []).map((rawGroup) => {
    const group = (rawGroup && typeof rawGroup === 'object' ? rawGroup : {}) as Record<string, unknown>
    return {
      name: normaliseMenuName(group.name) || 'MENU',
      area: normaliseMenuName(group.area ?? group.section) || null,
      items: (Array.isArray(group.items) ? group.items : [])
        .map(normaliseItem)
        .filter((i): i is MenuImportItem => !!i),
    }
  }).filter((g) => g.items.length > 0)

  const total = groups.reduce((n, g) => n + g.items.length, 0)
  if (total === 0) throw new ImportError('NO ITEMS TO IMPORT', 400)
  if (total > MAX_ITEMS) throw new ImportError(`TOO MANY ITEMS (${total}) — MAX ${MAX_ITEMS}`, 400)

  return {
    name: normaliseMenuName(data.name) || 'IMPORTED MENU',
    description: typeof data.description === 'string' && data.description.trim()
      ? data.description.trim()
      : null,
    groups,
  }
}

// Import a parsed menu (from the pasted LLM answer) into a new or existing menu.
// Purely local: new products have no WooCommerce link. Re-importing the same
// answer is idempotent — products match by normalised name and lines are
// re-filed/reordered rather than duplicated.
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

  try {
    const out = await prisma.$transaction(async (tx) => {
      let menu
      if (body?.menuId) {
        menu = await tx.menu.findFirst({ where: { id: body.menuId, venueId, deletedAt: null } })
        if (!menu) throw new ImportError('MENU NOT FOUND', 404)
      } else {
        const name = normaliseMenuName(body?.menuName ? String(body.menuName) : data.name)
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

      // Load every product once and index by the same normalised name the parser
      // uses. Collapsing internal whitespace means a re-worded answer still
      // matches instead of creating a near-duplicate product.
      const products = await tx.menuItem.findMany({
        where: { venueId, deletedAt: null },
        select: { id: true, name: true },
      })
      const productsByName = new Map<string, { id: string; name: string }[]>()
      for (const product of products) {
        const key = normaliseMenuName(product.name)
        const list = productsByName.get(key) ?? []
        list.push(product)
        productsByName.set(key, list)
      }

      const menuGroups = await tx.menuGroup.findMany({
        where: { menuId: menu.id, deletedAt: null },
        select: { id: true, name: true, sortOrder: true },
      })
      const groupByName = new Map(menuGroups.map((g) => [normaliseMenuName(g.name), g]))

      let created = 0
      let matched = 0
      let linesAdded = 0
      let linesUpdated = 0
      let skipped = 0
      const warnings = [DIETARY_NOTE]
      const processed = new Set<string>()

      for (const [groupIndex, group] of data.groups.entries()) {
        const groupKey = normaliseMenuName(group.name)
        let menuGroup = groupByName.get(groupKey)
        if (!menuGroup) {
          menuGroup = await tx.menuGroup.create({
            data: { menuId: menu.id, name: group.name, sortOrder: groupIndex },
          })
          groupByName.set(groupKey, menuGroup)
        } else if (menuGroup.sortOrder !== groupIndex) {
          menuGroup = await tx.menuGroup.update({
            where: { id: menuGroup.id },
            data: { sortOrder: groupIndex },
          })
        }

        for (const [itemIndex, item] of group.items.entries()) {
          const itemKey = normaliseMenuName(item.name)
          if (processed.has(itemKey)) {
            skipped++
            warnings.push(`DUPLICATE "${item.name}" — ONLY THE FIRST IS IMPORTED`)
            continue
          }
          processed.add(itemKey)

          const candidates = productsByName.get(itemKey) ?? []
          if (candidates.length > 1) {
            // Never guess between real duplicates — a wrongly merged dish is
            // worse than leaving the operator to resolve it.
            skipped++
            warnings.push(`AMBIGUOUS NAME "${item.name}" — ${candidates.length} PRODUCTS, SKIPPED`)
            continue
          }

          let product = candidates[0]
          if (product) {
            matched++
          } else {
            if (item.price == null && item.sizes.length === 0) {
              warnings.push(`"${item.name}" HAS NO PRICE — IMPORTED AT $0`)
            }
            const variations = item.sizes.length > 0
              ? item.sizes.map((s) => ({ name: s.label, price: s.price }))
              : null
            product = await tx.menuItem.create({
              data: {
                venueId,
                name: item.name,
                price: item.price ?? item.sizes[0]?.price ?? 0,
                description: item.description,
                // Import never carries allergens — they come from the product.
                dietaryInfo: null,
                recipeId: null,
                wooProductId: null,
                isActive: true,
                ...(variations ? { isVariable: true, variations } : {}),
              },
              select: { id: true, name: true },
            })
            created++
            productsByName.set(itemKey, [product])
          }

          const line = await tx.menuMenuItem.findFirst({
            where: { menuId: menu.id, menuItemId: product.id },
            select: { id: true, groupId: true, sortOrder: true },
          })
          if (!line) {
            await tx.menuMenuItem.create({
              data: { menuId: menu.id, menuItemId: product.id, groupId: menuGroup.id, sortOrder: itemIndex },
            })
            linesAdded++
          } else if (line.groupId !== menuGroup.id || line.sortOrder !== itemIndex) {
            await tx.menuMenuItem.update({
              where: { id: line.id },
              data: { groupId: menuGroup.id, sortOrder: itemIndex },
            })
            linesUpdated++
          }
        }
      }

      return { menuId: menu.id, created, matched, linesAdded, linesUpdated, skipped, warnings }
    })

    return NextResponse.json(out)
  } catch (e) {
    if (e instanceof ImportError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error('menu import failed:', e)
    return NextResponse.json({ error: 'IMPORT FAILED' }, { status: 500 })
  }
}
