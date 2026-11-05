import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { normaliseOptionGroups, validateOptionGroups } from '@/lib/menu-options'

interface Params {
  params: { id: string }
}

// Product-level option groups (shared across every menu the product is on).
// The PUT is a replace-set: groups/choices not in the payload are soft-deleted,
// matching soft-deleted rows are revived by their unique key.

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

async function loadGroups(menuItemId: string) {
  return prisma.menuItemOptionGroup.findMany({
    where: { menuItemId, deletedAt: null },
    orderBy: { sortOrder: 'asc' },
    include: {
      choices: {
        where: { deletedAt: null },
        orderBy: { sortOrder: 'asc' },
      },
    },
  })
}

export async function GET(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.menus.view')
  if (denied) return denied

  const scoped = await scopedItem(params.id, session)
  if (scoped.error) return scoped.error

  return NextResponse.json(await loadGroups(params.id))
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.menus.edit')
  if (denied) return denied

  const scoped = await scopedItem(params.id, session)
  if (scoped.error) return scoped.error

  const body = (await req.json()) as { groups?: unknown }
  if (!Array.isArray(body.groups)) {
    return NextResponse.json({ error: 'groups must be an array' }, { status: 400 })
  }

  const groups = normaliseOptionGroups(body.groups)
  const errors = validateOptionGroups(groups)
  if (errors.length > 0) {
    return NextResponse.json({ error: errors[0], errors }, { status: 400 })
  }

  // Include soft-deleted rows: the unique keys span them, so a returning group
  // or choice must be revived rather than inserted (P2002 otherwise).
  const existing = await prisma.menuItemOptionGroup.findMany({
    where: { menuItemId: params.id },
    include: { choices: true },
  })

  await prisma.$transaction(async (tx) => {
    const byName = new Map(existing.map((g) => [g.name, g]))
    const byId = new Map(existing.map((g) => [g.id, g]))
    const keepGroups = new Set<string>()

    for (let gi = 0; gi < groups.length; gi++) {
      const group = groups[gi]
      // Name is the unique key (and is available on soft-deleted rows); fall
      // back to the id for a rename into a fresh name.
      const target = byName.get(group.name) ?? (group.id ? byId.get(group.id) : undefined)

      const groupData = {
        name: group.name,
        minSelect: group.minSelect,
        maxSelect: group.maxSelect,
        sortOrder: gi,
        deletedAt: null,
      }

      const savedGroup = target
        ? await tx.menuItemOptionGroup.update({ where: { id: target.id }, data: groupData })
        : await tx.menuItemOptionGroup.create({
            data: { menuItemId: params.id, ...groupData },
          })
      keepGroups.add(savedGroup.id)

      const existingChoices = target?.choices ?? []
      const choicesByName = new Map(existingChoices.map((c) => [c.name, c]))
      const choicesById = new Map(existingChoices.map((c) => [c.id, c]))
      const keepChoices = new Set<string>()

      for (let ci = 0; ci < group.choices.length; ci++) {
        const choice = group.choices[ci]
        const choiceTarget =
          choicesByName.get(choice.name) ?? (choice.id ? choicesById.get(choice.id) : undefined)

        const choiceData = {
          name: choice.name,
          priceDelta: choice.priceDelta,
          isDefault: choice.isDefault,
          sortOrder: ci,
          deletedAt: null,
        }

        const savedChoice = choiceTarget
          ? await tx.menuItemOptionChoice.update({ where: { id: choiceTarget.id }, data: choiceData })
          : await tx.menuItemOptionChoice.create({
              data: { groupId: savedGroup.id, ...choiceData },
            })
        keepChoices.add(savedChoice.id)
      }

      const removedChoices = existingChoices
        .filter((c) => !c.deletedAt && !keepChoices.has(c.id))
        .map((c) => c.id)
      if (removedChoices.length > 0) {
        await tx.menuItemOptionChoice.updateMany({
          where: { id: { in: removedChoices } },
          data: { deletedAt: new Date() },
        })
      }
    }

    const removedGroups = existing
      .filter((g) => !g.deletedAt && !keepGroups.has(g.id))
      .map((g) => g.id)
    if (removedGroups.length > 0) {
      await tx.menuItemOptionChoice.updateMany({
        where: { groupId: { in: removedGroups }, deletedAt: null },
        data: { deletedAt: new Date() },
      })
      await tx.menuItemOptionGroup.updateMany({
        where: { id: { in: removedGroups } },
        data: { deletedAt: new Date() },
      })
    }
  })

  return NextResponse.json(await loadGroups(params.id))
}
