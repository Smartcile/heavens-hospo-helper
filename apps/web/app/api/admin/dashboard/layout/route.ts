import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, Prisma } from '@hospo-ops/db'
import { DEFAULT_WIDGET_ORDER, parseDashboardLayout } from '@/lib/dashboard-widgets'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const staff = await prisma.staff.findUnique({
    where: { id: session.user.id },
    select: { dashboardLayout: true },
  })
  return NextResponse.json(parseDashboardLayout(staff?.dashboardLayout))
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  // A layout with no order and no hidden list is just the default — store null.
  const clean = parseDashboardLayout(body)
  const isDefault =
    clean.hidden.length === 0 &&
    clean.order.every((id, i) => id === DEFAULT_WIDGET_ORDER[i])
  const layout = isDefault ? null : clean

  await prisma.staff.update({
    where: { id: session.user.id },
    data: { dashboardLayout: layout === null ? Prisma.DbNull : (layout as unknown as Prisma.InputJsonValue) },
  })
  return NextResponse.json({ layout: clean })
}
