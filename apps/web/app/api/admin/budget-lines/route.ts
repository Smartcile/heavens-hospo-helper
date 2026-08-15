import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.budget.view')
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const year = Number(searchParams.get('year'))
  const month = Number(searchParams.get('month'))
  const venueId = searchParams.get('venueId')
  const venueScope = session.user.role === 'MANAGER' ? session.user.venueId : venueId || undefined

  if (!venueScope || !year || !month) {
    return NextResponse.json({ period: null, lines: [], sections: [] })
  }

  const period = await prisma.budgetPeriod.findFirst({
    where: { venueId: venueScope, year, month, deletedAt: null },
    select: { id: true, totalBudget: true },
  })

  const [lines, sections] = await Promise.all([
    prisma.budgetLine.findMany({
      where: { budgetPeriodId: period?.id ?? '__none__', deletedAt: null },
      include: { section: { select: { id: true, name: true } } },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.section.findMany({
      where: { venueId: venueScope, deletedAt: null, isActive: true },
      select: { id: true, name: true, departmentId: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return NextResponse.json({
    period,
    lines: lines.map((l) => ({
      id: l.id,
      name: l.name,
      kind: l.kind,
      parentId: l.parentId,
      sectionId: l.sectionId,
      sectionName: l.section?.name ?? null,
      amount: l.amount,
      sortOrder: l.sortOrder,
    })),
    sections,
  })
}

const LINE_KINDS = ['GROUP', 'LINE', 'TOTAL'] as const
type LineKind = (typeof LINE_KINDS)[number]

function isLineKind(value: unknown): value is LineKind {
  return LINE_KINDS.includes(value as LineKind)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.budget.edit')
  if (denied) return denied

  const body = await req.json()
  const { venueId, year, month, name, kind, parentId, sectionId, amount } = body as {
    venueId?: string
    year: number
    month: number
    name: string
    kind: unknown
    parentId?: string | null
    sectionId?: string | null
    amount?: number | null
  }

  if (!name?.trim() || !isLineKind(kind)) {
    return NextResponse.json({ error: 'name and kind are required' }, { status: 400 })
  }
  const venueScope = session.user.role === 'MANAGER' ? session.user.venueId : venueId
  if (!venueScope || !year || !month) {
    return NextResponse.json({ error: 'venue, year and month are required' }, { status: 400 })
  }

  const period = await prisma.budgetPeriod.upsert({
    where: { venueId_year_month: { venueId: venueScope, year, month } },
    update: { deletedAt: null },
    create: { venueId: venueScope, year, month, totalBudget: 0 },
  })

  if (parentId) {
    const parent = await prisma.budgetLine.findFirst({
      where: { id: parentId, budgetPeriodId: period.id, deletedAt: null },
    })
    if (!parent) return NextResponse.json({ error: 'Parent line not found in this period' }, { status: 400 })
  }

  let section = null
  if (sectionId) {
    section = await prisma.section.findFirst({
      where: { id: sectionId, venueId: venueScope, deletedAt: null },
    })
    if (!section) return NextResponse.json({ error: 'Section not found in this venue' }, { status: 400 })
  }

  const maxOrder = await prisma.budgetLine.aggregate({
    where: { budgetPeriodId: period.id },
    _max: { sortOrder: true },
  })

  const line = await prisma.budgetLine.create({
    data: {
      budgetPeriodId: period.id,
      parentId: parentId ?? null,
      sectionId: section?.id ?? null,
      name: name.toUpperCase().trim(),
      kind,
      amount: kind === 'LINE' ? (Number(amount) || 0) : null,
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
    },
  })

  return NextResponse.json({ line }, { status: 201 })
}
