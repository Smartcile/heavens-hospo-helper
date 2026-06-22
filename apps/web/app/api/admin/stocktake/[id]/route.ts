import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

interface Params { params: { id: string } }

export async function GET(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const record = await prisma.stocktakeRecord.findFirst({
    where: { id: params.id, deletedAt: null },
    include: {
      completedBy: { select: { id: true, firstName: true, lastName: true } },
      assignedStaff: { select: { id: true, firstName: true, lastName: true } },
      lineItems: {
        include: { item: { include: { category: true } } },
        orderBy: { item: { name: 'asc' } },
      },
    },
  })
  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(record)
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  if (body.status === 'COMPLETED') {
    body.completedById = session.user.id
    body.completedAt = new Date()
  }

  const updated = await prisma.stocktakeRecord.update({
    where: { id: params.id },
    data: {
      ...(body.status && { status: body.status }),
      ...(body.notes !== undefined && { notes: body.notes }),
      ...(body.completedById && { completedById: body.completedById }),
      ...(body.completedAt && { completedAt: body.completedAt }),
      ...(body.assignedRoleId !== undefined && { assignedRoleId: body.assignedRoleId || null }),
      ...(body.assignedStaffId !== undefined && { assignedStaffId: body.assignedStaffId || null }),
    },
  })
  return NextResponse.json(updated)
}
