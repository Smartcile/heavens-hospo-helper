import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { status } = body as { status: 'DRAFT' | 'PUBLISHED' }

  if (status !== 'DRAFT' && status !== 'PUBLISHED') {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const guide = await prisma.guide.update({
    where: { id: params.id },
    data: { status },
  })

  return NextResponse.json(guide)
}
