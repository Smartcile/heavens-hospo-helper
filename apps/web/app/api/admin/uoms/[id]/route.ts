import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const uom = await prisma.unitOfMeasure.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true, venueId: true, isBuiltIn: true },
  })
  if (!uom) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (uom.isBuiltIn) return NextResponse.json({ error: 'Built-in units cannot be edited' }, { status: 403 })
  if (session.user.role === 'MANAGER' && uom.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { name, baseUnit, conversionRatio, kind } = await req.json()
  const data: Record<string, unknown> = {}
  if (name !== undefined) data.name = String(name).toUpperCase().trim()
  if (baseUnit !== undefined) data.baseUnit = String(baseUnit).toLowerCase().trim()
  if (conversionRatio !== undefined) data.conversionRatio = parseFloat(String(conversionRatio)) || 1
  if (kind !== undefined && ['VOLUME', 'MASS', 'COUNT'].includes(kind)) data.kind = kind

  const updated = await prisma.unitOfMeasure.update({ where: { id: params.id }, data })
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const uom = await prisma.unitOfMeasure.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true, venueId: true, isBuiltIn: true },
  })
  if (!uom) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (uom.isBuiltIn) return NextResponse.json({ error: 'Built-in units cannot be deleted' }, { status: 403 })
  if (session.user.role === 'MANAGER' && uom.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.unitOfMeasure.update({ where: { id: params.id }, data: { deletedAt: new Date() } })
  return NextResponse.json({ success: true })
}
