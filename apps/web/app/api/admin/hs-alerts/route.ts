import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

// List alerts (venue-scoped, filters) / manually raise an alert (e.g. a pest
// sighting or a delivery problem spotted after the fact).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const venueId = searchParams.get('venueId') ?? (session.user.role === 'MANAGER' ? session.user.venueId : undefined)
  const status = searchParams.get('status') ?? 'OPEN'
  const severity = searchParams.get('severity')
  const kind = searchParams.get('kind')

  const where: Record<string, unknown> = {
    venueId,
    deletedAt: null,
    status: status === 'ALL' ? { in: ['OPEN', 'RESOLVED'] } : status,
  }
  if (severity) where.severity = severity
  if (kind) where.kind = kind

  const alerts = await prisma.hsAlert.findMany({
    where,
    include: {
      task: { select: { id: true, title: true } },
      deliveryItem: { select: { id: true, itemName: true, temp: true } },
      resolvedBy: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 200,
  })

  return NextResponse.json(alerts)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const venueId = session.user.role === 'MANAGER' ? session.user.venueId : body.venueId
  if (!venueId || !body.message) {
    return NextResponse.json({ error: 'venueId and message are required' }, { status: 400 })
  }

  const alert = await prisma.hsAlert.create({
    data: {
      venueId,
      taskId: body.taskId ?? null,
      severity: body.severity ?? 'WARNING',
      kind: body.kind ?? 'OUT_OF_RANGE',
      message: String(body.message),
      value: body.value != null && Number.isFinite(body.value) ? Number(body.value) : null,
    },
  })

  return NextResponse.json(alert, { status: 201 })
}
