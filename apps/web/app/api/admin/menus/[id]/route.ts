import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

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
        include: {
          menuItem: { select: { id: true, name: true, price: true, dietaryInfo: true, isActive: true } },
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

  const minPax = (data.minPax as number | null) ?? scoped.menu!.minPax
  const maxPax = (data.maxPax as number | null) ?? scoped.menu!.maxPax
  if (minPax != null && maxPax != null && minPax > maxPax) {
    return NextResponse.json({ error: 'minPax cannot exceed maxPax' }, { status: 400 })
  }

  /*
   * `items` is a full replacement set when supplied — diffed rather than
   * deleted-and-recreated so the junction ids (and any future references to
   * them) survive an edit that only changes a limit.
   */
  if (Array.isArray(body.items)) {
    const incoming = body.items as {
      menuItemId: string
      minQty?: unknown
      maxQty?: unknown
      sortOrder?: unknown
    }[]

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
  } else if (Object.keys(data).length > 0) {
    await prisma.menu.update({ where: { id: params.id }, data })
  }

  const updated = await prisma.menu.findUnique({
    where: { id: params.id },
    include: {
      items: {
        include: {
          menuItem: { select: { id: true, name: true, price: true, dietaryInfo: true, isActive: true } },
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

  await prisma.menu.update({
    where: { id: params.id },
    data: { deletedAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}

function toIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = parseInt(String(v), 10)
  return isNaN(n) ? null : n
}
