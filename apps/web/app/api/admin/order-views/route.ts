import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'

const VIEW_TYPES = ['SERVICE', 'KITCHEN', 'FOH', 'PRODUCTION']

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'orders.orders.view')
  if (denied) return denied

  const venueId =
    session.user.role === 'MANAGER'
      ? session.user.venueId
      : req.nextUrl.searchParams.get('venueId') || session.user.venueId

  const views = await prisma.orderView.findMany({
    where: {
      venueId,
      deletedAt: null,
      // Private views belong to whoever made them.
      OR: [{ isShared: true }, { createdById: session.user.id }],
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })

  return NextResponse.json(views)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'orders.orders.create')
  if (denied) return denied

  const body = await req.json()
  const venueId =
    session.user.role === 'MANAGER' ? session.user.venueId : body.venueId || session.user.venueId

  const name = String(body.name ?? '').toUpperCase().trim()
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (!VIEW_TYPES.includes(body.viewType)) {
    return NextResponse.json({ error: `viewType must be one of ${VIEW_TYPES.join(', ')}` }, { status: 400 })
  }

  const view = await prisma.orderView.create({
    data: {
      venueId,
      name,
      viewType: body.viewType,
      config: body.config ?? {},
      isShared: body.isShared ?? true,
      createdById: session.user.id,
      sortOrder: Number(body.sortOrder) || 0,
    },
  })

  return NextResponse.json(view, { status: 201 })
}
