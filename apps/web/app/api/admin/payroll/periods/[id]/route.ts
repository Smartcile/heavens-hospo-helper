import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { generatePayPeriod } from '@/lib/payroll'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const period = await prisma.payPeriod.findUnique({ where: { id: params.id } })
  if (!period || period.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const entries = await prisma.payrollEntry.findMany({
    where: { payPeriodId: params.id, deletedAt: null },
    include: { staff: { select: { firstName: true, lastName: true, employmentType: true } } },
    orderBy: { totalPay: 'desc' },
  })

  return NextResponse.json(entries)
}

export async function PUT(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const period = await prisma.payPeriod.findUnique({ where: { id: params.id } })
  if (!period || period.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const startDate = new Date(period.startDate)
  const endDate = new Date(period.endDate)
  endDate.setHours(23, 59, 59, 999)

  const count = await generatePayPeriod(params.id, period.venueId, startDate, endDate)

  return NextResponse.json({ success: true, entryCount: count })
}
