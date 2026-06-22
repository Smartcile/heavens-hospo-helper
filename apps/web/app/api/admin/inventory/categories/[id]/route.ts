import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

interface Params { params: { id: string } }

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cat = await prisma.inventoryCategory.findFirst({
    where: { id: params.id, deletedAt: null },
  })
  if (!cat) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (cat.isBuiltIn) {
    return NextResponse.json({ error: 'CANNOT DELETE BUILT-IN CATEGORY' }, { status: 400 })
  }
  if (session.user.role === 'MANAGER' && cat.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const count = await prisma.inventoryItem.count({
    where: { categoryId: params.id, deletedAt: null },
  })
  if (count > 0) {
    return NextResponse.json({ error: `CATEGORY HAS ${count} ITEM(S) — REMOVE THEM FIRST` }, { status: 400 })
  }

  await prisma.inventoryCategory.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), isActive: false },
  })
  return NextResponse.json({ success: true })
}
