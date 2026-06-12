import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

interface Params {
  params: { id: string }
}

interface IncomingItem {
  title: string
  description?: string | null
  completionType?: string
  scheduleType?: string
  scheduleDays?: number[]
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.taskTemplate.findUnique({ where: { id: params.id } })
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }
  if (existing.isBuiltIn) {
    return NextResponse.json({ error: 'Built-in templates cannot be edited' }, { status: 403 })
  }
  if (session.user.role === 'MANAGER' && existing.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { name, description, category, items } = body as {
    name?: string
    description?: string
    category?: string
    items?: IncomingItem[]
  }

  const template = await prisma.taskTemplate.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined ? { name: String(name).toUpperCase().trim() } : {}),
      ...(description !== undefined ? { description: description?.trim() ?? null } : {}),
      ...(category !== undefined
        ? { category: category ? String(category).toUpperCase().trim() : null }
        : {}),
      ...(items !== undefined
        ? {
            items: {
              deleteMany: {},
              create: items.map((item, i) => ({
                title: String(item.title).toUpperCase().trim(),
                description: item.description?.trim() ?? null,
                completionType: (item.completionType as never) ?? 'TICK',
                scheduleType: (item.scheduleType as never) ?? 'DAILY',
                scheduleDays: item.scheduleType === 'WEEKLY' ? item.scheduleDays ?? [] : [],
                sortOrder: i,
              })),
            },
          }
        : {}),
    },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  })

  return NextResponse.json(template)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.taskTemplate.findUnique({ where: { id: params.id } })
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }
  if (existing.isBuiltIn) {
    return NextResponse.json({ error: 'Built-in templates cannot be deleted' }, { status: 403 })
  }
  if (session.user.role === 'MANAGER' && existing.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.taskTemplate.update({
    where: { id: params.id },
    data: { deletedAt: new Date() },
  })

  return NextResponse.json({ success: true })
}
