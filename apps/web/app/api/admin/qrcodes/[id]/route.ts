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
  const { isActive, regenerate } = body

  const updates: Record<string, unknown> = {}
  if (isActive !== undefined) updates.isActive = isActive
  if (regenerate) updates.token = crypto.randomUUID()

  const code = await prisma.qRCode.update({
    where: { id: params.id },
    data: updates,
  })

  return NextResponse.json(code)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.qRCode.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), isActive: false },
  })

  return NextResponse.json({ success: true })
}
