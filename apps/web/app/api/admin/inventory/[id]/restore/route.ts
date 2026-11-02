import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, _req, 'ops.inventory.restore')
  if (denied) return denied

  const item = await prisma.inventoryItem.findFirst({
    where: { id: params.id, deletedAt: { not: null } },
  })
  if (!item) return NextResponse.json({ error: 'Not found or not deleted' }, { status: 404 })

  await prisma.inventoryItem.update({
    where: { id: params.id },
    data: { deletedAt: null },
  })

  return NextResponse.json({ ok: true })
}
