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
  type MenuImportItem,
} from '@/lib/menu-import'
import { normaliseOptionGroups, validateOptionGroup, type MenuOptionGroup } from '@/lib/menu-options'
import type { ImportRowAction, ImportSummary } from '@/lib/import/types'

class ImportError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

const MAX_ROWS = 400
const DIETARY_NOTE = 'DIETARY NOT IMPORTED - ALLERGENS COME FROM THE PRODUCT'

function normaliseItem(raw: unknown): MenuImportItem | null {
  const item = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const name = normaliseMenuName(item.name)
  if (!name) return null
  return {
    name,
    price: parseImportPrice(item.price ?? item.priceNzd ?? item.cost),
    description: typeof item.description === 'string' && item.description.trim() ? item.description.trim() : null,
    sizes: normaliseImportSizes(item.sizes ?? item.variants ?? item.sizeOptions),
    options: normaliseImportOptions(item.options ?? item.optionGroups ?? item.modifiers),
  }
}

type Tx = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

async function applyOptions(tx: Tx, menuItemId: string, item: MenuImportItem, warnings: string[]): Promise<number> {
  const valid: MenuOptionGroup[] = []
  for (const group of normaliseOptionGroups(item.options)) {
    const errors = validateOptionGroup(group)
    if (errors.length > 0) {
      warnings.push(`OPTION "${group.name}" ON "${item.name}" SKIPPED - ${errors[0]}`)
      continue
    }
    valid.push(group)
  }
  if (valid.length === 0) return 0

  const existing = await tx.menuItemOptionGroup.findMany({ where: { menuItemId }, include: { choices: true } })
  const groupsByName = new Map(existing.map((g) => [g.name, { id: g.id, deletedAt: g.deletedAt }]))
  const choicesByGroup = new Map(
    existing.map((g) => [g.id, new Map(g.choices.map((c) => [c.name, { id: c.id, deletedAt: c.deletedAt }]))]),
  )

  for (const [groupIndex, group] of valid.entries()) {
    let groupId: string
    const found = groupsByName.get(group.name)
    if (!found) {
      const created = await tx.menuItemOptionGroup.create({
        data: { menuItemId, name: group.name, minSelect: group.minSelect, maxSelect: group.maxSelect, sortOrder: groupIndex },
      })
      groupId = created.id
      choicesByGroup.set(groupId, new Map())
      groupsByName.set(group.name, { id: groupId, deletedAt: null })
    } else {
      groupId = found.id
      if (found.deletedAt) await tx.menuItemOptionGroup.update({ where: { id: groupId }, data: { deletedAt: null } })
    }

    const choicesByName = choicesByGroup.get(groupId) ?? new Map()
    for (const [choiceIndex, choice] of group.choices.entries()) {
      const existingChoice = choicesByName.get(choice.name)
      if (!existingChoice) {
        const created = await tx.menuItemOptionChoice.create({
          data: { groupId, name: choice.name, priceDelta: choice.priceDelta, isDefault: choice.isDefault, sortOrder: choiceIndex },
        })
        choicesByName.set(choice.name, { id: created.id, deletedAt: null })
      } else if (existingChoice.deletedAt) {
        await tx.menuItemOptionChoice.update({ where: { id: existingChoice.id }, data: { deletedAt: null } })
      }
    }
    choicesByGroup.set(groupId, choicesByName)
  }
  return valid.length
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.menus.view')
  if (denied) return denied

  const venueId = session.user.role === 'MANAGER' ? session.user.venueId : req.nextUrl.searchParams.get('venueId') || session.user.venueId
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  const items = await prisma.menuItem.findMany({
    where: { venueId, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.menus.create')
  if (denied) return denied

  const body = await req.json().catch(() => null) as {
    venueId?: string
    rows?: { action?: ImportRowAction; targetId?: string; values?: unknown }[]
  } | null
  const venueId = session.user.role === 'MANAGER' ? session.user.venueId : body?.venueId || session.user.venueId
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })
  if (!Array.isArray(body?.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: 'NO ROWS TO IMPORT' }, { status: 400 })
  }
  if (body.rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `TOO MANY ROWS - MAX ${MAX_ROWS}` }, { status: 400 })
  }

  try {
    const summary = await prisma.$transaction(async (tx): Promise<ImportSummary> => {
      const out: ImportSummary = { created: 0, updated: 0, revived: 0, skipped: 0, warnings: [DIETARY_NOTE] }

      for (const raw of body.rows ?? []) {
        const item = normaliseItem(raw.values)
        if (!item) { out.skipped++; continue }
        const action = raw.action ?? 'CREATE'
        if (action === 'SKIP') { out.skipped++; continue }

        const target = raw.targetId
          ? await tx.menuItem.findFirst({ where: { id: raw.targetId, venueId } })
          : null
        if (raw.targetId && !target) {
          out.skipped++
          out.warnings.push(`"${item.name}" TARGET NOT FOUND - SKIPPED`)
          continue
        }

        if (target && (action === 'UPDATE' || action === 'REVIVE')) {
          const variations = item.sizes.length > 0 ? item.sizes.map((s) => ({ name: s.label, price: s.price })) : target.variations
          await tx.menuItem.update({
            where: { id: target.id },
            data: {
              name: item.name,
              price: item.price ?? target.price,
              description: item.description ?? target.description,
              variations: variations ?? undefined,
              ...(item.sizes.length > 0 ? { isVariable: true } : {}),
              ...(action === 'REVIVE' ? { deletedAt: null } : {}),
            },
          })
          await applyOptions(tx, target.id, item, out.warnings)
          if (action === 'REVIVE') out.revived++
          else out.updated++
          continue
        }

        const existing = await tx.menuItem.findFirst({
          where: { venueId, name: item.name },
          select: { id: true },
        })
        if (existing) {
          out.skipped++
          out.warnings.push(`"${item.name}" ALREADY EXISTS - SKIPPED (CHOOSE UPDATE TO OVERWRITE)`)
          continue
        }

        if (item.price == null && item.sizes.length === 0) {
          out.warnings.push(`"${item.name}" HAS NO PRICE - IMPORTED AT $0`)
        }
        const variations = item.sizes.length > 0 ? item.sizes.map((s) => ({ name: s.label, price: s.price })) : null
        const created = await tx.menuItem.create({
          data: {
            venueId,
            name: item.name,
            price: item.price ?? item.sizes[0]?.price ?? 0,
            description: item.description,
            dietaryInfo: null,
            recipeId: null,
            wooProductId: null,
            isActive: true,
            ...(variations ? { isVariable: true, variations } : {}),
          },
          select: { id: true },
        })
        await applyOptions(tx, created.id, item, out.warnings)
        out.created++
      }

      return out
    })

    return NextResponse.json(summary)
  } catch (e) {
    if (e instanceof ImportError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error('menu-item import failed', e)
    return NextResponse.json({ error: 'IMPORT FAILED' }, { status: 500 })
  }
}
