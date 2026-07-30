import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const venueParam = req.nextUrl.searchParams.get('venueId')
  const venueId =
    session.user.role === 'MANAGER' ? session.user.venueId : venueParam || session.user.venueId

  const menus = await prisma.menu.findMany({
    where: { venueId, deletedAt: null },
    include: {
      items: {
        include: {
          menuItem: {
            select: { id: true, name: true, price: true, dietaryInfo: true, isActive: true },
          },
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })

  return NextResponse.json(menus)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const venueId =
    session.user.role === 'MANAGER' ? session.user.venueId : body.venueId || session.user.venueId

  const name = String(body.name ?? '').toUpperCase().trim()
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const minPax = toIntOrNull(body.minPax)
  const maxPax = toIntOrNull(body.maxPax)
  if (minPax != null && maxPax != null && minPax > maxPax) {
    return NextResponse.json({ error: 'minPax cannot exceed maxPax' }, { status: 400 })
  }

  // A soft-deleted menu still holds the [venueId, name] unique slot — revive it
  // rather than failing on a constraint the user cannot see.
  const existing = await prisma.menu.findFirst({ where: { venueId, name } })
  if (existing) {
    if (!existing.deletedAt) {
      return NextResponse.json({ error: 'A menu with that name already exists' }, { status: 409 })
    }
    const revived = await prisma.menu.update({
      where: { id: existing.id },
      data: {
        deletedAt: null,
        description: body.description ?? null,
        minPax,
        maxPax,
        isActive: body.isActive ?? true,
      },
    })
    return NextResponse.json(revived, { status: 201 })
  }

  const menu = await prisma.menu.create({
    data: {
      venueId,
      name,
      description: body.description ?? null,
      minPax,
      maxPax,
      isActive: body.isActive ?? true,
      sortOrder: toIntOrNull(body.sortOrder) ?? 0,
    },
  })

  return NextResponse.json(menu, { status: 201 })
}

function toIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = parseInt(String(v), 10)
  return isNaN(n) ? null : n
}
