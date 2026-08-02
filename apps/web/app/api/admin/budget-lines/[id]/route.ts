import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

interface Params {
  params: { id: string }
}

const LINE_KINDS = ['GROUP', 'LINE', 'TOTAL'] as const

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const line = await prisma.budgetLine.findFirst({
    where: { id: params.id, deletedAt: null },
    include: { period: { select: { venueId: true } } },
  })
  if (!line) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && line.period.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { name, kind, sectionId, parentId, amount } = body as {
    name?: string
    kind?: unknown
    sectionId?: string | null
    parentId?: string | null
    amount?: number | null
  }

  if (kind !== undefined && !LINE_KINDS.includes(kind as (typeof LINE_KINDS)[number])) {
    return NextResponse.json({ error: 'Invalid kind' }, { status: 400 })
  }
  if (parentId === params.id) {
    return NextResponse.json({ error: 'A line cannot be its own parent' }, { status: 400 })
  }

  if (parentId) {
    const parent = await prisma.budgetLine.findFirst({
      where: { id: parentId, budgetPeriodId: line.budgetPeriodId, deletedAt: null },
    })
    if (!parent) return NextResponse.json({ error: 'Parent line not found in this period' }, { status: 400 })
  }

  let section = null
  if (sectionId) {
    section = await prisma.section.findFirst({
      where: { id: sectionId, venueId: line.period.venueId, deletedAt: null },
    })
    if (!section) return NextResponse.json({ error: 'Section not found in this venue' }, { status: 400 })
  }

  const nextKind = (kind as (typeof LINE_KINDS)[number] | undefined) ?? line.kind
  const updated = await prisma.budgetLine.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined ? { name: name.toUpperCase().trim() } : {}),
      ...(kind !== undefined ? { kind: nextKind } : {}),
      ...(sectionId !== undefined ? { sectionId: section?.id ?? null } : {}),
      ...(parentId !== undefined ? { parentId: parentId ?? null } : {}),
      ...(amount !== undefined || nextKind !== 'LINE' ? { amount: nextKind === 'LINE' ? (Number(amount) || 0) : null } : {}),
    },
  })

  return NextResponse.json({ line: updated })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const line = await prisma.budgetLine.findFirst({
    where: { id: params.id, deletedAt: null },
    include: { period: { select: { venueId: true } } },
  })
  if (!line) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && line.period.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Soft-delete the line and its whole subtree so no orphans are left behind.
  const all = await prisma.budgetLine.findMany({
    where: { budgetPeriodId: line.budgetPeriodId, deletedAt: null },
    select: { id: true, parentId: true },
  })
  const byParent = new Map<string, string[]>()
  for (const l of all) {
    if (l.parentId) {
      const list = byParent.get(l.parentId) ?? []
      list.push(l.id)
      byParent.set(l.parentId, list)
    }
  }
  const doomed = new Set<string>([params.id])
  const queue = [params.id]
  while (queue.length > 0) {
    const current = queue.pop()!
    for (const child of byParent.get(current) ?? []) {
      if (!doomed.has(child)) {
        doomed.add(child)
        queue.push(child)
      }
    }
  }

  await prisma.budgetLine.updateMany({
    where: { id: { in: Array.from(doomed) } },
    data: { deletedAt: new Date() },
  })
  return NextResponse.json({ success: true, deleted: doomed.size })
}
