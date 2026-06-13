import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

interface Params {
  params: { id: string }
}

interface IncomingAllocation {
  id: string
  amount: number
  isWorkingDay: boolean
  note?: string | null
}

// Bulk save: the period total plus all day allocations in one call.
export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const period = await prisma.budgetPeriod.findUnique({ where: { id: params.id } })
  if (!period) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && period.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { totalBudget, label, allocations } = body as {
    totalBudget?: number
    label?: string
    allocations?: IncomingAllocation[]
  }

  const workingDays = (allocations ?? []).filter((a) => a.isWorkingDay).length

  await prisma.$transaction([
    prisma.budgetPeriod.update({
      where: { id: params.id },
      data: {
        ...(totalBudget !== undefined ? { totalBudget: Number(totalBudget) || 0 } : {}),
        ...(label !== undefined ? { label: label?.trim() || null } : {}),
        ...(allocations ? { workingDays } : {}),
      },
    }),
    ...(allocations ?? []).map((a) =>
      prisma.budgetDayAllocation.update({
        where: { id: a.id },
        data: {
          amount: Number(a.amount) || 0,
          isWorkingDay: !!a.isWorkingDay,
          note: a.note?.trim() || null,
        },
      })
    ),
  ])

  const full = await prisma.budgetPeriod.findUnique({
    where: { id: params.id },
    include: { allocations: { orderBy: { date: 'asc' } } },
  })
  return NextResponse.json({ period: full })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const period = await prisma.budgetPeriod.findUnique({ where: { id: params.id } })
  if (!period) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && period.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.budgetPeriod.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
