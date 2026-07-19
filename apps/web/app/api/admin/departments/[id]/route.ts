import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

interface Params {
  params: { id: string }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, colour, isActive, linkedDepartmentIds } = body

  const dept = await prisma.department.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined ? { name: String(name).toUpperCase().trim() } : {}),
      ...(colour !== undefined ? { colour } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    },
  })

  // Sync linked departments
  if (linkedDepartmentIds !== undefined) {
    const ids: string[] = Array.isArray(linkedDepartmentIds) ? linkedDepartmentIds : []
    await prisma.departmentLink.deleteMany({ where: { fromDepartmentId: params.id } })
    if (ids.length > 0) {
      await prisma.departmentLink.createMany({
        data: ids.map((toId) => ({ fromDepartmentId: params.id, toDepartmentId: toId })),
      })
    }
  }

  return NextResponse.json(dept)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.department.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), isActive: false },
  })

  return NextResponse.json({ success: true })
}
