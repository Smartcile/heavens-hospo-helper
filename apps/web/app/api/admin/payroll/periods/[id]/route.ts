import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { generatePayPeriod } from '@/lib/payroll'
import { guardAccess } from '@/lib/permissions'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, _req, 'team.payroll.view')
  if (denied) return denied

  const period = await prisma.payPeriod.findUnique({
    where: { id: params.id },
    include: { alternativeDays: { select: { id: true, staffId: true, accruedOn: true, takenOn: true } } },
  })
  if (!period || period.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const entries = await prisma.payrollEntry.findMany({
    where: { payPeriodId: params.id, deletedAt: null },
    include: {
      staff: {
        select: {
          firstName: true,
          lastName: true,
          employmentType: true,
          taxCode: true,
          kiwiSaverRate: true,
          studentLoan: true,
          hourlyRate: true,
        },
      },
    },
    orderBy: { totalPay: 'desc' },
  })

  return NextResponse.json({ period, entries })
}

export async function PUT(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, _req, 'team.payroll.close')
  if (denied) return denied

  const period = await prisma.payPeriod.findUnique({ where: { id: params.id } })
  if (!period || period.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const startDate = new Date(period.startDate)
  const endDate = new Date(period.endDate)

  const count = await generatePayPeriod(params.id, period.venueId, startDate, endDate, session.user.id)

  return NextResponse.json({ success: true, entryCount: count })
}

// Mark a CLOSED period as PAID (the final stamp in the workflow).
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, _req, 'team.payroll.markpaid')
  if (denied) return denied

  const period = await prisma.payPeriod.findUnique({ where: { id: params.id } })
  if (!period || period.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (period.status !== 'CLOSED') return NextResponse.json({ error: 'CLOSE THE PERIOD FIRST' }, { status: 409 })

  const updated = await prisma.payPeriod.update({
    where: { id: params.id },
    data: { paidAt: new Date() },
  })

  return NextResponse.json(updated)
}
