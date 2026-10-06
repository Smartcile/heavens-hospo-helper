import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, Prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { getManagerVenueId } from '@/lib/venue-scope'
import { cleanCashCounts, cleanShares } from '@/lib/tips'

interface Params {
  params: { id: string }
}

/** "YYYY-MM-DD" (or ISO) → a UTC-midnight Date, or null when unparseable. */
function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value) return null
  const date = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** The period must exist, be live, and be in the caller's venue. */
async function loadScoped(id: string, role: string, managerVenueId: string | null) {
  const period = await prisma.tipsPeriod.findUnique({
    where: { id },
    select: { id: true, venueId: true, deletedAt: true },
  })
  if (!period || period.deletedAt) return { error: 'Not found', status: 404 as const }
  if (role === 'MANAGER' && managerVenueId && period.venueId !== managerVenueId) {
    return { error: 'Forbidden', status: 403 as const }
  }
  return { period }
}

export async function GET(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.tips.view')
  if (denied) return denied

  const period = await prisma.tipsPeriod.findUnique({ where: { id: params.id } })
  if (!period || period.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(period)
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.tips.edit')
  if (denied) return denied

  const scoped = await loadScoped(params.id, session.user.role, getManagerVenueId(session, req))
  if ('error' in scoped) return NextResponse.json({ error: scoped.error }, { status: scoped.status })

  const body = await req.json()
  const data: Record<string, unknown> = {}

  if (body.label !== undefined) {
    data.label = typeof body.label === 'string' && body.label.trim() ? body.label.trim().toUpperCase() : null
  }
  if (body.fromDate !== undefined) {
    const from = parseDate(body.fromDate)
    if (!from) return NextResponse.json({ error: 'Invalid fromDate' }, { status: 400 })
    data.fromDate = from
  }
  if (body.toDate !== undefined) {
    const to = parseDate(body.toDate)
    if (!to) return NextResponse.json({ error: 'Invalid toDate' }, { status: 400 })
    data.toDate = to
  }
  if (body.cashCounts !== undefined) {
    data.cashCounts = cleanCashCounts(body.cashCounts) as unknown as Prisma.InputJsonValue
  }
  if (body.posTotal !== undefined) data.posTotal = Number(body.posTotal) || 0
  if (body.shares !== undefined) {
    data.shares = cleanShares(body.shares) as unknown as Prisma.InputJsonValue
  }
  if (body.notes !== undefined) {
    data.notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null
  }

  const period = await prisma.tipsPeriod.update({ where: { id: params.id }, data })
  return NextResponse.json(period)
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.tips.delete')
  if (denied) return denied

  const scoped = await loadScoped(params.id, session.user.role, getManagerVenueId(session, req))
  if ('error' in scoped) return NextResponse.json({ error: scoped.error }, { status: scoped.status })

  await prisma.tipsPeriod.update({ where: { id: params.id }, data: { deletedAt: new Date() } })
  return NextResponse.json({ success: true })
}
