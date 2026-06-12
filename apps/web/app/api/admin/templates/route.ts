import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

interface IncomingItem {
  title: string
  description?: string | null
  completionType?: string
  scheduleType?: string
  scheduleDays?: number[]
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Built-in templates (venueId null) are visible to everyone. Custom templates
  // are visible to admins (all) or to the manager's own venue.
  const where = {
    deletedAt: null,
    OR: [
      { isBuiltIn: true },
      ...(session.user.role === 'MANAGER'
        ? [{ venueId: session.user.venueId }]
        : [{ isBuiltIn: false }]),
    ],
  }

  const templates = await prisma.taskTemplate.findMany({
    where,
    include: {
      items: { orderBy: { sortOrder: 'asc' } },
      venue: { select: { id: true, name: true } },
    },
    orderBy: [{ isBuiltIn: 'desc' }, { category: 'asc' }, { name: 'asc' }],
  })

  return NextResponse.json(templates)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, description, category, items, venueId } = body as {
    name: string
    description?: string
    category?: string
    items: IncomingItem[]
    venueId?: string | null
  }

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'At least one task item is required' }, { status: 400 })
  }

  // Managers can only create templates scoped to their own venue.
  const scopedVenueId =
    session.user.role === 'MANAGER' ? session.user.venueId : venueId ?? null

  const template = await prisma.taskTemplate.create({
    data: {
      name: String(name).toUpperCase().trim(),
      description: description?.trim() ?? null,
      category: category ? String(category).toUpperCase().trim() : null,
      isBuiltIn: false,
      venueId: scopedVenueId,
      items: {
        create: items.map((item, i) => ({
          title: String(item.title).toUpperCase().trim(),
          description: item.description?.trim() ?? null,
          completionType: (item.completionType as never) ?? 'TICK',
          scheduleType: (item.scheduleType as never) ?? 'DAILY',
          scheduleDays: item.scheduleType === 'WEEKLY' ? item.scheduleDays ?? [] : [],
          sortOrder: i,
        })),
      },
    },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  })

  return NextResponse.json(template, { status: 201 })
}
