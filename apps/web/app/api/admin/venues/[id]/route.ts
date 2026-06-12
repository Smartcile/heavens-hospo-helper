import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

interface Params {
  params: { id: string }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { name, address, timezone, isActive } = body

  const venue = await prisma.venue.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined ? { name: String(name).toUpperCase().trim() } : {}),
      ...(address !== undefined ? { address: address?.trim() ?? null } : {}),
      ...(timezone !== undefined ? { timezone } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    },
  })

  return NextResponse.json(venue)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.venue.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), isActive: false },
  })

  return NextResponse.json({ success: true })
}
