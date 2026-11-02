import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'

const FIELDS = [
  'payFrequency', 'minimumWage', 'accRate', 'kiwiSaverEmployerRate', 'studentLoanRate',
  'holidayPayPct', 'defaultTaxCode', 'overtimeEnabled', 'overtimeHoursPerWeek', 'overtimeRate',
] as const

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.payroll.view')
  if (denied) return denied

  const venueId = req.nextUrl.searchParams.get('venueId') || session.user.venueId
  const settings = await prisma.payrollSettings.findUnique({ where: { venueId } })

  return NextResponse.json(settings ?? { venueId, payFrequency: 'WEEKLY', minimumWage: 23.5, accRate: 1.47, kiwiSaverEmployerRate: 3, studentLoanRate: 12, holidayPayPct: 8, defaultTaxCode: 'M', overtimeEnabled: false, overtimeHoursPerWeek: 40, overtimeRate: 1.5 })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.payroll.view')
  if (denied) return denied

  const body = await req.json()
  const venueId = body.venueId || session.user.venueId

  const data: Record<string, unknown> = {}
  for (const f of FIELDS) {
    if (body[f] !== undefined) data[f] = body[f]
  }

  const settings = await prisma.payrollSettings.upsert({
    where: { venueId },
    update: data,
    create: { venueId, ...data },
  })

  return NextResponse.json(settings)
}
